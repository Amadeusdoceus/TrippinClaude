-- ============================================================================
-- Trippin v2 — Fase 6: retenção de documentos (6.2) e rate limit por IP (6.4)
-- ----------------------------------------------------------------------------
-- Depende de 20260901090000_core_schema.sql e 20260901090300_storage.sql já
-- aplicadas (usa public.notifications, public.docs, private.purge_expired_documents).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.2a — aviso prévio antes de apagar. Novo tipo de notificação.
-- ----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('member_joined','expense_impact','schedule_conflict','invite_pending','doc_expiring'));

-- Avisa os integrantes da viagem N dias antes de private.purge_expired_documents
-- apagar os documentos — dá tempo de baixar uma cópia antes.
create or replace function private.warn_expiring_documents(p_days_before integer default 7, p_retention_days integer default 180)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with expiring as (
    select distinct d.trip_id, t.name
    from public.docs d
    join public.trips t on t.id = d.trip_id
    where t.end_date = (current_date - p_retention_days + p_days_before)
      and d.storage_path is not null
  ),
  notified as (
    insert into public.notifications (trip_id, user_id, type, payload)
    select e.trip_id, tm.user_id, 'doc_expiring',
           jsonb_build_object('trip_name', e.name, 'days_left', p_days_before)
    from expiring e
    join public.trip_members tm on tm.trip_id = e.trip_id
    returning 1
  )
  select count(*) into v_count from notified;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.2b — ativa os jobs (pg_cron precisa estar habilitado no projeto — no
-- Supabase isso é "Database > Extensions > pg_cron", uma ação manual de
-- dashboard; a migration só agenda, não habilita a extensão sozinha).
-- Roda de propósito FORA de qualquer bloco condicional: se pg_cron não
-- estiver habilitado, esta migration falha alto e visível (erro de "schema
-- cron does not exist"), em vez de silenciosamente não agendar nada.
-- ----------------------------------------------------------------------------
select cron.schedule('warn-expiring-docs', '0 9 * * *',
  $$select private.warn_expiring_documents();$$);
select cron.schedule('purge-expired-docs', '0 3 * * *',
  $$select private.purge_expired_documents();$$);

-- ----------------------------------------------------------------------------
-- 6.4 — rate limiting por IP em Edge Functions sem sessão de usuário
-- (search-stays: hoje não exige login, então public.rate_limits — chaveada
-- por user_id — não serve). Só a service_role acessa (mesmo padrão de
-- public.rate_limits): sem policy nenhuma = authenticated/anon não veem nada.
-- ----------------------------------------------------------------------------
create table if not exists public.ip_rate_limits (
  ip            text not null,
  action        text not null,
  window_start  timestamptz not null,
  count         integer not null default 1,
  primary key (ip, action, window_start)
);
alter table public.ip_rate_limits enable row level security;
alter table public.ip_rate_limits force row level security;

-- Limpeza: sem isso a tabela cresce pra sempre (nunca há DELETE nas Edge
-- Functions, só INSERT/UPDATE do contador da janela corrente).
create or replace function private.purge_old_rate_limits(p_hours integer default 24)
returns void language sql security definer set search_path = '' as $$
  delete from public.ip_rate_limits where window_start < now() - (p_hours || ' hours')::interval;
  delete from public.rate_limits    where window_start < now() - (p_hours || ' hours')::interval;
$$;
select cron.schedule('purge-old-rate-limits', '30 * * * *',
  $$select private.purge_old_rate_limits();$$);
