-- ============================================================================
-- Trippin v2 — 0001 core schema
-- ----------------------------------------------------------------------------
-- Combina o modelo funcional de A (TrippinClaude) com o padrão de segurança e
-- performance de B (Trippin-Claude-Skills):
--   · funções auxiliares no schema `private` (não exposto pela API REST)
--   · uuid para entidades alcançáveis por URL/código; bigint para tabelas filhas
--   · índice em toda FK, CHECK constraint em todo domínio fechado
--   · updated_at por trigger (nunca pelo cliente) — base do last-write-wins
--   · legacy_id em toda entidade migrável, para migração idempotente (Fase 3)
--
-- Aplicar em staging antes de prod. RLS vai no 0002, RPCs no 0003, Storage no 0004.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Utilitários
-- ----------------------------------------------------------------------------

-- updated_at automático. O cliente nunca seta esta coluna: se setasse, poderia
-- forjar o vencedor de um conflito de sincronização offline.
create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Código público de 12 caracteres, alfabeto Crockford sem I/L/O/U (evita confusão
-- na leitura e no ditado por telefone). Aleatoriedade criptográfica: ao contrário
-- do projeto A, o código NÃO é derivado do id — é um segredo próprio e rotacionável.
create or replace function private.generate_trip_code()
returns text language plpgsql as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  taken boolean;
begin
  loop
    candidate := '';
    for i in 1..12 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    select exists(select 1 from public.trips where code = candidate) into taken;
    exit when not taken;
  end loop;
  return candidate;
end;
$$;

create or replace function private.generate_user_code()
returns text language plpgsql as $$
declare
  candidate text;
  taken boolean;
begin
  loop
    candidate := lpad(((get_byte(extensions.gen_random_bytes(3), 0) * 65536
                     + get_byte(extensions.gen_random_bytes(3), 1) * 256
                     + get_byte(extensions.gen_random_bytes(3), 2)) % 1000000)::text, 6, '0');
    select exists(select 1 from public.profiles where user_code = candidate) into taken;
    exit when not taken;
  end loop;
  return candidate;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles — espelha auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  -- separados (não um `name` único): a UI de A (app/index.html) sempre tratou
  -- nome e sobrenome como campos distintos — formulário, saudação, remetente
  -- de convite. Um campo único exigiria dividir a string de volta na UI, o
  -- que quebra silenciosamente para nomes compostos.
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text not null default '',
  cpf         text not null default '',          -- sempre opcional (LGPD: minimização)
  birth       date,
  photo_path  text,                              -- Storage, nunca base64
  user_code   text not null unique,
  language    text not null default 'pt-BR',
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is
  'CPF opcional por decisão de minimização. Senha vive só no auth.users (bcrypt) — nunca aqui, nunca no cliente.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Perfil criado automaticamente no signup.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, user_code)
  values (new.id, new.email, private.generate_user_code());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ----------------------------------------------------------------------------
-- trips
-- ----------------------------------------------------------------------------
create table public.trips (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default private.generate_trip_code(),
  code_expires_at timestamptz,
  name            text not null check (length(trim(name)) > 0),
  start_date      date not null,
  end_date        date not null,
  status          text not null default 'active'
                    check (status in ('active', 'past', 'archived')),
  destinations    jsonb not null default '[]'::jsonb,
  city_overrides  jsonb not null default '{}'::jsonb,
  created_by      uuid not null references public.profiles (id),
  legacy_id       text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint trips_end_after_start check (end_date >= start_date)
);

create index trips_created_by_idx on public.trips (created_by);
create index trips_code_idx       on public.trips (code);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- trip_members
-- ----------------------------------------------------------------------------
create table public.trip_members (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'convidado'
               check (role in ('admin', 'coadmin', 'convidado')),
  join_via   text not null default 'code'
               check (join_via in ('creator', 'code', 'email')),
  joined_at  timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index trip_members_trip_id_idx on public.trip_members (trip_id);
create index trip_members_user_id_idx on public.trip_members (user_id);

-- Quem cria a viagem entra como admin (mesma regra do estado local de A).
create or replace function private.add_trip_creator_as_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role, join_via)
  values (new.id, new.created_by, 'admin', 'creator');
  perform private.log_event(new.id, 'trip_created', jsonb_build_object('name', new.name));
  return new;
end;
$$;

create trigger on_trip_created
  after insert on public.trips
  for each row execute function private.add_trip_creator_as_admin();

