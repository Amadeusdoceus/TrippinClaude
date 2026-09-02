-- ============================================================================
-- Trippin v2 — 0002 RLS
-- ----------------------------------------------------------------------------
-- Padrão adotado (de B, Trippin-Claude-Skills):
--   · enable + FORCE row level security em todas as tabelas
--   · uma policy por operação (nada de `for all` genérico)
--   · `to authenticated` sempre explícito — sem isso, a policy vale para anon
--   · `(select auth.uid())` e `(select private.is_trip_*())`: o planner avalia
--     uma vez por query, não uma vez por linha
--   · privilégio de UPDATE restrito por COLUNA — impede que um cliente malicioso
--     reescreva campos que a UI nunca edita (user_code, email, role, paid_by...)
--
-- Regra de leitura: um não-membro sempre recebe 0 linhas, nunca 403. Isso evita
-- que a API funcione como oráculo de existência de viagens.
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.profiles              force  row level security;
alter table public.trips                 enable row level security;
alter table public.trips                 force  row level security;
alter table public.trip_members          enable row level security;
alter table public.trip_members          force  row level security;
alter table public.invites               enable row level security;
alter table public.invites               force  row level security;
alter table public.activities            enable row level security;
alter table public.activities            force  row level security;
alter table public.activity_participants enable row level security;
alter table public.activity_participants force  row level security;
alter table public.docs                  enable row level security;
alter table public.docs                  force  row level security;
alter table public.doc_legs              enable row level security;
alter table public.doc_legs              force  row level security;
alter table public.albums                enable row level security;
alter table public.albums                force  row level security;
alter table public.photos                enable row level security;
alter table public.photos                force  row level security;
alter table public.expenses              enable row level security;
alter table public.expenses              force  row level security;
alter table public.expense_shares        enable row level security;
alter table public.expense_shares        force  row level security;
alter table public.audit_log             enable row level security;
alter table public.audit_log             force  row level security;
alter table public.notifications         enable row level security;
alter table public.notifications         force  row level security;
alter table public.client_errors         enable row level security;
alter table public.client_errors         force  row level security;
alter table public.rate_limits           enable row level security;
alter table public.rate_limits           force  row level security;

-- ----------------------------------------------------------------------------
-- profiles — só o próprio. O nome/e-mail dos colegas de viagem sai pela RPC
-- get_trip_member_profiles (0003), que devolve 3 colunas, não a linha inteira.
-- Esta é a correção do finding A-05.
-- ----------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant  update (first_name, last_name, phone, cpf, birth, photo_path, language, onboarded)
  on public.profiles to authenticated;
-- email e user_code ficam de fora de propósito: forjá-los permitiria sequestrar
-- um convite endereçado a outra pessoa.

-- ----------------------------------------------------------------------------
-- trips
-- ----------------------------------------------------------------------------
create policy trips_select_member on public.trips
  for select to authenticated
  using ((select private.is_trip_member(id)));

create policy trips_insert_own on public.trips
  for insert to authenticated
  with check ((select auth.uid()) = created_by);

create policy trips_update_admin on public.trips
  for update to authenticated
  using ((select private.is_trip_admin(id)))
  with check ((select private.is_trip_admin(id)));

create policy trips_delete_admin on public.trips
  for delete to authenticated
  using ((select private.is_trip_admin(id)));

revoke update on public.trips from authenticated;
grant  update (name, start_date, end_date, status, destinations, city_overrides)
  on public.trips to authenticated;
-- `code` fora: rotação só pela RPC rotate_trip_code (0003), que registra auditoria.

-- ----------------------------------------------------------------------------
-- trip_members
-- Não existe policy de INSERT: virar membro só acontece por
--   · trigger on_trip_created (criador vira admin), ou
--   · RPC join_trip_by_code (exige o código exato), ou
--   · Edge Function accept-invite/approve-join (service_role).
-- Sem isso, qualquer autenticado se auto-insere em qualquer viagem — foi
-- exatamente o furo que o security_hardening de B corrigiu (finding A-06).
-- ----------------------------------------------------------------------------
create policy trip_members_select_member on public.trip_members
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy trip_members_update_admin on public.trip_members
  for update to authenticated
  using ((select private.is_trip_admin(trip_id)))
  with check ((select private.is_trip_admin(trip_id)));

