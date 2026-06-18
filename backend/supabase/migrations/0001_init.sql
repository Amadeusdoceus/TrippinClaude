-- ================================================================
-- Trippin — schema inicial (Supabase / Postgres)
-- ================================================================
-- Tudo abaixo é idempotente: pode ser reaplicado sem dar erro.
-- A autenticação fica em auth.users (built-in do Supabase).
-- A tabela "users" abaixo é o PERFIL público (1-para-1 com auth.users).
-- ================================================================

-- =================== EXTENSIONS ==================================
create extension if not exists "pgcrypto"; -- gen_random_uuid(), digest

-- =================== TABELAS =====================================

-- Perfil público do usuário (espelha o cadastro feito no app)
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null,
  last_name     text,
  email         text unique not null,
  phone         text,
  birth         date,
  photo_url     text,
  code          text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  created_at    timestamptz not null default now()
);

-- Viagem (grupo)
create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  start_date    date not null,
  end_date      date not null,
  destinations  jsonb not null default '[]'::jsonb,
  city_overrides jsonb not null default '{"renames":{},"hidden":[]}'::jsonb,
  status        text not null default 'active' check (status in ('active','past','cancelled')),
  created_by    uuid not null references public.users(id) on delete restrict,
  created_at    timestamptz not null default now()
);

-- Membros do grupo da viagem (N:N entre users e trips)
create table if not exists public.trip_members (
  trip_id       uuid not null references public.trips(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  is_admin      boolean not null default false,
  joined_at     date not null default current_date,
  join_via      text not null check (join_via in ('creator','invite','code','other')),
  primary key (trip_id, user_id)
);

-- Convites e solicitações pendentes
create table if not exists public.invites (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  email         text,           -- preenchido quando vem de convite por e-mail
  requester_id  uuid references public.users(id), -- preenchido quando vem por código
  channel       text not null check (channel in ('email','code')),
  status        text not null check (status in ('pending-response','pending-approval','accepted','denied','cancelled','expired')),
  token         text unique,    -- usado no link do e-mail
  sent_by       uuid references public.users(id),
  sent_at       timestamptz not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '14 days')
);
create index if not exists invites_trip_idx on public.invites(trip_id);
create index if not exists invites_email_idx on public.invites(lower(email));

-- Atividades do cronograma
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  doc_id        uuid,
  date          date not null,
  start_time    time,
  end_time      time,
  title         text not null,
  type          text,
  loc           text,
  description   text,
  source        text not null default 'manual' check (source in ('manual','doc')),
  joined        jsonb not null default '[]'::jsonb,  -- array de user_id que participam
  created_at    timestamptz not null default now()
);
create index if not exists activities_trip_date_idx on public.activities(trip_id, date);

-- Documentos anexados (PDF/imagem). O arquivo em si fica no Storage; aqui guardamos a referência e os dados interpretados.
create table if not exists public.docs (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  cat           text not null check (cat in ('tickets','stays','events','extras')),
  sub           text,
  name          text not null,
  filename      text,
  mime          text,
  size_bytes    bigint,
  storage_path  text,           -- caminho no bucket "trippin-docs"
  itin          jsonb,          -- saída do interpretador de passagem
  lodging       jsonb,          -- saída do interpretador de hospedagem
  scheduled     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Álbuns e fotos da galeria
create table if not exists public.albums (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.albums(id) on delete cascade,
  storage_path  text not null,  -- caminho no bucket "trippin-photos"
  added_by      uuid references public.users(id),
  created_at    timestamptz not null default now()
);

-- Despesas (já existia no app)
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  description   text not null,
  amount        numeric(12,2) not null,
  paid_by       uuid references public.users(id),
  note          text,
  created_at    timestamptz not null default now()
);

