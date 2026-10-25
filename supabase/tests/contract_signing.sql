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
  sent_before integer;
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

  insert into public.employer_settings (id, org_id, send_tilleggsavtaler_automatisk, ekstratimer_periode, alminnelig_ukentlig_arbeidstid)
  values ('es-month', 'org-a', true, 'maaned', 37.5);

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status,
    start_date, end_date, generated_automatically, body_snapshot, metadata, contract_kind
  ) values (
    'c-weekly-ot', 'org-a', 'w-ot', 'Overtid', 'merarbeid', 'utkast',
    date '2026-10-12', date '2026-10-18', true, 'UKENTLIG UTKAST', '{}'::jsonb, 'merarbeid'
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

  n := (select count(*) from public.contracts where worker_id = 'w-ot' and coalesce(metadata ->> 'periode', '') = 'maaned');
  insert into rls_results values (
    'weeks over the weekly rate offset inside the month and create no contract',
    n = 0
      and (select status = 'utkast' and start_date = date '2026-10-12' and end_date = date '2026-10-18' and body_snapshot = 'UKENTLIG UTKAST' from public.contracts where id = 'c-weekly-ot'),
    n::text
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('ot-7', 'org-a', 'w-ot', 'Overtid', date '2026-10-05', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-8', 'org-a', 'w-ot', 'Overtid', date '2026-10-06', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-9', 'org-a', 'w-ot', 'Overtid', date '2026-10-07', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-10', 'org-a', 'w-ot', 'Overtid', date '2026-10-08', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('ot-11', 'org-a', 'w-ot', 'Overtid', date '2026-10-09', '08:00', '16:00', 0, 'scheduled', 'team1');

  n := (select count(*) from public.contracts where worker_id = 'w-ot' and coalesce(metadata ->> 'periode', '') = 'maaned');
  insert into rls_results values (
    'eighty eight hours stays inside the october quota of twenty hours times 31/7',
    n = 0,
    n::text
  );

  sent_before := (
    select count(*) from public.notification_outbox
    where org_id = 'org-a' and kind = 'contract_sent'
  );
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values (
    'ot-12', 'org-a', 'w-ot', 'Overtid', date '2026-10-26', '08:00', '16:00', 0, 'scheduled', 'team1'
  );

  select format(
    'status=%s %s..%s ot=%s wh=%s sent_events=%s notes=%s body=%s',
    c.status, c.start_date, c.end_date, c.overtime_hours, c.weekly_hours,
    (select count(*) from public.contract_events e where e.contract_id = c.id and e.event_type = 'sendt'),
    (select count(*) from public.notification_outbox nfy where nfy.org_id = 'org-a' and nfy.kind = 'contract_sent') - sent_before,
    left(c.body_snapshot, 240)
  )
  into detail
  from public.contracts c
  where c.worker_id = 'w-ot' and coalesce(c.metadata ->> 'periode', '') = 'maaned' and c.status <> 'trukket';

  n := (select count(*) from public.contracts where worker_id = 'w-ot' and coalesce(metadata ->> 'periode', '') = 'maaned' and status <> 'trukket');
  insert into rls_results values (
    'one monthly draft covers the calendar month with the excess hours and is not sent',
    n = 1
      and exists (
        select 1 from public.contracts c
        where c.worker_id = 'w-ot'
          and coalesce(c.metadata ->> 'periode', '') = 'maaned'
          and c.status = 'utkast'
          and c.start_date = date '2026-10-01'
          and c.end_date = date '2026-10-31'
          and abs(c.overtime_hours - 7.43) < 0.001
          and abs(c.weekly_hours - 21.68) < 0.001
          and c.body_snapshot like '%01.10.2026%'
          and c.body_snapshot like '%31.10.2026%'
          and c.body_snapshot like '%88,57%'
          and c.body_snapshot like '%7,43%'
          and c.sent_at is null
      )
      and (select count(*) from public.contract_events e join public.contracts c on c.id = e.contract_id where c.worker_id = 'w-ot' and coalesce(c.metadata ->> 'periode', '') = 'maaned' and e.event_type = 'sendt') = 0
      and (select count(*) from public.notification_outbox where org_id = 'org-a' and kind = 'contract_sent') = sent_before
      and (select status = 'utkast' and start_date = date '2026-10-12' and end_date = date '2026-10-18' and body_snapshot = 'UKENTLIG UTKAST' from public.contracts where id = 'c-weekly-ot'),
    coalesce(detail, 'missing')
  );

  perform public.check_overtime_for_shift('w-ot', date '2026-10-12');
  n := (select count(*) from public.contracts where worker_id = 'w-ot' and coalesce(metadata ->> 'periode', '') = 'maaned' and status <> 'trukket');
  insert into rls_results values (
    'monthly extra-hours trigger is idempotent',
    n = 1,
    n::text
  );

  update public.shifts set status = 'cancelled' where worker_id = 'w-ot';
  insert into rls_results values (
    'unsigned monthly agreement is withdrawn and the weekly draft stays',
    (select count(*) from public.contracts where worker_id = 'w-ot' and coalesce(metadata ->> 'periode', '') = 'maaned' and status = 'trukket') = 1
      and (select status = 'utkast' and body_snapshot = 'UKENTLIG UTKAST' and start_date = date '2026-10-12' and end_date = date '2026-10-18' from public.contracts where id = 'c-weekly-ot'),
    (select status from public.contracts where id = 'c-weekly-ot')
  );

  insert into public.workers (
    id, org_id, name, email, role, teams, hourly_rate, employment_percentage,
    ansettelsestype, timer_per_uke, status
  ) values (
    'w-pct', 'org-a', 'Prosent', 'pct@example.com', 'user', array['team1'],
    200, 50, 'fast', null, 'active'
  );
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  )
  select 'pct-' || g, 'org-a', 'w-pct', 'Prosent', date '2026-10-01' + (g - 1), '08:00', '16:00', 0, 'scheduled', 'team1'
  from generate_series(1, 10) as g;
  n := (select count(*) from public.contracts where worker_id = 'w-pct' and coalesce(metadata ->> 'periode', '') = 'maaned' and status <> 'trukket');
  insert into rls_results values (
    'stillingsprosent under the monthly quota creates no contract',
    n = 0,
    n::text
  );
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values (
    'pct-11', 'org-a', 'w-pct', 'Prosent', date '2026-10-11', '08:00', '16:00', 0, 'scheduled', 'team1'
  );
  select format('status=%s ot=%s body=%s', c.status, c.overtime_hours, left(c.body_snapshot, 200))
  into detail
  from public.contracts c
  where c.worker_id = 'w-pct' and coalesce(c.metadata ->> 'periode', '') = 'maaned' and c.status <> 'trukket';
  insert into rls_results values (
    'stillingsprosent over the monthly quota creates one draft',
    (select count(*) from public.contracts where worker_id = 'w-pct' and coalesce(metadata ->> 'periode', '') = 'maaned' and status = 'utkast') = 1
      and exists (
        select 1 from public.contracts c
        where c.worker_id = 'w-pct'
          and c.start_date = date '2026-10-01'
          and c.end_date = date '2026-10-31'
          and c.body_snapshot like '%83,04%'
          and c.body_snapshot like '%4,96%'
          and c.sent_at is null
      ),
    coalesce(detail, 'missing')
  );

  update public.employer_settings
    set ekstratimer_periode = 'uke', send_tilleggsavtaler_automatisk = false
    where org_id = 'org-a';
  insert into public.workers (
    id, org_id, name, email, role, teams, hourly_rate, employment_percentage,
    ansettelsestype, timer_per_uke, status
  ) values (
    'w-week', 'org-a', 'Uke', 'week@example.com', 'user', array['team1'],
    210, 50, 'fast', 20, 'active'
  );
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('wk-1', 'org-a', 'w-week', 'Uke', date '2026-10-12', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('wk-2', 'org-a', 'w-week', 'Uke', date '2026-10-13', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('wk-3', 'org-a', 'w-week', 'Uke', date '2026-10-14', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('wk-4', 'org-a', 'w-week', 'Uke', date '2026-10-19', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('wk-5', 'org-a', 'w-week', 'Uke', date '2026-10-20', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('wk-6', 'org-a', 'w-week', 'Uke', date '2026-10-21', '08:00', '16:00', 0, 'scheduled', 'team1');
  select format('%s %s..%s', status, start_date, end_date)
  into detail
  from public.contracts
  where worker_id = 'w-week' and contract_type = 'merarbeid' and status <> 'trukket';
  insert into rls_results values (
    'week setting still merges consecutive weeks into one period',
    (select count(*) from public.contracts where worker_id = 'w-week' and contract_type = 'merarbeid' and status <> 'trukket') = 1
      and exists (
        select 1 from public.contracts
        where worker_id = 'w-week'
          and start_date = date '2026-10-12'
          and end_date = date '2026-10-25'
          and status = 'utkast'
          and coalesce(metadata ->> 'periode', '') is distinct from 'maaned'
      )
      and (select status = 'utkast' and body_snapshot = 'UKENTLIG UTKAST' from public.contracts where id = 'c-weekly-ot')
      and (select status = 'utkast' and start_date = date '2026-10-01' from public.contracts where worker_id = 'w-pct' and coalesce(metadata ->> 'periode', '') = 'maaned'),
    coalesce(detail, 'missing')
  );

  delete from public.employer_settings where org_id = 'org-a';
end
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