create policy trip_members_delete_admin_or_self on public.trip_members
  for delete to authenticated
  using ((select private.is_trip_admin(trip_id)) or user_id = (select auth.uid()));

revoke update on public.trip_members from authenticated;
grant  update (role) on public.trip_members to authenticated;
-- só `role`: sem isso um admin poderia reescrever trip_members.user_id e
-- transferir a participação de alguém para uma conta que ele controla.

-- ----------------------------------------------------------------------------
-- invites
-- ----------------------------------------------------------------------------
create policy invites_select_admin on public.invites
  for select to authenticated
  using ((select private.is_trip_admin(trip_id)));

create policy invites_select_own on public.invites
  for select to authenticated
  using (requester_id = (select auth.uid())
      or lower(email) = lower((select auth.jwt() ->> 'email')));

create policy invites_update_admin on public.invites
  for update to authenticated
  using ((select private.is_trip_admin(trip_id)))
  with check ((select private.is_trip_admin(trip_id)));

revoke update on public.invites from authenticated;
grant  update (status) on public.invites to authenticated;
-- INSERT não é liberado: convites nascem nas Edge Functions, que validam
-- autoria e destinatário antes de gastar um e-mail (finding C-02).

-- ----------------------------------------------------------------------------
-- activities / activity_participants
-- ----------------------------------------------------------------------------
create policy activities_select_member on public.activities
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy activities_insert_member on public.activities
  for insert to authenticated
  with check ((select private.is_trip_member(trip_id))
              and created_by = (select auth.uid()));

create policy activities_update_member on public.activities
  for update to authenticated
  using ((select private.is_trip_member(trip_id)))
  with check ((select private.is_trip_member(trip_id)));

create policy activities_delete_author_or_admin on public.activities
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)));

revoke update on public.activities from authenticated;
grant  update (title, place, kind, starts_at, ends_at, all_day, notes, sort_order)
  on public.activities to authenticated;
-- trip_id e created_by fora: mover uma atividade para outra viagem, ou
-- reatribuir a autoria, não é um fluxo do produto.

create policy activity_participants_select_member on public.activity_participants
  for select to authenticated
  using ((select private.is_trip_member(
            (select trip_id from public.activities where id = activity_id))));

-- Cada um entra e sai da própria atividade — ninguém inscreve terceiros.
create policy activity_participants_insert_self on public.activity_participants
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and (select private.is_trip_member(
                     (select trip_id from public.activities where id = activity_id))));

create policy activity_participants_delete_self_or_admin on public.activity_participants
  for delete to authenticated
  using (user_id = (select auth.uid())
      or (select private.is_trip_admin(
            (select trip_id from public.activities where id = activity_id))));

-- ----------------------------------------------------------------------------
-- docs / doc_legs — contêm PII forte (localizador, endereço, hóspede).
-- Nunca saem da viagem. Correção do finding A-01.
-- ----------------------------------------------------------------------------
create policy docs_select_member on public.docs
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy docs_insert_member on public.docs
  for insert to authenticated
  with check ((select private.is_trip_member(trip_id))
              and uploaded_by = (select auth.uid()));

create policy docs_update_owner_or_admin on public.docs
  for update to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)))
  with check (uploaded_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)));

create policy docs_delete_owner_or_admin on public.docs
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)));

revoke update on public.docs from authenticated;
grant  update (name, parsed, kind) on public.docs to authenticated;

create policy doc_legs_select_member on public.doc_legs
  for select to authenticated
  using ((select private.is_trip_member((select trip_id from public.docs where id = doc_id))));

create policy doc_legs_write_member on public.doc_legs
  for insert to authenticated
  with check ((select private.is_trip_member((select trip_id from public.docs where id = doc_id))));

