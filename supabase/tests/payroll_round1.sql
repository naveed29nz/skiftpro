-- Break rules, ferie, night-column grants, and payroll period locks.
-- Runs on the throwaway database after the role fixtures in rls_isolation.sql.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into rls_results (name, ok, detail)
select
  'break rules and night window are readable',
  public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select team2_break_rules, team2_auto_break, team2_night_enabled, team2_night_from, team2_night_to from public.workplace_settings where id = 'ws-a'$q$
  ) = 'ok',
  public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select team2_night_from from public.workplace_settings where id = 'ws-a'$q$
  );

insert into rls_results (name, ok, detail)
select
  'night supplement amount stays hidden',
  public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select team2_night_extra_amount from public.workplace_settings where id = 'ws-a'$q$
  ) like '%permission denied%',
  public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select team2_night_extra_amount from public.workplace_settings where id = 'ws-a'$q$
  );

insert into public.workplace_settings (id, org_id, workplace_name, team1_name, team2_name)
values
  ('ws-n417', 'org-a', 'Oslo S Nord', 'Team 1', 'N.417'),
  ('ws-custom', 'org-a', 'Annen', 'Team 1', 'N.417');

update public.workplace_settings
set team2_break_rules = '[{"after_minutes": 1, "break_minutes": 5}]'::jsonb
where id = 'ws-custom';

insert into rls_results (name, ok, detail)
select
  'stores start with break and night turned off',
  team2_auto_break = false
    and team2_night_enabled = false
    and team2_night_extra_type = 'none'
    and team2_break_rules = '[]'::jsonb
    and team1_auto_break = false
    and not exists (select 1 from pg_proc where proname = 'seed_narvesen_break_rules'),
  team2_night_extra_type || ' auto=' || team2_auto_break::text
from public.workplace_settings
where id = 'ws-n417';

insert into rls_results (name, ok, detail)
select
  'a saved break rule stays off until the store enables it',
  team2_auto_break = false
    and team2_break_rules = '[{"after_minutes": 1, "break_minutes": 5}]'::jsonb,
  team2_break_rules::text
from public.workplace_settings
where id = 'ws-custom';

insert into rls_results (name, ok, detail)
select
  'new shifts leave the break for the rule unless it is overridden',
  not break_manual,
  break_manual::text
from public.shifts
where id = 'shift-a1';

do $do$
declare
  detail text;
begin
  begin
    insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, shift_label)
    values ('shift-bad-label', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date + 40, '08:00', '16:00', 'vacation');
    insert into rls_results values ('ferie is the vacation label', false, 'vacation was accepted');
  exception when others then
    insert into rls_results values ('ferie is the vacation label', sqlerrm like '%shifts_label_check%', sqlerrm);
  end;

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, shift_label, all_day, team)
       values ('shift-ferie', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date + 30, '00:00', '00:00', 'ferie', true, 'team1')$q$
  );
  insert into rls_results values ('admin can store a full-day ferie shift', detail = 'ok', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, shift_label, team)
       values ('shift-egenmelding', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date + 41, '08:00', '16:00', 'sick_self', 'team1')$q$
  );
  insert into rls_results values ('admin can store egenmelding', detail = 'ok', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$insert into public.shifts (id, org_id, worker_id, worker_name, date, start_time, end_time, shift_label, team)
       values ('shift-sykmelding', 'org-a', 'w-ansatt-a', 'Ansatt A', current_date + 42, '08:00', '16:00', 'sick_doctor', 'team1')$q$
  );
  insert into rls_results values ('admin can store sykmelding', detail = 'ok', detail);

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$update public.shifts set hours_approved = true where id = 'shift-a1'$q$
  );
  insert into rls_results values ('butikksjef cannot approve hours', detail like '%administrator%', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.shifts set hours_approved = true, hours_approved_at = now(), hours_approved_by = '11111111-1111-1111-1111-111111111111' where id = 'shift-a1'$q$
  );
  insert into rls_results values ('admin can approve hours', detail = 'ok', detail);

  detail := public._rls_exec(
    '33333333-3333-3333-3333-333333333333',
    $q$insert into public.payroll_period_locks (org_id, start_date, end_date) values ('org-a', current_date, current_date)$q$
  );
  insert into rls_results values ('sub_admin cannot lock payroll', detail <> 'ok', detail);

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$insert into public.payroll_period_locks (org_id, start_date, end_date) values ('org-a', current_date, current_date)$q$
  );
  insert into rls_results values ('butikksjef cannot lock payroll', detail <> 'ok', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$insert into public.payroll_period_locks (id, org_id, start_date, end_date, note) values ('lock-a', 'org-a', current_date, current_date, 'oktober')$q$
  );
  insert into rls_results values ('admin can lock payroll', detail = 'ok', detail);

  detail := public._rls_exec(
    '66666666-6666-6666-6666-666666666666',
    $q$select id from public.payroll_period_locks where id = 'lock-a'$q$
  );
  insert into rls_results values (
    'another customer cannot read the lock',
    public._rls_count('66666666-6666-6666-6666-666666666666', $q$select id from public.payroll_period_locks where id = 'lock-a'$q$) = 0,
    detail
  );

  begin
    update public.shifts set notes = 'eier' where id = 'shift-a1';
    insert into rls_results values ('locked period blocks the table owner', false, 'update succeeded');
  exception when others then
    insert into rls_results values ('locked period blocks the table owner', sqlerrm like '%låst%', sqlerrm);
  end;

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.shifts set notes = 'admin' where id = 'shift-a1'$q$
  );
  insert into rls_results values ('locked period blocks the admin', detail like '%låst%', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$delete from public.shifts where id = 'shift-a1'$q$
  );
  insert into rls_results values ('locked period blocks delete', detail like '%låst%', detail);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$update public.payroll_period_locks set unlocked_at = now() where id = 'lock-a'$q$
  );
  insert into rls_results values ('admin can unlock payroll', detail = 'ok', detail);

  begin
    update public.shifts set notes = 'etter' where id = 'shift-a1';
    insert into rls_results values ('unlocked period can be edited', true, 'ok');
  exception when others then
    insert into rls_results values ('unlocked period can be edited', false, sqlerrm);
  end;

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$insert into public.payroll_period_locks (id, org_id, start_date, end_date) values ('lock-b', 'org-a', current_date, current_date + 1)$q$
  );
  if detail <> 'ok' then
    insert into rls_results values ('overlapping lock is rejected', false, detail);
  else
    detail := public._rls_exec(
      '11111111-1111-1111-1111-111111111111',
      $q$insert into public.payroll_period_locks (id, org_id, start_date, end_date) values ('lock-c', 'org-a', current_date + 1, current_date + 2)$q$
    );
    insert into rls_results values ('overlapping lock is rejected', detail like '%overlapper%', detail);
  end if;
end;
$do$;

insert into rls_results (name, ok, detail)
select
  'employee can read a personal break override',
  public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select break_after_hours, break_length_minutes from public.workers where id = 'w-ansatt-a'$q$
  ) = 'ok',
  public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select break_after_hours from public.workers where id = 'w-ansatt-a'$q$
  );

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