-- ----------------------------------------------------------------------------
-- Funções de autorização — base de toda a RLS do 0002
-- ----------------------------------------------------------------------------
create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_trip_admin(p_trip_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id
      and user_id = (select auth.uid())
      and role in ('admin', 'coadmin')
  );
$$;

revoke execute on function private.is_trip_member(uuid) from public, anon;
revoke execute on function private.is_trip_admin(uuid)  from public, anon;
grant  execute on function private.is_trip_member(uuid) to authenticated;
grant  execute on function private.is_trip_admin(uuid)  to authenticated;

-- ----------------------------------------------------------------------------
-- invites — convite por e-mail e pedido de ingresso por código
-- ----------------------------------------------------------------------------
create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  email         text,
  requester_id  uuid references public.profiles (id) on delete cascade,
  channel       text not null check (channel in ('email', 'code')),
  status        text not null default 'pending-response'
                  check (status in ('pending-response','pending-approval','accepted','denied','cancelled','expired')),
  token         text unique,
  sent_at       timestamptz not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '14 days'),
  legacy_id     text unique,
  constraint invites_target_present
    check ((channel = 'email' and email is not null)
        or (channel = 'code'  and requester_id is not null))
);

create index invites_trip_id_idx      on public.invites (trip_id);
create index invites_requester_id_idx on public.invites (requester_id);
create index invites_email_idx        on public.invites (lower(email));

