-- Alert dismiss state, onboarding visibility, and the demo seed.
-- Loaded by scripts/run-rls-tests.sh against a throwaway database.

create temp table rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

create or replace function public._rls_count(uid text, query text)
returns integer
language plpgsql
as $q$
declare
  n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  execute 'set local role authenticated';
  execute 'select count(*)::integer from (' || query || ') q' into n;
  execute 'reset role';
  return n;
end;
$q$;

create or replace function public._rls_exec(uid text, statement text)
returns text
language plpgsql
as $q$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  execute 'set local role authenticated';
  execute statement;
  execute 'reset role';
  return 'ok';
exception when others then
  begin
    execute 'reset role';
  exception when others then
    null;
  end;
  return sqlerrm;
end;
$q$;

insert into public.organizations (id, name, admin_user_id, admin_email, status)
values
  ('org-alert-a', 'Kiosk Alert AS', 'aa111111-1111-4111-8111-111111111111', 'alert-admin-a@example.com', 'active'),
  ('org-alert-b', 'Annen kjede AS', 'aa222222-2222-4222-8222-222222222222', 'alert-admin-b@example.com', 'active'),
  ('6a2b315a825e7ecca4d5f246', 'Ekte kunde AS', null, 'real-alert@example.com', 'active'),
  ('de30000000000000000000a1', 'Narvesen Demo AS', null, 'demo.admin@demo.skiftpro.invalid', 'active')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role) values
  ('aa000000-0000-4000-8000-000000000001', 'alert-super@example.com', 'Alert Super', 'admin'),
  ('aa111111-1111-4111-8111-111111111111', 'alert-admin-a@example.com', 'Alert Admin A', 'admin'),
  ('aa444444-4444-4444-8444-444444444444', 'alert-sjef-a@example.com', 'Alert Sjef A', 'user'),
  ('aa555555-5555-4555-8555-555555555555', 'alert-ansatt-a@example.com', 'Alert Ansatt A', 'user'),
  ('aa222222-2222-4222-8222-222222222222', 'alert-admin-b@example.com', 'Alert Admin B', 'admin');

insert into public.workers (id, org_id, name, email, phone, address, role, teams, team_roles, hourly_rate, ansettelsestype) values
  ('w-alert-sjef', 'org-alert-a', 'Sjef A', 'alert-sjef-a@example.com', '40000001', 'Sjefgate 1', 'butikksjef', array['team1'], '{"team1":"butikksjef"}', 250, 'fast'),
  ('w-alert-ansatt', 'org-alert-a', 'Ansatt A', 'alert-ansatt-a@example.com', null, null, 'user', array['team1'], '{}', 200, 'midlertidig_vikar'),
  ('w-alert-other', 'org-alert-a', 'Other A', 'alert-other-a@example.com', '40000002', 'Annen gate 2', 'user', array['team2'], '{}', 210, 'fast'),
  ('w-real', '6a2b315a825e7ecca4d5f246', 'Ekte Ansatt', 'real.worker@example.com', '90000000', 'Ekte gate 9', 'user', array['team1'], '{}', 333, 'fast'),
  ('manual-demo-worker', 'de30000000000000000000a1', 'Manuell Demo', 'manual@demo.skiftpro.invalid', '41111111', 'Manual gate 3', 'user', array['team2'], '{}', 999, 'fast');

insert into public.contracts (id, org_id, worker_id, worker_name, contract_type, status, sent_at)
values ('c-ansatt', 'org-alert-a', 'w-alert-ansatt', 'Ansatt A', 'midlertidig_vikar', 'sendt', current_date - 3);

insert into public.availability (id, org_id, worker_id, worker_name, date, status)
values ('av-other', 'org-alert-a', 'w-alert-other', 'Other A', current_date, 'available');

insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, team, created_by)
values ('real-shift', '6a2b315a825e7ecca4d5f246', 'w-real', 'Ekte Ansatt', current_date, '08:00', '16:00', 'team1', 'keep-me');

do $do$
declare
  detail text;
  n integer;
  got_phone text;
  got_rate double precision;
  dumped text;
