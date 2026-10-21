-- Employee signup must attach to a worker card and must not open a new organization.
-- Throwaway database only. Requires 20261021130000_employee_signup_link.sql.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

do $do$
declare
  detail text;
  got_org text;
  got_worker text;
  got_role text;
  card_email text;
  profile_role text;
  kind text;
  filled integer;
begin
  insert into public.organizations (id, name, status, plan)
  values ('org-emp', 'Ansattbutikken', 'active', 'basic');

  insert into public.workers (id, org_id, name, email, phone, status, role)
  values
    ('w-ada', 'org-emp', 'Ada', 'Ada@Butikk.no', '90000001', 'active', 'butikksjef'),
    ('w-phone', 'org-emp', 'Bo', null, '+47 912 34 567', 'active', 'sub_admin'),
    ('w-phone-2', 'org-emp', 'Duo', '', '4791234999', 'active', 'user'),
    ('w-phone-3', 'org-emp', 'Duo to', ' ', '91234999', 'active', 'user'),
    ('w-admin-card', 'org-emp', 'Kari', 'kari@butikk.no', '90000002', 'active', 'admin'),
    ('w-old-admin', 'org-emp', 'Per', 'per@butikk.no', '90000003', 'active', 'user'),
    ('w-inactive', 'org-emp', 'Ute', 'ute@butikk.no', '90000004', 'inactive', 'user'),
    ('w-taken', 'org-emp', 'Tatt', 'tatt@butikk.no', '912 34 567', 'active', 'user');

  insert into public.profiles (id, email, full_name, role, terms_accepted_at)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'ada@butikk.no', 'Ada', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bo@butikk.no', 'Bo', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'flere@butikk.no', 'Flere', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'kari@butikk.no', 'Kari', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'per@butikk.no', 'Per', 'admin', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'ute@butikk.no', 'Ute', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'nybedrift@butikk.no', 'Ny', 'user', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8', 'tatt@annen.no', 'Annen', 'user', now());

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')::text, true);
  select c.org_id, c.worker_id, c.role into got_org, got_worker, got_role
  from public.claim_worker_card(null) c;
  select email into card_email from public.workers where id = 'w-ada';
  select role into profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  insert into rls_results values (
    'email match links case-insensitively and copies butikksjef',
    got_org = 'org-emp' and got_worker = 'w-ada' and got_role = 'butikksjef'
      and profile_role = 'butikksjef' and card_email = 'Ada@Butikk.no',
    coalesce(got_role, '') || ' profile=' || coalesce(profile_role, '') || ' email=' || coalesce(card_email, '')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2')::text, true);
  select c.org_id, c.worker_id, c.role into got_org, got_worker, got_role
  from public.claim_worker_card('+47 912 34 567') c;
  select w.email into card_email from public.workers w where w.id = 'w-phone';
  select p.role into profile_role from public.profiles p where p.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  insert into rls_results values (
    'unique empty-email phone match writes profile email and sub_admin',
    got_worker = 'w-phone' and got_role = 'sub_admin' and card_email = 'bo@butikk.no' and profile_role = 'sub_admin',
    coalesce(got_worker, '') || ' email=' || coalesce(card_email, '') || ' role=' || coalesce(profile_role, '')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3')::text, true);
  got_worker := null;
  select c.worker_id into got_worker from public.claim_worker_card('4791234999') c;
  select count(*) into filled from public.workers where id in ('w-phone-2', 'w-phone-3') and btrim(coalesce(email, '')) <> '';
  insert into rls_results values (
    'ambiguous phone match links nobody',
    got_worker is null and filled = 0,
    coalesce(got_worker, 'none') || ' filled=' || filled::text
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4')::text, true);
  select c.role into got_role from public.claim_worker_card(null) c;
  select role into profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
  insert into rls_results values (
    'worker admin card does not grant profile admin',
    got_role = 'user' and profile_role = 'user',
    coalesce(got_role, '') || '/' || coalesce(profile_role, '')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5')::text, true);
  select c.role into got_role from public.claim_worker_card(null) c;
  select role into profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
  insert into rls_results values (
    'existing profile admin is not downgraded',
    got_role = 'admin' and profile_role = 'admin',
    coalesce(profile_role, '')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6')::text, true);
  got_worker := null;
  select c.worker_id into got_worker from public.claim_worker_card('90000004') c;
  select role into profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6';
  insert into rls_results values (
    'inactive worker is not claimed',
    got_worker is null and profile_role = 'user',
    coalesce(got_worker, 'none')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8')::text, true);
  got_worker := null;
  select c.worker_id into got_worker from public.claim_worker_card('91234567') c;
  select email into card_email from public.workers where id = 'w-taken';
  insert into rls_results values (
    'phone match ignores cards that already have an email',
    got_worker is null and card_email = 'tatt@butikk.no',
    coalesce(got_worker, 'none')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')::text, true);
  begin
    perform public.start_organization('Ada sitt firma', null, null, null);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'active worker cannot start an organization',
    detail = 'Du er registrert som ansatt. Logg inn som ansatt.',
    detail
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7')::text, true);
  begin
    perform public.start_organization('Ny bedrift', '123', '900', 'Butikken');
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select role into profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
  insert into rls_results values (
    'signup without a worker card can still start an organization',
    detail = 'ok' and profile_role = 'admin',
    detail || ' role=' || coalesce(profile_role, '')
  );

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9',
    'kind@butikk.no',
    jsonb_build_object('signup', 'self_serve', 'signup_kind', 'employee', 'role', 'admin', 'terms_accepted', 'true', 'full_name', 'Kind')
  );
  select signup_kind, role into kind, profile_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9';
  insert into rls_results values (
    'handle_new_user stores signup_kind and keeps self-serve as user',
    kind = 'employee' and profile_role = 'user',
    coalesce(kind, '') || '/' || coalesce(profile_role, '')
  );

  perform set_config('request.jwt.claims', '', true);
exception when others then
  insert into rls_results values ('employee signup link test crashed', false, sqlerrm);
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
