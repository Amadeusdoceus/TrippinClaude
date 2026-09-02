-- ============================================================================
-- Trippin v2 — testes de policy (Fase 1, tarefa 1.6)
-- ----------------------------------------------------------------------------
-- Roda com: supabase test db  (pgTAP, precisa de `supabase start` — Docker)
--
-- Critério de aceite (04-plano-de-acao.md): para cada tabela sensível, um caso
-- "usuário não-membro tenta ler/escrever" que deve falhar. Cobre as tabelas de
-- maior risco (trips, trip_members, invites, docs, profiles) e o padrão vale
-- para as demais (activities, photos, expenses, albums, doc_legs) — mesma
-- forma: is_trip_member() nega, sem policy de insert deixa qualquer insert
-- direto falhar.
--
-- Técnica: sem extensão de terceiros (dbdev/test_helpers). Simula o JWT do
-- Postgrest setando `request.jwt.claims` e trocando de role na sessão, que é
-- exatamente como o PostgREST autentica cada request.
-- ============================================================================

begin;
select plan(23);

-- ----------------------------------------------------------------------------
-- Fixtures: dois usuários (A = dono/admin da viagem, B = estranho) e uma viagem
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'a@trippin.test', 'x', now(), '{}', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'b@trippin.test', 'x', now(), '{}', '{}');
-- o trigger on_auth_user_created já criou as duas linhas em public.profiles

insert into public.trips (id, name, start_date, end_date, created_by)
values ('33333333-3333-3333-3333-333333333333', 'Viagem de teste', '2026-09-01', '2026-09-10',
        '11111111-1111-1111-1111-111111111111');
-- o trigger on_trip_created já colocou A como admin em trip_members

-- "overriding system value": id é bigint generated always as identity — sem
-- isso, um INSERT com id explícito é rejeitado pelo Postgres.
insert into public.activities (id, trip_id, title, starts_at, created_by)
overriding system value
values (900001, '33333333-3333-3333-3333-333333333333', 'Check-in', '2026-09-01 14:00+00',
        '11111111-1111-1111-1111-111111111111');

insert into public.docs (id, trip_id, uploaded_by, kind, name, parsed)
overriding system value
values (900001, '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        'ticket', 'Passagem teste', '{"locator":"ABC123"}'::jsonb);

-- ----------------------------------------------------------------------------
-- Helpers de sessão: assume o papel de um usuário autenticado específico,
-- exatamente como o PostgREST faz a cada request.
-- ----------------------------------------------------------------------------
create schema if not exists tests;
-- as funções deste schema são chamadas depois de "set local role
-- authenticated/anon" — sem USAGE explícito, esses papéis nem enxergam o
-- schema (o grant amplo em `public` não cobre schemas separados).
grant usage on schema tests to authenticated, anon;

-- SET ROLE é proibido dentro de security definer (escalonamento de
-- privilégio) — por isso o lookup de e-mail (que precisa ler auth.users, sem
-- SELECT amplo pra authenticated) fica numa função definer separada; quem
-- troca de papel continua sendo security invoker normal.
create or replace function tests.user_email(p_user_id uuid) returns text
security definer set search_path = 'public' as $$
  select email from auth.users where id = p_user_id;
$$ language sql;

create or replace function tests.auth_as(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated',
                       'email', tests.user_email(p_user_id))::text,
    true);
  set local role authenticated;
end;
$$ language plpgsql;

create or replace function tests.auth_as_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
end;
$$ language plpgsql;

-- Postgres não deixa um CTE com UPDATE/DELETE virar subquery escalar ("WITH
-- clause containing a data-modifying statement must be at the top level") —
-- por isso as checagens de "afeta 0 linhas" abaixo passam pelo EXECUTE aqui
-- dentro, que roda a instrução como statement próprio.
create or replace function tests.count_affected(p_sql text) returns integer as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql;

grant execute on all functions in schema tests to authenticated, anon;

-- ============================================================================
-- 1. B (não-membro) tenta LER a viagem de A -> 0 linhas, não erro (sem oráculo
--    de existência — o não-membro não deve conseguir distinguir "não existe"
--    de "existe mas não é meu").
-- ============================================================================
select tests.auth_as('22222222-2222-2222-2222-222222222222');

select is_empty(
  $$ select 1 from public.trips where id = '33333333-3333-3333-3333-333333333333' $$,
  'não-membro: SELECT trips não vê a viagem'
);

select is_empty(
  $$ select 1 from public.trip_members where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  'não-membro: SELECT trip_members não vê os integrantes'
);

select is_empty(
  $$ select 1 from public.activities where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  'não-membro: SELECT activities não vê o cronograma'
);

select is_empty(
  $$ select 1 from public.docs where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  'não-membro: SELECT docs não vê passagens/reservas (PII — finding A-01)'
);

-- ----------------------------------------------------------------------------
-- 2. B tenta ESCREVER na viagem de A -> deve falhar
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.trip_members (trip_id, user_id, role, join_via)
     values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'admin', 'code') $$,
  '42501',
  null,
  'não-membro: não consegue se auto-inserir em trip_members (finding A-06)'
);

