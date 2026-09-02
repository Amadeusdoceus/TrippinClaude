-- ============================================================================
-- Trippin v2 — 0004 Storage
-- ----------------------------------------------------------------------------
-- Dois buckets PRIVADOS. Nenhum arquivo é servido por URL pública: o cliente
-- pede uma URL assinada com TTL curto quando vai exibir.
--
-- Convenção de caminho: {trip_id}/{arquivo} — permite checar posse pelo prefixo
-- sem tabela auxiliar (padrão de B). trip_id é uuid, então a comparação é direta.
--
-- Isto substitui o armazenamento de passagens e reservas em localStorage/
-- IndexedDB do projeto A (finding A-01): localizador de voo, endereço da
-- hospedagem e nome do hóspede saem do dispositivo.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('trip-documents', 'trip-documents', false, 20971520,
   array['application/pdf','image/jpeg','image/png','image/webp','image/heic']),
  ('trip-photos', 'trip-photos', false, 15728640,
   array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Helper: extrai o trip_id do primeiro segmento do caminho.
-- Retorna null se o prefixo não for um uuid válido, o que faz toda policy
-- abaixo negar o acesso (fail closed).
-- ----------------------------------------------------------------------------
create or replace function private.path_trip_id(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.path_trip_id(text) to authenticated;

-- ----------------------------------------------------------------------------
-- trip-documents — passagens, reservas, anexos. PII forte.
-- ----------------------------------------------------------------------------
create policy trip_documents_select_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-documents'
    and (select private.is_trip_member(private.path_trip_id(name)))
  );

create policy trip_documents_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-documents'
    and (select private.is_trip_member(private.path_trip_id(name)))
    and owner = (select auth.uid())
  );

create policy trip_documents_delete_owner_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      owner = (select auth.uid())
      or (select private.is_trip_admin(private.path_trip_id(name)))
    )
  );

-- ----------------------------------------------------------------------------
-- trip-photos — galeria da viagem e avatares.
-- Avatares ficam sob o prefixo reservado 'avatars/{user_id}/…'.
-- ----------------------------------------------------------------------------
create policy trip_photos_select_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-photos'
    and (
      (storage.foldername(name))[1] = 'avatars'
      or (select private.is_trip_member(private.path_trip_id(name)))
    )
  );

create policy trip_photos_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and owner = (select auth.uid())
    and (
      ((storage.foldername(name))[1] = 'avatars'
        and (storage.foldername(name))[2] = (select auth.uid())::text)
      or (select private.is_trip_member(private.path_trip_id(name)))
    )
  );

create policy trip_photos_delete_owner_or_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and (
      owner = (select auth.uid())
      or (select private.is_trip_admin(private.path_trip_id(name)))
    )
  );

-- ----------------------------------------------------------------------------
-- Retenção (Fase 6). Rodar por cron: apaga documentos de viagens encerradas
-- há mais de 180 dias. O evento já confirmado no cronograma permanece —
-- some o arquivo e os campos extraídos, não o compromisso.
-- ----------------------------------------------------------------------------
create or replace function private.purge_expired_documents(p_days integer default 180)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with expired as (
    select d.id, d.storage_path
    from public.docs d
    join public.trips t on t.id = d.trip_id
    where t.end_date < (current_date - p_days)
      and d.storage_path is not null
  ),
  removed as (
    delete from storage.objects
     where bucket_id = 'trip-documents'
       and name in (select storage_path from expired)
    returning 1
  )
  update public.docs
     set storage_path = null, parsed = '{}'::jsonb, source = 'legacy'
   where id in (select id from expired);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- select cron.schedule('purge-docs', '0 3 * * *', $$select private.purge_expired_documents();$$);