-- ----------------------------------------------------------------------------
-- activities — cronograma
-- ----------------------------------------------------------------------------
create table public.activities (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  place       text not null default '',
  kind        text not null default 'other'
                check (kind in ('flight','lodging','food','tour','transport','other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  notes       text not null default '',
  source      text not null default 'manual' check (source in ('manual','doc')),
  doc_id      bigint,                            -- FK adicionada após criar docs
  sort_order  integer not null default 0,
  created_by  uuid not null references public.profiles (id),
  legacy_id   text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint activities_end_after_start check (ends_at is null or ends_at >= starts_at)
);

create index activities_trip_id_idx    on public.activities (trip_id, starts_at);
create index activities_trip_sort_idx  on public.activities (trip_id, sort_order);
create index activities_created_by_idx on public.activities (created_by);
create index activities_doc_id_idx     on public.activities (doc_id);

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function private.set_updated_at();

create table public.activity_participants (
  id           bigint generated always as identity primary key,
  activity_id  bigint not null references public.activities (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  unique (activity_id, user_id)
);

create index activity_participants_activity_idx on public.activity_participants (activity_id);
create index activity_participants_user_idx     on public.activity_participants (user_id);

-- ----------------------------------------------------------------------------
-- docs — passagens, hospedagens e anexos (interpretadores de A)
-- ----------------------------------------------------------------------------
create table public.docs (
  id            bigint generated always as identity primary key,
  trip_id       uuid not null references public.trips (id) on delete cascade,
  uploaded_by   uuid not null references public.profiles (id),
  kind          text not null check (kind in ('ticket','lodging','other')),
  source        text not null default 'upload' check (source in ('upload','search','legacy')),
  name          text not null default '',
  storage_path  text,                            -- null quando vem de busca (E21) ou legado
  parsed        jsonb not null default '{}'::jsonb,
  legacy_id     text unique,
  uploaded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column public.docs.parsed is
  'Saída do interpretador (localizador, cia, hóspede, endereço, preço). Contém PII: nunca exposto fora da viagem.';

create index docs_trip_id_idx     on public.docs (trip_id);
create index docs_uploaded_by_idx on public.docs (uploaded_by);

create trigger docs_set_updated_at
  before update on public.docs
  for each row execute function private.set_updated_at();

alter table public.activities
  add constraint activities_doc_id_fkey
  foreign key (doc_id) references public.docs (id) on delete set null;

-- Trechos de voo extraídos: origem, escalas e destino viram linhas, não jsonb,
-- porque o Mapa e o Cronograma de A consultam trecho a trecho.
create table public.doc_legs (
  id            bigint generated always as identity primary key,
  doc_id        bigint not null references public.docs (id) on delete cascade,
  leg_index     integer not null,
  from_city     text not null default '',
  from_iata     text,
  to_city       text not null default '',
  to_iata       text,
  departs_at    timestamptz,
  arrives_at    timestamptz,
  airline       text,
  flight_number text,
  locator       text,
  unique (doc_id, leg_index)
);

create index doc_legs_doc_id_idx on public.doc_legs (doc_id);

-- ----------------------------------------------------------------------------
-- Galeria
-- ----------------------------------------------------------------------------
create table public.albums (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null,
  legacy_id  text unique,
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

create index albums_trip_id_idx on public.albums (trip_id);

create table public.photos (
  id           bigint generated always as identity primary key,
  trip_id      uuid not null references public.trips (id) on delete cascade,
  album_id     bigint references public.albums (id) on delete set null,
  uploaded_by  uuid not null references public.profiles (id),
  storage_path text not null,
  legacy_id    text unique,
  created_at   timestamptz not null default now()
);

create index photos_trip_id_idx     on public.photos (trip_id);
create index photos_album_id_idx    on public.photos (album_id);
create index photos_uploaded_by_idx on public.photos (uploaded_by);

-- ----------------------------------------------------------------------------
-- Despesas — multi-moeda, sem conversão automática
-- ----------------------------------------------------------------------------
create table public.expenses (
  id            bigint generated always as identity primary key,
  trip_id       uuid not null references public.trips (id) on delete cascade,
  activity_id   bigint references public.activities (id) on delete set null,
  description   text not null check (length(trim(description)) > 0),
  amount        numeric(12,2) not null check (amount > 0),
  currency      text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  split_method  text not null default 'equal' check (split_method in ('equal','custom','fixed')),
  paid_by       uuid not null references public.profiles (id),
  needs_review  boolean not null default false,   -- migração não resolveu o pagador
  notes         text not null default '',
  legacy_id     text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index expenses_trip_id_idx     on public.expenses (trip_id);
create index expenses_activity_id_idx on public.expenses (activity_id);
create index expenses_paid_by_idx     on public.expenses (paid_by);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();

create table public.expense_shares (
  id           bigint generated always as identity primary key,
  expense_id   bigint not null references public.expenses (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  settled      boolean not null default false,
  unique (expense_id, user_id)
);

create index expense_shares_expense_idx on public.expense_shares (expense_id);
create index expense_shares_user_idx    on public.expense_shares (user_id);

-- ----------------------------------------------------------------------------
-- audit_log — populado só por trigger/função (o auditado não escreve o log)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  action     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_trip_id_idx on public.audit_log (trip_id, created_at desc);

create or replace function private.log_event(p_trip uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (trip_id, user_id, action, payload)
  values (p_trip, (select auth.uid()), p_action, coalesce(p_payload, '{}'::jsonb));
$$;

-- ----------------------------------------------------------------------------
-- notifications — também só por trigger
-- ----------------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('member_joined','expense_impact','schedule_conflict','invite_pending')),
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Novo integrante: avisa todo mundo que já está na viagem.
create or replace function private.notify_member_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (trip_id, user_id, type, payload)
  select new.trip_id, tm.user_id, 'member_joined',
         jsonb_build_object('new_member', new.user_id)
  from public.trip_members tm
  where tm.trip_id = new.trip_id and tm.user_id <> new.user_id;
  return new;
end;
$$;

create trigger on_member_joined
  after insert on public.trip_members
  for each row execute function private.notify_member_joined();

-- Despesa nova: avisa quem entrou no rateio.
create or replace function private.notify_expense_impact()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.expenses where id = new.expense_id;
  if new.user_id <> (select auth.uid()) then
    insert into public.notifications (trip_id, user_id, type, payload)
    values (v_trip, new.user_id, 'expense_impact',
            jsonb_build_object('expense_id', new.expense_id, 'amount', new.share_amount));
  end if;
  return new;
end;
$$;

create trigger on_expense_share_created
  after insert on public.expense_shares
  for each row execute function private.notify_expense_impact();

-- ----------------------------------------------------------------------------
-- client_errors — telemetria. Ninguém tem SELECT: consulta só via acesso direto
-- ao banco, para que o stack trace de um usuário nunca vaze para outro.
-- ----------------------------------------------------------------------------
create table public.client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  message    text not null,
  stack      text,
  context    jsonb not null default '{}'::jsonb,
  user_agent text,
  url        text,
  created_at timestamptz not null default now()
);

create index client_errors_user_idx    on public.client_errors (user_id);
create index client_errors_created_idx on public.client_errors (created_at desc);

-- ----------------------------------------------------------------------------
-- rate_limits — suporte ao limite de taxa das Edge Functions pagas
-- ----------------------------------------------------------------------------
create table public.rate_limits (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  action   text not null,
  window_start timestamptz not null default date_trunc('hour', now()),
  count    integer not null default 1,
  unique (user_id, action, window_start)
);

create index rate_limits_lookup_idx on public.rate_limits (user_id, action, window_start);
