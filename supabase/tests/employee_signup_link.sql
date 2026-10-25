-- Employee signup must attach to a worker card and must not open a new organization.
-- Throwaway database only. Requires 20261021130000_employee_signup_link.sql
-- and 20261021140000_claim_worker_card_email_only.sql. Linking is email-only.

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
  got_name text;
  got_org_number text;
  got_contact text;
  got_phone text;
  got_contact_email text;
  got_admin_email text;
  got_customer text;
  kept_customer text;
  got_full_name text;
  got_stores integer;
  got_workplace text;
  got_teams integer;
  got_admin_user text;
  max_before integer;
begin
  insert into public.organizations (id, name, status, plan)
  values ('org-emp', 'Ansattbutikken', 'active', 'basic');

  select customer_number into kept_customer from public.organizations where id = 'org-emp';
  insert into public.organizations (id, name, status, plan, customer_number)
  values ('org-forced', 'Tvang', 'active', 'basic', '00001');
  select customer_number into got_customer from public.organizations where id = 'org-forced';
  insert into rls_results values (
    'new organization ignores a client customer number',
    kept_customer ~ '^[0-9]{5}$'
      and got_customer ~ '^[0-9]{5}$'
      and got_customer <> '00001'
      and got_customer::int = kept_customer::int + 1,
    coalesce(got_customer, '') || ' after ' || coalesce(kept_customer, '')
  );

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
  got_worker := null;
  got_role := null;
  select c.worker_id, c.role into got_worker, got_role
  from public.claim_worker_card('+47 912 34 567') c;
  select w.email into card_email from public.workers w where w.id = 'w-phone';
  select p.role into profile_role from public.profiles p where p.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  insert into rls_results values (
    'phone argument does not link a card or change the profile',
    got_worker is null and got_role is null and card_email is null and profile_role = 'user',
    coalesce(got_worker, 'none') || ' email=' || coalesce(card_email, '') || ' role=' || coalesce(profile_role, '')
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
    perform public.start_organization('Ada sitt firma', null, null, null, null, null);
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
    perform public.start_organization('Ny bedrift', '123', '90011222', 'Butikken', 'Kari Nordmann', 2);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'organisation number must pass mod11',
    detail = 'Organisasjonsnummeret er ugyldig',
    detail
  );

  select coalesce(max(customer_number::int), 0) into max_before
  from public.organizations
  where customer_number ~ '^[0-9]+$';
  begin
    perform public.start_organization('Ny bedrift', '123456785', '90011222', 'Ny bedrift', 'Kari Nordmann', 2);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select o.name, o.org_number, o.contact_name, o.contact_phone, o.contact_email, o.admin_email,
         o.customer_number, o.store_quantity, p.full_name, p.role
    into got_name, got_org_number, got_contact, got_phone, got_contact_email, got_admin_email,
         got_customer, got_stores, got_full_name, profile_role
  from public.organizations o
  join public.profiles p on p.id = o.admin_user_id
  where o.admin_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
  select w.workplace_name, w.active_teams_count
    into got_workplace, got_teams
  from public.workplace_settings w
  join public.organizations o on o.id = w.org_id
  where o.admin_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7';
  insert into rls_results values (
    'signup without a worker card stores company and contact person',
    detail = 'ok'
      and got_name = 'Ny bedrift'
      and got_org_number = '123456785'
      and got_contact = 'Kari Nordmann'
      and got_phone = '90011222'
      and got_contact_email = 'nybedrift@butikk.no'
      and got_admin_email = 'nybedrift@butikk.no'
      and got_full_name = 'Kari Nordmann'
      and profile_role = 'admin'
      and got_stores = 2
      and got_workplace = 'Ny bedrift'
      and got_teams = 1
      and got_customer ~ '^[0-9]{5}$'
      and got_customer::int = max_before + 1,
    detail || ' name=' || coalesce(got_name, '') || ' person=' || coalesce(got_full_name, '')
      || ' kunde=' || coalesce(got_customer, '')
  );

  alter table public.organizations disable trigger organizations_assign_customer_number;
  begin
    insert into public.organizations (
      id, name, admin_user_id, admin_email, status, plan, org_number, customer_number, contact_name, contact_phone
    ) values (
      'org-omar', 'Omar Altarshan', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10', 'owner@example.com',
      'trial', 'basic', null, null, null, null
    );
    alter table public.organizations enable trigger organizations_assign_customer_number;
  exception when others then
    alter table public.organizations enable trigger organizations_assign_customer_number;
    raise;
  end;
  insert into public.profiles (id, email, full_name, role, terms_accepted_at)
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10', 'omar-test@example.com', 'Narvesen Moss jbst', 'admin', now()
  );

  update public.organizations set notes = 'urørt' where id = 'org-omar';
  select name, org_number, customer_number, contact_name into got_name, got_org_number, got_customer, got_contact
  from public.organizations where id = 'org-omar';
  insert into rls_results values (
    'existing organization without org number is not rewritten by an unrelated update',
    got_name = 'Omar Altarshan' and got_org_number is null and got_customer is null and got_contact is null,
    coalesce(got_name, '') || ' kunde=' || coalesce(got_customer, 'null')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1')::text, true);
  begin
    perform public.complete_organization_profile('Narvesen Moss jbst', '123456785', 'Omar Altarshan', '90011122', 4);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select customer_number into kept_customer from public.organizations where id = 'org-omar';
  insert into rls_results values (
    'employee cannot complete another organization',
    detail = 'Bare administrator for organisasjonen kan fylle ut dette.' and kept_customer is null,
    detail
  );

  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10')::text, true);
  begin
    perform public.complete_organization_profile('Narvesen Moss jbst', '123', 'Omar Altarshan', '90011122', 4);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select org_number into got_org_number from public.organizations where id = 'org-omar';
  insert into rls_results values (
    'completion rejects an invalid organisation number',
    detail = 'Organisasjonsnummeret er ugyldig' and got_org_number is null,
    detail
  );

  begin
    perform public.complete_organization_profile('Narvesen Moss jbst', '123456785', 'Omar Altarshan', '90011122', 4);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select o.name, o.org_number, o.contact_name, o.contact_phone, o.contact_email, o.admin_email,
         o.customer_number, o.store_quantity, o.admin_user_id, p.full_name
    into got_name, got_org_number, got_contact, got_phone, got_contact_email, got_admin_email,
         got_customer, got_stores, got_admin_user, got_full_name
  from public.organizations o
  join public.profiles p on p.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10'
  where o.id = 'org-omar';
  insert into rls_results values (
    'org admin can complete missing company details once',
    detail = 'ok'
      and got_name = 'Narvesen Moss jbst'
      and got_org_number = '123456785'
      and got_contact = 'Omar Altarshan'
      and got_phone = '90011122'
      and got_contact_email = 'omar-test@example.com'
      and got_admin_email = 'owner@example.com'
      and got_admin_user = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10'
      and got_full_name = 'Omar Altarshan'
      and got_stores = 4
      and got_customer ~ '^[0-9]{5}$',
    detail || ' name=' || coalesce(got_name, '') || ' kunde=' || coalesce(got_customer, '')
  );

  begin
    perform public.complete_organization_profile('Annet navn', '999999999', 'Annen Person', '111', 1);
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  select name into got_name from public.organizations where id = 'org-omar';
  insert into rls_results values (
    'completed organisation is not edited again through the completion form',
    detail = 'Organisasjonsnummeret er allerede registrert' and got_name = 'Narvesen Moss jbst',
    detail || ' name=' || coalesce(got_name, '')
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
