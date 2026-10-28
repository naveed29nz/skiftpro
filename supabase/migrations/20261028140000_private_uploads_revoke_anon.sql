-- Make task uploads private and drop anon column reads.
-- NOT APPLIED to production by this change. Run it in the Supabase SQL editor
-- after review. Existing image rows may still store a public object URL.
-- The app turns that URL into a signed URL at display time.

do $uploads$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets set public = false where id = 'uploads';

    execute 'drop policy if exists uploads_public_read on storage.objects';
    execute 'drop policy if exists uploads_auth_select on storage.objects';
    execute $pol$
      create policy uploads_auth_select on storage.objects
        for select to authenticated
        using (bucket_id = 'uploads')
    $pol$;
  end if;
end
$uploads$;

-- Column grants to anon are not used by the signing page. That page calls
-- the sign-contract edge function. Authenticated grants stay.
do $anon$
declare
  rec record;
begin
  for rec in
    select table_name, column_name
    from information_schema.column_privileges
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in ('workers', 'contracts', 'workplace_settings')
      and privilege_type = 'SELECT'
  loop
    execute format(
      'revoke select (%I) on public.%I from anon',
      rec.column_name,
      rec.table_name
    );
  end loop;
end
$anon$;

revoke all on table public.workers from anon;
revoke all on table public.contracts from anon;
revoke all on table public.workplace_settings from anon;