-- LOG CENTRAL de eventos (auditoria + telemetria)
-- Toda ação importante grava uma linha aqui. payload é JSON livre.
create table if not exists public.events_log (
  id            bigserial primary key,
  trip_id       uuid references public.trips(id) on delete set null,
  user_id       uuid references public.users(id) on delete set null,
  action        text not null,           -- ex: 'invite_sent', 'invite_accepted', 'admin_granted', 'trip_deleted'
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists events_log_trip_idx on public.events_log(trip_id, created_at desc);
create index if not exists events_log_action_idx on public.events_log(action, created_at desc);

-- ================================================================
-- HELPERS (funções)
-- ================================================================

-- "sou admin desta viagem?" — usada em todas as policies
create or replace function public.is_trip_admin(p_trip uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = auth.uid() and is_admin = true
  );
$$;

-- "sou membro desta viagem?"
create or replace function public.is_trip_member(p_trip uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = auth.uid()
  );
$$;

-- Ao criar uma viagem, o criador entra automaticamente como admin
create or replace function public.add_creator_as_admin()
returns trigger language plpgsql as $$
begin
  insert into public.trip_members(trip_id, user_id, is_admin, joined_at, join_via)
  values (new.id, new.created_by, true, current_date, 'creator')
  on conflict do nothing;
  insert into public.events_log(trip_id, user_id, action, payload)
  values (new.id, new.created_by, 'trip_created', jsonb_build_object('name', new.name));
  return new;
end;
$$;
drop trigger if exists trg_trip_creator on public.trips;
create trigger trg_trip_creator
  after insert on public.trips
  for each row execute function public.add_creator_as_admin();

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
-- Regra geral: tudo é privado por padrão; só vê e mexe quem é membro
-- da viagem (ou admin para mudanças sensíveis).
-- ================================================================
alter table public.users         enable row level security;
alter table public.trips         enable row level security;
alter table public.trip_members  enable row level security;
alter table public.invites       enable row level security;
alter table public.activities    enable row level security;
alter table public.docs          enable row level security;
alter table public.albums        enable row level security;
alter table public.photos        enable row level security;
alter table public.expenses      enable row level security;
alter table public.events_log    enable row level security;

-- USERS: cada um lê/edita o próprio perfil
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users for select
  using (auth.uid() = id);
drop policy if exists users_self_write on public.users;
create policy users_self_write on public.users for update
  using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists users_self_insert on public.users;
create policy users_self_insert on public.users for insert
  with check (auth.uid() = id);

-- TRIPS: membros leem; qualquer autenticado pode criar; só admin altera
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select
  using (public.is_trip_member(id));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert
  with check (auth.uid() = created_by);
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update
  using (public.is_trip_admin(id)) with check (public.is_trip_admin(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete
  using (public.is_trip_admin(id));

-- TRIP_MEMBERS: membros veem a lista; só admin promove/rebaixa/remove
drop policy if exists tm_read on public.trip_members;
create policy tm_read on public.trip_members for select
  using (public.is_trip_member(trip_id));
drop policy if exists tm_admin_write on public.trip_members;
create policy tm_admin_write on public.trip_members for all
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

-- INVITES: admin vê e mexe; o próprio convidado vê o convite dele (por e-mail)
drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all
  using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
drop policy if exists invites_invitee_read on public.invites;
create policy invites_invitee_read on public.invites for select
  using (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')) or requester_id = auth.uid());

-- ACTIVITIES / DOCS / ALBUMS / PHOTOS / EXPENSES: qualquer membro lê e escreve
do $$ declare tbl text;
begin
  foreach tbl in array array['activities','docs','albums','expenses'] loop
    execute format('drop policy if exists %I_member_rw on public.%I', tbl, tbl);
    execute format($p$create policy %I_member_rw on public.%I for all
      using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id))$p$, tbl, tbl);
  end loop;
end $$;
-- photos vai via album_id
drop policy if exists photos_member_rw on public.photos;
create policy photos_member_rw on public.photos for all
  using (exists (select 1 from public.albums a where a.id = album_id and public.is_trip_member(a.trip_id)))
  with check (exists (select 1 from public.albums a where a.id = album_id and public.is_trip_member(a.trip_id)));

-- EVENTS_LOG: só leitura, e só quem é membro da viagem em questão (ou registros do próprio usuário)
drop policy if exists log_read on public.events_log;
create policy log_read on public.events_log for select
  using (
    (trip_id is not null and public.is_trip_member(trip_id))
    or (user_id is not null and user_id = auth.uid())
  );
-- inserts no log são feitos pelas Edge Functions com service_role (que pula RLS)

-- ================================================================
-- STORAGE BUCKETS (precisam ser criados também pelo painel/CLI)
-- ================================================================
-- O DDL de bucket é feito pelo CLI (`supabase storage buckets create ...`)
-- ou pelo painel. Para referência:
--   trippin-docs   (privado) — PDFs e prints anexados em Docs
--   trippin-photos (privado) — fotos da Galeria
--   trippin-avatars (público) — fotos de perfil
-- As policies do storage seguem o mesmo padrão: só membro da viagem acessa.
