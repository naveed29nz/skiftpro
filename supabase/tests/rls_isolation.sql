-- Role and tenant isolation checks for the pre-launch policies.
-- Loaded by scripts/run-rls-tests.sh against a throwaway database.
-- Does not connect to the hosted Supabase project.

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
  ('org-a', 'Kiosk AS', '11111111-1111-1111-1111-111111111111', 'admin-a@example.com', 'active'),
  ('org-b', 'munawar2867', '22222222-2222-2222-2222-222222222222', 'admin-b@example.com', 'active');

insert into public.profiles (id, email, full_name, role) values
  ('00000000-0000-0000-0000-000000000001', 'super@example.com', 'Super', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'admin-a@example.com', 'Admin A', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'sub-a@example.com', 'Sub A', 'user'),
  ('44444444-4444-4444-4444-444444444444', 'sjef-a@example.com', 'Sjef A', 'user'),
  ('55555555-5555-5555-5555-555555555555', 'ansatt-a@example.com', 'Ansatt A', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'admin-b@example.com', 'Admin B', 'admin'),
  ('66666666-6666-6666-6666-666666666666', 'ansatt-b@example.com', 'Ansatt B', 'user');

insert into public.workers (id, org_id, name, email, role, teams, team_roles, hourly_rate) values
  ('w-sub-a', 'org-a', 'Sub A', 'sub-a@example.com', 'sub_admin', array['team1','team2'], '{"team1":"sub_admin","team2":"sub_admin"}', 300),
  ('w-sjef-a', 'org-a', 'Sjef A', 'sjef-a@example.com', 'butikksjef', array['team1'], '{"team1":"butikksjef"}', 250),
  ('w-ansatt-a', 'org-a', 'Ansatt A', 'ansatt-a@example.com', 'user', array['team1'], '{}', 200),
  ('w-other-a', 'org-a', 'Other A', 'other-a@example.com', 'user', array['team2'], '{}', 210),
  ('w-ansatt-b', 'org-b', 'Ansatt B', 'ansatt-b@example.com', 'user', array['team1'], '{}', 180);

insert into public.workplace_settings (id, org_id, workplace_name, latitude, longitude, radius_meters)
values ('ws-a', 'org-a', 'Kiosk', 59.914, 10.752, 150);

insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, team)
values
  ('shift-a1', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date, '08:00', '16:00', 'team1'),
  ('shift-a2', 'org-a', 'w-other-a', 'Other A', current_date, '08:00', '16:00', 'team2'),
  ('shift-b1', 'org-b', 'w-ansatt-b', 'Ansatt B', current_date, '08:00', '16:00', 'team1');

insert into public.tasks (id, org_id, title, team, created_by)
values ('task-leak', 'org-a', 'Secret task', 'team1', '66666666-6666-6666-6666-666666666666');

insert into public.dagsoppgjor (id, org_id, butikk, team, dato, pose_nummer, ansatt_navn, status)
values ('dag-a', 'org-a', 'team1', 'team1', current_date, '1', 'Ansatt A', 'Registrert');

insert into public.loddtelling (id, org_id, butikk, team, uke_nummer, year, loddtype, status)
values ('lodd-a', 'org-a', 'team1', 'team1', 1, 2026, 'test', 'utkast');

do $do$
declare
  detail text;
  n integer;