begin
  detail := public._rls_exec(
    'aa555555-5555-4555-8555-555555555555',
    $q$insert into public.alert_states (org_id, user_id, alert_key) values ('org-alert-a', 'aa555555-5555-4555-8555-555555555555', 'unsigned:c-ansatt')$q$
  );
  insert into rls_results values (
    'employee cannot save manager alerts',
    detail like '%ikke tilgang%' or detail like '%row-level security%',
    detail
  );

  detail := public._rls_exec(
    'aa444444-4444-4444-8444-444444444444',
    $q$insert into public.alert_states (org_id, user_id, alert_key, read_at) values ('org-alert-a', 'aa444444-4444-4444-8444-444444444444', 'open:team1', now())$q$
  );
  detail := public._rls_exec(
    'aa444444-4444-4444-8444-444444444444',
    $q$update public.alert_states set user_id = 'aa111111-1111-4111-8111-111111111111' where alert_key = 'open:team1'$q$
  );
  insert into rls_results values (
    'butikksjef alert row stays on their own user',
    detail = 'ok'
      and (select user_id = 'aa444444-4444-4444-8444-444444444444' and read_at is not null from public.alert_states where alert_key = 'open:team1'),
    detail
  );

  n := public._rls_count('aa555555-5555-4555-8555-555555555555', $q$select alert_key from public.alert_states$q$);
  insert into rls_results values ('employee cannot read alert state', n = 0, n::text);

  n := public._rls_count('aa222222-2222-4222-8222-222222222222', $q$select alert_key from public.alert_states$q$);
  insert into rls_results values ('other org cannot read alert state', n = 0, n::text);

  detail := public._rls_exec(
    'aa555555-5555-4555-8555-555555555555',
    $q$select public.save_own_contact('900 11 223', 'Bjørndalsjordet 33, 1270 Oslo')$q$
  );
  select w.phone, w.hourly_rate into got_phone, got_rate from public.workers w where w.id = 'w-alert-ansatt';
  insert into rls_results values (
    'employee can save phone and address without changing pay',
    detail = 'ok' and got_phone = '900 11 223' and got_rate = 200
      and (select address = 'Bjørndalsjordet 33, 1270 Oslo' from public.workers where id = 'w-alert-ansatt'),
    detail || ' phone=' || coalesce(got_phone, '') || ' rate=' || coalesce(got_rate::text, '')
  );

  detail := public._rls_exec(
    'aa555555-5555-4555-8555-555555555555',
    $q$select public.save_own_contact('', 'Gate 1')$q$
  );
  insert into rls_results values ('blank phone is rejected', detail like '%telefonnummer%', detail);

  select w.phone into got_phone from public.workers w where w.id = 'w-alert-sjef';
  detail := public._rls_exec(
    'aa444444-4444-4444-8444-444444444444',
    $q$select public.save_own_contact('400 00 099', 'Ny sjefgate 4')$q$
  );
  insert into rls_results values (
    'contact update does not rewrite a colleague',
    detail = 'ok'
      and (select phone = '900 11 223' from public.workers where id = 'w-alert-ansatt')
      and (select phone = '400 00 099' from public.workers where id = 'w-alert-sjef'),
    detail
  );

  detail := public._rls_exec(
    'aa555555-5555-4555-8555-555555555555',
    $q$insert into public.onboarding_progress (org_id, user_id, worker_id, dismissed_at) values ('org-alert-a', 'aa555555-5555-4555-8555-555555555555', 'w-alert-other', now())$q$
  );
  insert into rls_results values (
    'employee cannot write a colleague checklist',
    detail like '%ikke tilgang%' or detail like '%row-level security%',
    detail
  );

  detail := public._rls_exec(
    'aa555555-5555-4555-8555-555555555555',
    $q$insert into public.onboarding_progress (org_id, user_id, worker_id, notifications_done_at) values ('org-alert-a', 'aa555555-5555-4555-8555-555555555555', 'w-alert-ansatt', now())$q$
  );
  if detail = 'ok' then
    detail := public._rls_exec(
      'aa555555-5555-4555-8555-555555555555',
      $q$update public.onboarding_progress set user_id = 'aa444444-4444-4444-8444-444444444444' where worker_id = 'w-alert-ansatt'$q$
    );
  end if;
  insert into rls_results values (
    'employee checklist stays on their own user',
    detail = 'ok' and (select user_id = 'aa555555-5555-4555-8555-555555555555' and notifications_done_at is not null from public.onboarding_progress where worker_id = 'w-alert-ansatt'),
    detail
  );

  n := public._rls_count('aa555555-5555-4555-8555-555555555555', $q$select worker_id from public.onboarding_overview('org-alert-a')$q$);
  insert into rls_results values ('employee overview is empty', n = 0, n::text);

  n := public._rls_count('aa444444-4444-4444-8444-444444444444', $q$select worker_id from public.onboarding_overview('org-alert-a') where worker_id = 'w-alert-other'$q$);
  insert into rls_results values ('butikksjef does not see another store', n = 0, n::text);

  n := public._rls_count(
    'aa444444-4444-4444-8444-444444444444',
    $q$select worker_id from public.onboarding_overview('org-alert-a') where worker_id = 'w-alert-ansatt' and pending_contracts = 1 and has_phone and has_address and notifications_done$q$
  );
  insert into rls_results values ('butikksjef sees own store onboarding flags', n = 1, n::text);

  perform set_config('request.jwt.claims', json_build_object('sub', 'aa111111-1111-4111-8111-111111111111')::text, true);
  select coalesce(string_agg(row_to_json(q)::text, ' '), '') into dumped
  from public.onboarding_overview('org-alert-a') q;
  insert into rls_results values (
    'overview does not return phone address or wage',
    dumped not like '%900 11 223%' and dumped not like '%Bjørndalsjordet%' and dumped not like '%333%' and dumped not like '%210%',
    left(dumped, 240)
  );

  n := public._rls_count('aa222222-2222-4222-8222-222222222222', $q$select worker_id from public.onboarding_overview('org-alert-a')$q$);
  insert into rls_results values ('other org overview is empty', n = 0, n::text);

  n := public._rls_count('aa000000-0000-4000-8000-000000000001', $q$select worker_id from public.onboarding_overview('6a2b315a825e7ecca4d5f246')$q$);
  insert into rls_results values ('super admin can read one selected org', n = 1, n::text);
