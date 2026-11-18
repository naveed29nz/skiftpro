-- Fictional examples for Narvesen Demo AS: an unsigned contract, a temporary
-- contract ending within a week, next week's shifts left as Utkast, open
-- shifts, and clocked hours inside and outside a 30 minute tolerance.
-- Re-applying refreshes those example rows. It does not change hourly_rate.
-- Other organizations are never read or written. No email is sent.
-- If this org id is missing, the seed does nothing. If the id exists under
-- another name, the migration stops.

do $demo_alerts$
declare
  demo_id constant text := 'de30000000000000000000a1';
  real_id constant text := '6a2b315a825e7ecca4d5f246';
  org_name text;
  this_monday date;
  next_monday date;
  yesterday date;
begin
  if demo_id = real_id then
    raise exception 'refusing to seed the real customer';
  end if;

  select name into org_name from public.organizations where id = demo_id;

  if org_name is null then
    raise notice 'demo alert seed skipped: organization % is not in this database', demo_id;
    return;
  end if;

  if org_name is distinct from 'Narvesen Demo AS' then
    raise exception 'refusing demo alert seed: organization % is named %', demo_id, org_name;
  end if;

  this_monday := date_trunc('week', current_date)::date;
  next_monday := this_monday + 7;
  yesterday := current_date - 1;

  insert into public.workers (
    id, org_id, name, email, phone, address, teams, role, ansettelsestype,
    hourly_rate, status, created_by
  ) values
    ('demo-alert-mia', demo_id, 'Mia Solberg', 'mia.solberg@demo.skiftpro.invalid', null, null, array['team1'], 'user', 'midlertidig_vikar', 0, 'active', 'demo-seed-alerts'),
    ('demo-alert-jonas', demo_id, 'Jonas Berg', 'jonas.berg@demo.skiftpro.invalid', '400 00 011', 'Karl Johans gate 1, 0154 Oslo', array['team1'], 'user', 'fast', 0, 'active', 'demo-seed-alerts'),
    ('demo-alert-nora', demo_id, 'Nora Vik', 'nora.vik@demo.skiftpro.invalid', '400 00 012', 'Storgata 2, 0155 Oslo', array['team1'], 'user', 'midlertidig_vikar', 0, 'active', 'demo-seed-alerts')
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    teams = excluded.teams,
    ansettelsestype = excluded.ansettelsestype,
    status = 'active',
    updated_date = now()
  where public.workers.org_id = demo_id
    and public.workers.id like 'demo-alert-%';

  delete from public.contracts
  where org_id = demo_id
    and id like 'demo-alert-%'
    and status is distinct from 'signert';

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, start_date, end_date, sent_at, created_by
  ) values (
    'demo-alert-c-mia', demo_id, 'demo-alert-mia', 'Mia Solberg', 'midlertidig_vikar', 'sendt',
    current_date - 10, current_date + 80, current_date - 6, 'demo-seed-alerts'
  )
  on conflict (id) do update set
    status = 'sendt',
    sent_at = excluded.sent_at,
    end_date = excluded.end_date,
    updated_date = now()
  where public.contracts.org_id = demo_id;

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, start_date, end_date, sent_at, created_by
  ) values
    ('demo-alert-c-jonas', demo_id, 'demo-alert-jonas', 'Jonas Berg', 'fast', 'signert', current_date - 40, null, current_date - 45, 'demo-seed-alerts'),
    ('demo-alert-c-nora', demo_id, 'demo-alert-nora', 'Nora Vik', 'midlertidig_vikar', 'signert', current_date - 20, current_date + 4, current_date - 25, 'demo-seed-alerts')
  on conflict (id) do update set
    end_date = excluded.end_date,
    start_date = excluded.start_date,
    updated_date = now()
  where public.contracts.org_id = demo_id
    and public.contracts.status = 'signert';

  delete from public.shifts s
  where s.org_id = demo_id
    and s.id like 'demo-alert-%'
    and not public.payroll_period_is_locked(demo_id, s.date);

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, team,
    published, status, hours_approved, created_by
  )
  select
    v.id, demo_id, v.worker_id, v.worker_name, v.date, v.start_time, v.end_time, v.team,
    v.published, 'scheduled', v.hours_approved, 'demo-seed-alerts'
  from (values
    ('demo-alert-s-draft-1', 'demo-alert-jonas', 'Jonas Berg', next_monday, '07:00', '15:00', 'team1', false, false),
    ('demo-alert-s-draft-2', 'demo-alert-jonas', 'Jonas Berg', next_monday + 1, '07:00', '15:00', 'team1', false, false),
    ('demo-alert-s-draft-3', 'demo-alert-nora', 'Nora Vik', next_monday + 2, '15:00', '23:00', 'team1', false, false),
    ('demo-alert-s-draft-4', 'demo-alert-mia', 'Mia Solberg', next_monday + 3, '07:00', '15:00', 'team1', false, false),
    ('demo-alert-s-open-1', 'ledig', 'Ledig vakt', current_date + 1, '08:00', '14:00', 'team1', true, false),
    ('demo-alert-s-open-2', 'ledig', 'Ledig vakt', current_date + 1, '08:00', '14:00', 'team2', true, false),
    ('demo-alert-s-open-3', 'ledig', 'Ledig vakt', current_date + 1, '14:00', '20:00', 'team3', true, false),
    ('demo-alert-s-open-4', 'ledig', 'Ledig vakt', current_date + 2, '08:00', '14:00', 'team3', true, false),
    ('demo-alert-s-open-5', 'ledig', 'Ledig vakt', current_date + 2, '09:00', '15:00', 'team4', true, false),
    ('demo-alert-s-open-6', 'ledig', 'Ledig vakt', current_date + 3, '06:00', '12:00', 'team5', true, false),
    ('demo-alert-s-hours-jonas', 'demo-alert-jonas', 'Jonas Berg', yesterday, '08:00', '16:00', 'team1', true, false),
    ('demo-alert-s-hours-nora', 'demo-alert-nora', 'Nora Vik', yesterday, '10:00', '18:00', 'team1', true, false),
    ('demo-alert-s-hours-mia', 'demo-alert-mia', 'Mia Solberg', yesterday, '09:00', '15:00', 'team1', true, false),
    ('demo-alert-s-hours-ok', 'demo-alert-jonas', 'Jonas Berg', yesterday - 1, '08:00', '16:00', 'team1', true, true)
  ) as v(id, worker_id, worker_name, date, start_time, end_time, team, published, hours_approved)
  where not exists (select 1 from public.shifts s where s.id = v.id)
    and not public.payroll_period_is_locked(demo_id, v.date);

  delete from public.stamps
  where org_id = demo_id and id like 'demo-alert-%';

  insert into public.stamps (
    id, org_id, worker_id, worker_name, date, stamp_in, stamp_out, created_by
  )
  select
    v.id, demo_id, v.worker_id, v.worker_name, yesterday,
    (yesterday::timestamp + v.in_at) at time zone 'Europe/Oslo',
    case when v.out_at is null then null
         else (yesterday::timestamp + v.out_at) at time zone 'Europe/Oslo' end,
    'demo-seed-alerts'
  from (values
    ('demo-alert-st-jonas', 'demo-alert-jonas', 'Jonas Berg', time '08:04', time '16:02'),
    ('demo-alert-st-nora', 'demo-alert-nora', 'Nora Vik', time '10:50', time '18:40'),
    ('demo-alert-st-mia', 'demo-alert-mia', 'Mia Solberg', time '09:05', null::time)
  ) as v(id, worker_id, worker_name, in_at, out_at)
  where exists (
    select 1 from public.shifts s
    where s.org_id = demo_id and s.worker_id = v.worker_id and s.date = yesterday and s.id like 'demo-alert-s-hours-%'
  );

  delete from public.availability
  where org_id = demo_id and id like 'demo-alert-%';

  insert into public.availability (id, org_id, worker_id, worker_name, date, status, created_by)
  values
    ('demo-alert-av-jonas', demo_id, 'demo-alert-jonas', 'Jonas Berg', current_date + 1, 'available', 'demo-seed-alerts'),
    ('demo-alert-av-nora', demo_id, 'demo-alert-nora', 'Nora Vik', current_date + 1, 'available', 'demo-seed-alerts');

  delete from public.onboarding_progress
  where org_id = demo_id and id like 'demo-alert-%';

  insert into public.onboarding_progress (
    id, org_id, user_id, worker_id, notifications_done_at, created_by
  ) values (
    'demo-alert-onb-jonas', demo_id, 'demo-alert-user-jonas', 'demo-alert-jonas', now(), 'demo-seed-alerts'
  );
end
$demo_alerts$;