create policy doc_legs_delete_member on public.doc_legs
  for delete to authenticated
  using ((select private.is_trip_member((select trip_id from public.docs where id = doc_id))));

-- ----------------------------------------------------------------------------
-- albums / photos
-- ----------------------------------------------------------------------------
create policy albums_select_member on public.albums
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy albums_insert_member on public.albums
  for insert to authenticated
  with check ((select private.is_trip_member(trip_id)));

create policy albums_delete_admin on public.albums
  for delete to authenticated
  using ((select private.is_trip_admin(trip_id)));

create policy photos_select_member on public.photos
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy photos_insert_member on public.photos
  for insert to authenticated
  with check ((select private.is_trip_member(trip_id))
              and uploaded_by = (select auth.uid()));

create policy photos_delete_owner_or_admin on public.photos
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)));

-- ----------------------------------------------------------------------------
-- expenses / expense_shares
-- ----------------------------------------------------------------------------
create policy expenses_select_member on public.expenses
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

create policy expenses_insert_member on public.expenses
  for insert to authenticated
  with check ((select private.is_trip_member(trip_id))
              and (select private.is_trip_member(trip_id)));

create policy expenses_update_member on public.expenses
  for update to authenticated
  using ((select private.is_trip_member(trip_id)))
  with check ((select private.is_trip_member(trip_id)));

create policy expenses_delete_payer_or_admin on public.expenses
  for delete to authenticated
  using (paid_by = (select auth.uid()) or (select private.is_trip_admin(trip_id)));

revoke update on public.expenses from authenticated;
grant  update (description, amount, currency, split_method, activity_id, notes, needs_review)
  on public.expenses to authenticated;
-- paid_by fora: alterar quem pagou depois do fato reescreve o acerto de contas
-- de todo mundo. Corrigir exige apagar e recriar, deixando rastro.

create policy expense_shares_select_member on public.expense_shares
  for select to authenticated
  using ((select private.is_trip_member((select trip_id from public.expenses where id = expense_id))));

create policy expense_shares_write_member on public.expense_shares
  for insert to authenticated
  with check ((select private.is_trip_member((select trip_id from public.expenses where id = expense_id))));

create policy expense_shares_update_member on public.expense_shares
  for update to authenticated
  using ((select private.is_trip_member((select trip_id from public.expenses where id = expense_id))))
  with check ((select private.is_trip_member((select trip_id from public.expenses where id = expense_id))));

create policy expense_shares_delete_member on public.expense_shares
  for delete to authenticated
  using ((select private.is_trip_member((select trip_id from public.expenses where id = expense_id))));

revoke update on public.expense_shares from authenticated;
grant  update (share_amount, settled) on public.expense_shares to authenticated;

-- ----------------------------------------------------------------------------
-- audit_log — leitura para integrantes; escrita só por private.log_event.
-- Correção do finding M-06: um log que o auditado escreve não é log.
-- ----------------------------------------------------------------------------
create policy audit_log_select_member on public.audit_log
  for select to authenticated
  using ((select private.is_trip_member(trip_id)));

-- ----------------------------------------------------------------------------
-- notifications — só o dono lê; só trigger escreve; só read_at é editável.
-- ----------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;

-- ----------------------------------------------------------------------------
-- client_errors — insert para todos (erro pode ocorrer antes do login),
-- mas sempre em nome de si mesmo. SELECT: para ninguém.
-- ----------------------------------------------------------------------------
create policy client_errors_insert_self_or_anon on public.client_errors
  for insert to authenticated, anon
  with check (user_id is null or user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- rate_limits — tabela de serviço; só as Edge Functions (service_role) tocam.
-- Nenhuma policy = nenhum acesso para anon/authenticated.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (deve retornar 0 linhas)
-- ----------------------------------------------------------------------------
-- select tablename from pg_tables
--  where schemaname = 'public' and (not rowsecurity or not forcerowsecurity);
