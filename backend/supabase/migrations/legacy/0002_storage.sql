-- ================================================================
-- Storage: policies dos buckets
-- ================================================================
-- Convenção: o "caminho" começa pelo trip_id, ex.
--   trippin-docs/<trip_id>/<doc_id>.pdf
--   trippin-photos/<trip_id>/<photo_id>.jpg
-- Assim conseguimos checar o trip_id pela 1ª pasta.
-- ================================================================

-- helper: extrai a 1ª pasta como uuid
create or replace function public.storage_trip_id(p_name text)
returns uuid language sql immutable as $$
  select (split_part(p_name, '/', 1))::uuid
$$;

-- buckets privados — só membros leem/escrevem
do $$ declare b text;
begin
  foreach b in array array['trippin-docs','trippin-photos'] loop
    execute format($p$drop policy if exists %I on storage.objects$p$, b||'_read');
    execute format($p$create policy %I on storage.objects for select
      using (bucket_id = %L and public.is_trip_member(public.storage_trip_id(name)))$p$, b||'_read', b);
    execute format($p$drop policy if exists %I on storage.objects$p$, b||'_write');
    execute format($p$create policy %I on storage.objects for insert
      with check (bucket_id = %L and public.is_trip_member(public.storage_trip_id(name)))$p$, b||'_write', b);
    execute format($p$drop policy if exists %I on storage.objects$p$, b||'_delete');
    execute format($p$create policy %I on storage.objects for delete
      using (bucket_id = %L and public.is_trip_member(public.storage_trip_id(name)))$p$, b||'_delete', b);
  end loop;
end $$;

-- avatars (público para leitura, gravação só do dono)
drop policy if exists trippin_avatars_read on storage.objects;
create policy trippin_avatars_read on storage.objects for select
  using (bucket_id = 'trippin-avatars');
drop policy if exists trippin_avatars_write on storage.objects;
create policy trippin_avatars_write on storage.objects for insert
  with check (bucket_id = 'trippin-avatars' and auth.uid()::text = split_part(name,'/',1));
drop policy if exists trippin_avatars_update on storage.objects;
create policy trippin_avatars_update on storage.objects for update
  using (bucket_id = 'trippin-avatars' and auth.uid()::text = split_part(name,'/',1));
