-- Digital contract checks. Loaded after the schema migrations on a throwaway
-- database. Does not connect to the hosted Supabase project.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into public.workers (
  id, org_id, name, email, role, teams, hourly_rate, employment_percentage,
  ansettelsestype, timer_per_uke, status
) values (
  'w-ot', 'org-a', 'Overtid', 'ot@example.com', 'user', array['team1'],
  210, 50, 'fast', 20, 'active'
);

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status, hourly_rate,
  template_key, body_snapshot, field_values, start_date, end_date
) values (
  'c-wage', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', 200,
  'fast', 'Timelønn 200 kroner', '{"timelonn":"200"}'::jsonb, current_date, current_date + 30
);

insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
values (
  'c-wage',
  '55555555-5555-5555-5555-555555555555',
  'ansatt',
  encode(digest('123456:c-wage', 'sha256'), 'hex'),
  now() + interval '10 minutes'
);

do $do$
declare
  detail text;
  n integer;
  doc text;
  rendered text;
begin
  rendered := public.render_mustache(
    E'Hei {{navn}}\n{{#tariff}}Tariff{{/tariff}}\n{{^tariff}}Ikke{{/tariff}}\n{{#ub_tillegg}}{{navn}} {{sats}}\n{{/ub_tillegg}}',
    '{"navn":"Ola","tariff":false,"ub_tillegg":[{"navn":"Kveld","sats":"20 %"}]}'::jsonb
  );
  insert into rls_results values (
    'mustache keeps inverse block and repeats a list',
    rendered = E'Hei Ola\n\nIkke\nKveld 20 %\n',
    rendered
  );

  rendered := public.render_mustache('{{navn}}', '{"navn":"<script>"}'::jsonb);
  insert into rls_results values (
    'mustache escapes markup',
    rendered = E'&lt;script&gt;\n',
    rendered
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select body_snapshot from public.contracts where id = 'c-wage'$q$
  );
  insert into rls_results values (
    'butikksjef cannot read contract text',
    detail like '%permission denied%',
    detail
  );

  n := public._rls_count(
    '44444444-4444-4444-4444-444444444444',
    $q$select id from public.contracts where id = 'c-wage'$q$
  );
  insert into rls_results values ('butikksjef sees contract status in own store', n = 1, n::text);

  perform set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444')::text, true);
  execute 'set local role authenticated';
  doc := public.contract_document('c-wage')::text;
  execute 'reset role';
  insert into rls_results values (
    'butikksjef gets no wage document',
    doc is null,
    coalesce(doc, 'null')
  );

  n := public._rls_count(
    '66666666-6666-6666-6666-666666666666',
    $q$select id from public.contracts where id = 'c-wage'$q$
  );
  insert into rls_results values ('employee cannot read another orgs contract', n = 0, n::text);

  detail := public._rls_exec(
    '66666666-6666-6666-6666-666666666666',
    $q$select public.complete_contract_signature('c-wage', 'ansatt', '123456', null, null)$q$
  );
  insert into rls_results values (
    'employee cannot sign someone elses contract',
    detail like '%Ansattens signatur kan bare avgis av den ansatte selv%',
    detail
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$select public.complete_contract_signature('c-wage', 'ansatt', '123456', null, null)$q$
  );
  insert into rls_results values (
    'admin cannot sign as the employee',
    detail like '%Ansattens signatur kan bare avgis av den ansatte selv%',
    detail
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$update public.contracts set status = 'signert_ansatt', approved_by_worker_id = '44444444-4444-4444-4444-444444444444' where id = 'c-wage'$q$
  );
  insert into rls_results values (
    'store manager cannot approve on behalf of the employee',
    (select status from public.contracts where id = 'c-wage') = 'sendt',
    detail || ' status=' || (select status from public.contracts where id = 'c-wage')
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.contracts set status = 'signert_ansatt', employee_signed_at = now(), approved_by_worker_id = '11111111-1111-1111-1111-111111111111' where id = 'c-wage'$q$
  );
  insert into rls_results values (
    'admin update cannot record the employee signature',
    detail like '%Ansattens signatur kan bare avgis av den ansatte selv%',
    detail
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select public.complete_contract_signature('c-wage', 'ansatt', '123456', '203.0.113.8', 'test-agent')$q$
  );
  insert into rls_results values (
    'employee signs own contract with the one-time code',
    detail = 'ok' and (select status = 'signert_ansatt' from public.contracts where id = 'c-wage'),
    detail
  );

  perform set_config('request.jwt.claims', '', true);
  update public.contracts
    set status = 'signert', employer_signed_at = now(), employer_signed_by = '11111111-1111-1111-1111-111111111111'
    where id = 'c-wage';

  begin
    update public.contracts set body_snapshot = 'endret' where id = 'c-wage';
    detail := 'updated';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'signed contract text cannot be changed',
    detail like '%Signert avtale kan ikke endres%',
    detail
  );

  insert into public.contract_events (contract_id, org_id, event_type, actor_role)
  values ('c-wage', 'org-a', 'opprettet', 'system');
  begin
    update public.contract_events set actor_role = 'endret' where contract_id = 'c-wage';
    detail := 'updated';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'contract events are append-only',
    detail like '%append-only%',
    detail
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('ot-1', 'org-a', 'w-ot', 'Overtid', date '2026-10-12', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-2', 'org-a', 'w-ot', 'Overtid', date '2026-10-13', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-3', 'org-a', 'w-ot', 'Overtid', date '2026-10-14', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-4', 'org-a', 'w-ot', 'Overtid', date '2026-10-19', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-5', 'org-a', 'w-ot', 'Overtid', date '2026-10-20', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-6', 'org-a', 'w-ot', 'Overtid', date '2026-10-21', '08:00', '16:00', 0, 'scheduled', 'team1');

  n := (select count(*) from public.contracts where worker_id = 'w-ot' and contract_type = 'merarbeid' and status <> 'trukket');
  insert into rls_results values (
    'extra-hours trigger merges consecutive weeks into one period',
    n = 1
      and (select start_date = date '2026-10-12' and end_date = date '2026-10-25' from public.contracts where worker_id = 'w-ot' and contract_type = 'merarbeid' and status <> 'trukket'),
    n::text
  );

  perform public.check_overtime_for_shift('w-ot', date '2026-10-12');
  n := (select count(*) from public.contracts where worker_id = 'w-ot' and contract_type = 'merarbeid' and status <> 'trukket');
  insert into rls_results values (
    'extra-hours trigger is idempotent',
    n = 1,
    n::text
  );

  update public.shifts set status = 'cancelled' where worker_id = 'w-ot';
  n := (select count(*) from public.contracts where worker_id = 'w-ot' and status = 'trukket');
  insert into rls_results values (
    'unsigned extra-hours agreement is withdrawn when the shifts go away',
    n = 1,
    n::text
  );
end
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
