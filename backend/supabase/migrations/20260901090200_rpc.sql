-- ============================================================================
-- Trippin v2 — 0003 RPCs
-- ----------------------------------------------------------------------------
-- Exceções deliberadas e mínimas à RLS. Cada função `security definer` aqui
-- existe porque a alternativa seria uma policy larga demais. Todas:
--   · declaram `set search_path = ''` (evita sequestro por schema de usuário)
--   · revogam execute de public/anon e concedem só a authenticated
--   · devolvem o mínimo de colunas necessário à tela que as consome
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_trip_by_code — "Participar de viagem": quem ainda não é membro precisa
-- ver o nome e as datas antes de confirmar, mas a policy de trips (corretamente)
-- bloqueia. O código de 12 caracteres funciona como token de convite: só quem o
-- recebeu consegue usá-lo. Devolve um subconjunto de colunas — nunca a linha
-- inteira, para não vazar destinations/city_overrides a um estranho.
-- ----------------------------------------------------------------------------
create or replace function public.get_trip_by_code(p_code text)
returns table (id uuid, name text, start_date date, end_date date, member_count bigint)
language sql security definer set search_path = '' stable as $$
  select t.id, t.name, t.start_date, t.end_date,
         (select count(*) from public.trip_members m where m.trip_id = t.id)
  from public.trips t
  where t.code = upper(trim(p_code))
    and t.status <> 'archived'
    and (t.code_expires_at is null or t.code_expires_at > now());
$$;

revoke execute on function public.get_trip_by_code(text) from public, anon;
grant  execute on function public.get_trip_by_code(text) to authenticated;

-- ----------------------------------------------------------------------------
-- join_trip_by_code — única forma de virar convidado. Substitui tanto a policy
-- de auto-insert em trip_members quanto a Edge Function request-join do projeto
-- A, que fazia `select id, name from trips` sem filtro (findings A-03 e M-03).
-- ----------------------------------------------------------------------------
create or replace function public.join_trip_by_code(p_code text)
returns table (id uuid, name text, start_date date, end_date date)
language plpgsql security definer set search_path = '' as $$
declare
  v_trip   public.trips;
  v_joined boolean := false;
begin
  select * into v_trip
  from public.trips
  where code = upper(trim(p_code))
    and status <> 'archived'
    and (code_expires_at is null or code_expires_at > now());

  if not found then
    raise exception 'TRIP_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.trip_members (trip_id, user_id, role, join_via)
  values (v_trip.id, (select auth.uid()), 'convidado', 'code')
  on conflict (trip_id, user_id) do nothing;

  get diagnostics v_joined = row_count;

  if v_joined then
    perform private.log_event(v_trip.id, 'member_joined',
      jsonb_build_object('via', 'code'));
  end if;

  return query select v_trip.id, v_trip.name, v_trip.start_date, v_trip.end_date;
end;
$$;

revoke execute on function public.join_trip_by_code(text) from public, anon;
grant  execute on function public.join_trip_by_code(text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_trip_member_profiles — a tela de Integrantes precisa de nome, e-mail e
-- foto dos colegas. A policy larga que o projeto A usava entregava também CPF,
-- telefone, data de nascimento e código pessoal (finding A-05). Esta função
-- devolve só o que a UI desenha.
-- ----------------------------------------------------------------------------
create or replace function public.get_trip_member_profiles(p_trip_id uuid)
returns table (user_id uuid, first_name text, last_name text, email text, photo_path text,
               role text, joined_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select p.id, p.first_name, p.last_name, p.email, p.photo_path, tm.role, tm.joined_at
  from public.profiles p
  join public.trip_members tm on tm.user_id = p.id
  where tm.trip_id = p_trip_id
    and (select private.is_trip_member(p_trip_id))
  order by tm.joined_at;
$$;

revoke execute on function public.get_trip_member_profiles(uuid) from public, anon;
grant  execute on function public.get_trip_member_profiles(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- rotate_trip_code — o código de A era um prefixo do UUID: impossível de
-- rotacionar sem trocar a chave primária, e um ex-integrante mantinha acesso
-- perpétuo (finding A-03). Aqui o admin gera um código novo quando quiser.
-- ----------------------------------------------------------------------------
create or replace function public.rotate_trip_code(p_trip_id uuid, p_expires_at timestamptz default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if not (select private.is_trip_admin(p_trip_id)) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;

  v_code := private.generate_trip_code();

  update public.trips
     set code = v_code, code_expires_at = p_expires_at
   where id = p_trip_id;

  perform private.log_event(p_trip_id, 'trip_code_rotated', '{}'::jsonb);

  return v_code;
end;
$$;

revoke execute on function public.rotate_trip_code(uuid, timestamptz) from public, anon;
grant  execute on function public.rotate_trip_code(uuid, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- set_member_role — promover/rebaixar com validação de invariante: uma viagem
-- nunca fica sem admin. A policy de UPDATE sozinha não consegue garantir isso.
-- ----------------------------------------------------------------------------
create or replace function public.set_member_role(p_trip_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_admins integer;
begin
  if not (select private.is_trip_admin(p_trip_id)) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_role not in ('admin','coadmin','convidado') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  update public.trip_members
     set role = p_role
   where trip_id = p_trip_id and user_id = p_user_id;

  select count(*) into v_admins
  from public.trip_members
  where trip_id = p_trip_id and role = 'admin';

  if v_admins = 0 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;

  perform private.log_event(p_trip_id, 'member_role_changed',
    jsonb_build_object('target', p_user_id, 'role', p_role));
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
grant  execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- export_my_data — LGPD art. 18 (acesso e portabilidade). Um único JSON com
-- tudo que é do titular. Fase 6 do plano.
-- ----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'profile',   (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'trips',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                    from public.trips t
                    join public.trip_members m on m.trip_id = t.id
                   where m.user_id = (select auth.uid())),
    'activities',(select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                    from public.activities a
                   where a.created_by = (select auth.uid())),
    'expenses',  (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                    from public.expenses e
                   where e.paid_by = (select auth.uid())),
    'docs',      (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                    from public.docs d
                   where d.uploaded_by = (select auth.uid())),
    'exported_at', to_jsonb(now())
  );
$$;

revoke execute on function public.export_my_data() from public, anon;
grant  execute on function public.export_my_data() to authenticated;

-- ----------------------------------------------------------------------------
-- delete_my_account — LGPD art. 18, V. Remove o titular; o que é da viagem
-- (despesas já rateadas, histórico) é anonimizado, não apagado, para não
-- corromper o acerto de contas dos demais.
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  update public.profiles
     set first_name = 'Usuário', last_name = 'removido', email = concat('deleted+', id, '@invalid'),
         phone = '', cpf = '', birth = null, photo_path = null
   where id = v_uid;

  delete from public.trip_members       where user_id = v_uid;
  delete from public.activity_participants where user_id = v_uid;
  delete from public.notifications      where user_id = v_uid;

  -- auth.users em cascata é responsabilidade da Edge Function que chama esta
  -- função com service_role; aqui só limpamos o lado public.
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