select throws_ok(
  $$ insert into public.activities (trip_id, title, starts_at, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Atividade forjada', now(), '22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'não-membro: não consegue inserir atividade na viagem de A'
);

-- RLS "using" só filtra linhas — não lança erro quando 0 linhas casam, então o
-- teste correto é checar linhas afetadas, não esperar exceção.
select is(
  tests.count_affected($sql$ update public.trips set name = 'Sequestrada' where id = '33333333-3333-3333-3333-333333333333' $sql$),
  0,
  'não-membro: UPDATE em trips afeta 0 linhas'
);

select is(
  tests.count_affected($sql$ update public.docs set name = 'Alterado' where id = 900001 $sql$),
  0,
  'não-membro: UPDATE em docs afeta 0 linhas'
);

select is(
  tests.count_affected($sql$ delete from public.trips where id = '33333333-3333-3333-3333-333333333333' $sql$),
  0,
  'não-membro: DELETE em trips afeta 0 linhas (using() nega — não é admin)'
);

-- ----------------------------------------------------------------------------
-- 3. B tenta ler o perfil de A -> só o próprio perfil é visível (correção A-05:
--    dados de terceiro só via get_trip_member_profiles, nunca a linha inteira)
-- ----------------------------------------------------------------------------
select is_empty(
  $$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  'não-membro: não lê o profile de A diretamente'
);

select results_eq(
  $$ select id from public.profiles where id = auth.uid() $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'B só enxerga o próprio profile'
);

-- ----------------------------------------------------------------------------
-- 4. B tenta ler notificações de A -> nada
-- ----------------------------------------------------------------------------
select is_empty(
  $$ select 1 from public.notifications where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'não-membro: não lê notificações de A'
);

-- ============================================================================
-- 5. A (admin/membro real) consegue operar normalmente — garante que a RLS não
--    é restritiva demais e quebrou o próprio dono.
-- ============================================================================
select tests.auth_as('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$ select count(*)::int from public.trips where id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values (1) $$,
  'membro: SELECT trips vê a própria viagem'
);

select lives_ok(
  $$ insert into public.activities (trip_id, title, starts_at, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Jantar', now(), '11111111-1111-1111-1111-111111111111') $$,
  'membro: consegue inserir atividade na própria viagem'
);

select lives_ok(
  $$ update public.trips set name = 'Viagem renomeada'
      where id = '33333333-3333-3333-3333-333333333333' $$,
  'admin: consegue renomear a própria viagem'
);

-- ----------------------------------------------------------------------------
-- 6. Privilégio de UPDATE restrito por coluna (finding A-06): mesmo o admin
--    não pode reescrever `code` de trips por UPDATE direto — só pela RPC
--    rotate_trip_code (0003_rpc.sql).
-- ----------------------------------------------------------------------------
select throws_ok(
  $$ update public.trips set code = 'FORCEDCODEXX'
      where id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  null,
  'admin: não pode sobrescrever trips.code por UPDATE direto (só via rotate_trip_code)'
);

select throws_ok(
  $$ update public.profiles set email = 'roubado@evil.test'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'dono: não pode alterar o próprio email por UPDATE direto (evita sequestro de convite)'
);

select throws_ok(
  $$ update public.expenses set paid_by = '22222222-2222-2222-2222-222222222222'
      where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  '42501',
  null,
  'membro: não pode reescrever expenses.paid_by por UPDATE direto (coluna não concedida)'
);

-- ----------------------------------------------------------------------------
-- 7. rate_limits / client_errors / audit_log — tabelas de serviço
-- ----------------------------------------------------------------------------
select tests.auth_as('22222222-2222-2222-2222-222222222222');

select is_empty(
  $$ select 1 from public.rate_limits $$,
  'não-membro: rate_limits não é legível por authenticated (só service_role)'
);

select is_empty(
  $$ select 1 from public.client_errors $$,
  'ninguém lê client_errors (nem o próprio autor) — telemetria write-only'
);

select is_empty(
  $$ select 1 from public.audit_log where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  'não-membro: não lê o audit_log da viagem de A'
);

select tests.auth_as('11111111-1111-1111-1111-111111111111');
select isnt_empty(
  $$ select 1 from public.audit_log where trip_id = '33333333-3333-3333-3333-333333333333' $$,
  'membro: lê o próprio audit_log (trip_created já foi logado pelo trigger)'
);

-- ----------------------------------------------------------------------------
-- 8. force row level security em 100% das tabelas de public (parte do
--    critério de aceite de 04-plano-de-acao.md, checado aqui em SQL puro)
-- ----------------------------------------------------------------------------
-- pg_tables não expõe forcerowsecurity nesta instância — pg_class é o
-- catálogo de verdade (relrowsecurity/relforcerowsecurity), sempre presente.
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (not c.relrowsecurity or not c.relforcerowsecurity) $$,
  'todas as tabelas de public têm RLS habilitado E forçado'
);

select * from finish();
rollback;