end
$do$;

\ir ../migrations/20261118140100_demo_alert_seed.sql

update public.workers set hourly_rate = 999 where id = 'demo-alert-mia';

\ir ../migrations/20261118140100_demo_alert_seed.sql

do $do$
declare
  n integer;
  detail text;
begin
  insert into rls_results values (
    'real customer is untouched',
    (select count(*) = 1 and min(hourly_rate) = 333 and min(phone) = '90000000' from public.workers where org_id = '6a2b315a825e7ecca4d5f246')
      and (select count(*) = 1 and min(created_by) = 'keep-me' from public.shifts where org_id = '6a2b315a825e7ecca4d5f246')
      and not exists (select 1 from public.contracts where org_id = '6a2b315a825e7ecca4d5f246'),
    null
  );

  insert into rls_results values (
    'manual demo worker is not rewritten',
    (select count(*) = 1 and min(hourly_rate) = 999 and min(phone) = '41111111' from public.workers where id = 'manual-demo-worker'),
    null
  );

  insert into rls_results values (
    'seed does not rewrite the example wage',
    (select hourly_rate = 999 from public.workers where id = 'demo-alert-mia'),
    (select hourly_rate::text from public.workers where id = 'demo-alert-mia')
  );

  insert into rls_results values (
    'new employee is missing phone and has a sent contract',
    (select phone is null and address is null from public.workers where id = 'demo-alert-mia')
      and (select status = 'sendt' and sent_at::date = current_date - 6 from public.contracts where id = 'demo-alert-c-mia'),
    null
  );

  insert into rls_results values (
    'temporary contract ends within a week',
    (select status = 'signert' and end_date = current_date + 4 from public.contracts where id = 'demo-alert-c-nora'),
    (select end_date::text from public.contracts where id = 'demo-alert-c-nora')
  );

  n := (select count(*) from public.shifts
        where org_id = 'de30000000000000000000a1'
          and id like 'demo-alert-s-draft-%'
          and published = false
          and team = 'team1'
          and date >= date_trunc('week', current_date)::date + 7);
  insert into rls_results values ('next week has four unpublished Sentrum shifts', n = 4, n::text);

  n := (select count(*) from public.shifts
        where id like 'demo-alert-s-open-%' and worker_id = 'ledig' and published = true);
  insert into rls_results values ('open shifts are published and unassigned', n = 6, n::text);

  insert into rls_results values (
    'clocked examples sit on yesterday',
    (select count(*) = 3 from public.stamps where id like 'demo-alert-st-%' and date = current_date - 1)
      and (select stamp_out is null from public.stamps where id = 'demo-alert-st-mia')
      and (select stamp_out is not null from public.stamps where id = 'demo-alert-st-jonas'),
    null
  );

  n := (select count(*) from public.contracts where id like 'demo-alert-c-%');
  insert into rls_results values ('seed contracts stay at three after two runs', n = 3, n::text);

  select string_agg(name, ', ') into detail from rls_results where not ok;
  if detail is not null then
    raise notice 'alert onboarding failures: %', detail;
  end if;
end
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