begin
  n := public._rls_count('66666666-6666-6666-6666-666666666666', $q$select id from public.workers where org_id = 'org-a'$q$);
  insert into rls_results values ('b cannot read org a workers', n = 0, n::text);

  n := public._rls_count('66666666-6666-6666-6666-666666666666', $q$select id from public.shifts where org_id = 'org-a'$q$);
  insert into rls_results values ('b cannot read org a shifts', n = 0, n::text);

  n := public._rls_count('66666666-6666-6666-6666-666666666666', $q$select id from public.tasks where id = 'task-leak'$q$);
  insert into rls_results values ('b cannot read leaked task via created_by', n = 0, n::text);

  n := public._rls_count('55555555-5555-5555-5555-555555555555', $q$select id from public.workers where org_id = 'org-b'$q$);
  insert into rls_results values ('a employee cannot read org b workers', n = 0, n::text);

  n := public._rls_count('00000000-0000-0000-0000-000000000001', $q$select id from public.workers$q$);
  insert into rls_results values ('super admin reads both orgs', n = 5, n::text);

  detail := public._rls_exec('44444444-4444-4444-4444-444444444444', $q$update public.shifts set notes = 'hack' where id = 'shift-a2'$q$);
  insert into rls_results values (
    'butikksjef cannot update other team shift',
    detail = 'ok' and (select notes is null from public.shifts where id = 'shift-a2'),
    detail
  );

  detail := public._rls_exec('11111111-1111-1111-1111-111111111111', $q$update public.shifts set notes = 'ok' where id = 'shift-a2'$q$);
  insert into rls_results values (
    'org admin can update other team shift',
    detail = 'ok' and (select notes = 'ok' from public.shifts where id = 'shift-a2'),
    detail
  );

  detail := public._rls_exec('44444444-4444-4444-4444-444444444444', $q$update public.workers set role = 'admin' where id = 'w-sjef-a'$q$);
  insert into rls_results values ('butikksjef cannot self-promote', detail like '%role change not permitted%', detail);

  detail := public._rls_exec('44444444-4444-4444-4444-444444444444', $q$update public.workers set hourly_rate = 999 where id = 'w-ansatt-a'$q$);
  insert into rls_results values ('butikksjef cannot change hourly rate', detail like '%role change not permitted%', detail);

  detail := public._rls_exec('33333333-3333-3333-3333-333333333333', $q$update public.workers set role = 'admin' where id = 'w-ansatt-a'$q$);
  insert into rls_results values ('sub_admin cannot grant admin', detail like '%role change not permitted%', detail);

  detail := public._rls_exec('11111111-1111-1111-1111-111111111111', $q$update public.workers set role = 'butikksjef' where id = 'w-other-a'$q$);
  insert into rls_results values (
    'org admin can set butikksjef',
    detail = 'ok' and (select role = 'butikksjef' from public.workers where id = 'w-other-a'),
    detail
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$insert into public.stamps (id, org_id, worker_id, worker_name, date, stamp_in, stamp_in_lat, stamp_in_lng) values ('stamp-far', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date, now(), 60.5, 10.752)$q$
  );
  insert into rls_results values ('employee far clock-in rejected', detail like '%Utenfor geofence%', detail);

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$insert into public.stamps (id, org_id, worker_id, worker_name, date, stamp_in, stamp_in_lat, stamp_in_lng) values ('stamp-ok', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date, now(), 59.9139, 10.7524)$q$
  );
  insert into rls_results values (
    'employee near clock-in stores coarse coords',
    detail = 'ok' and (select stamp_in_lat = 59.914 and stamp_in_lng = 10.752 and is_within_range from public.stamps where id = 'stamp-ok'),
    detail
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$update public.stamps set stamp_in = now() - interval '2 hours' where id = 'stamp-ok'$q$
  );
  insert into rls_results values ('employee cannot edit clock-in', detail like '%kan ikke endres%', detail);

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$update public.stamps set stamp_out = now(), stamp_out_lat = 59.9139, stamp_out_lng = 10.7524 where id = 'stamp-ok'$q$
  );
  insert into rls_results values (
    'employee can stamp out inside geofence',
    detail = 'ok' and (select stamp_out is not null from public.stamps where id = 'stamp-ok'),
    detail
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$delete from public.stamps where id = 'stamp-ok'$q$
  );
  insert into rls_results values (
    'employee cannot delete clock-in',
    detail like '%kan ikke slettes%'
      or (detail = 'ok' and exists (select 1 from public.stamps where id = 'stamp-ok')),
    detail
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$update public.dagsoppgjor set status = 'Kontrollert' where id = 'dag-a'$q$
  );
  insert into rls_results values (
    'butikksjef submit locks dagsoppgjor',
    detail = 'ok' and (select locked from public.dagsoppgjor where id = 'dag-a'),
    detail
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$update public.dagsoppgjor set kommentar = 'endret' where id = 'dag-a'$q$
  );
  insert into rls_results values ('butikksjef cannot edit locked dagsoppgjor', detail like '%låst%', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.dagsoppgjor set kommentar = 'admin' where id = 'dag-a'$q$
  );
  n := public._rls_count('11111111-1111-1111-1111-111111111111', $q$select id from public.settlement_audit where entity_id = 'dag-a' and action = 'admin_edit'$q$);
  insert into rls_results values ('admin edit of locked dagsoppgjor is audited', detail = 'ok' and n = 1, detail || ' audit=' || n::text);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.loddtelling set status = 'innsendt' where id = 'lodd-a'$q$
  );
  if detail <> 'ok' then
    insert into rls_results values ('employee cannot edit submitted loddtelling', false, 'submit failed: ' || detail);
  else
    detail := public._rls_exec(
      '55555555-5555-5555-5555-555555555555',
      $q$update public.loddtelling set kommentar = 'nei' where id = 'lodd-a'$q$
    );
    insert into rls_results values ('employee cannot edit submitted loddtelling', detail like '%låst%', detail);
  end if;

  insert into public.profiles (id, email, full_name, role, terms_accepted_at)
  values ('77777777-7777-7777-7777-777777777777', 'ny@example.com', 'Ny kunde', 'user', now());

  detail := public._rls_exec(
    '77777777-7777-7777-7777-777777777777',
    $q$select public.start_organization('Ny Kiosk', '999999999', '12345678', 'Sentrum', 'Ny kunde', 2)$q$
  );
  insert into rls_results values (
    'self-serve creates own org and not the other customer',
    detail = 'ok'
      and (select role = 'admin' and full_name = 'Ny kunde' from public.profiles where id = '77777777-7777-7777-7777-777777777777')
      and public._rls_count('77777777-7777-7777-7777-777777777777', $q$select id from public.workers where org_id = 'org-b'$q$) = 0
      and public._rls_count('77777777-7777-7777-7777-777777777777', $q$select id from public.organizations where name = 'Ny Kiosk' and org_number = '999999999' and contact_name = 'Ny kunde' and contact_phone = '12345678' and store_quantity = 2 and customer_number ~ '^[0-9]{5}$' and admin_email = 'ny@example.com'$q$) = 1,
    detail
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
