-- Fictitious Prognose (staffing budget) for Narvesen Demo AS only.
-- Does not copy any real customer's numbers. Does not touch payroll.
--
-- Idempotent: deletes this org's rows with created_by = 'demo-seed', then inserts.
-- Other organizations are never read or written. If this org id is missing, the
-- seed does nothing. If the id exists under another name, the migration stops.
--
-- Default plan (week_override and year_override null), one row per open hour:
--   team1 Narvesen Demo Sentrum     07-23  small kiosk, peaks ~10-11 and 17-18
--   team2 Narvesen Demo Bydel       07-22  quieter neighbourhood
--   team3 Narvesen Demo Stasjon     06-23  commuter rush, 2-3 people
--   team4 Narvesen Demo Storsenter  Mon-Fri 09-21, Sat 09-20, Sun 12-18
--   team5 Narvesen Demo Flyplass    05-23  early and busy, weekends stay staffed
-- Opening and closing hours are 0.25-1. Hours outside opening are omitted (0).
-- Weekend mornings are lower. Sunday at the shopping centre is 0 before 12:00.
--
-- Two week_override rows for Flyplass (hour 07 and 16) in the next ISO week
-- after current_date, one person above the default plan, so Ukeoverride has
-- something to show. Re-applying this file moves that week forward. The default
-- plan is a weekly template and does not go stale.

do $demo_prognose$
declare
  demo_id constant text := 'de30000000000000000000a1';
  org_name text;
  next_week date;
  iso_week integer;
  iso_year integer;
  default_rows integer;
  override_rows integer;
begin
  select name into org_name
  from public.organizations
  where id = demo_id;

  if org_name is null then
    raise notice 'demo prognose seed skipped: organization % is not in this database', demo_id;
    return;
  end if;

  if org_name is distinct from 'Narvesen Demo AS' then
    raise exception 'refusing demo prognose seed: organization % is named %', demo_id, org_name;
  end if;

  next_week := date_trunc('week', current_date)::date + 7;
  iso_week := extract(week from next_week)::integer;
  iso_year := extract(isoyear from next_week)::integer;

  delete from public.staffing_budgets
  where org_id = demo_id
    and created_by = 'demo-seed';

  insert into public.staffing_budgets (
    org_id, team, hour,
    mon, tue, wed, thu, fri, sat, sun,
    week_override, year_override, created_by
  )
  select
    demo_id, v.team, v.hour,
    v.mon, v.tue, v.wed, v.thu, v.fri, v.sat, v.sun,
    null, null, 'demo-seed'
  from (values
    ('team1', 7, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25),
    ('team1', 8, 1, 1, 1, 1, 1, 0.5, 0.5),
    ('team1', 9, 1, 1, 1, 1, 1, 1, 0.5),
    ('team1', 10, 2, 2, 2, 2, 2, 1.5, 1),
    ('team1', 11, 2, 2, 2, 2, 2, 1.5, 1.5),
    ('team1', 12, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5),
    ('team1', 13, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1),
    ('team1', 14, 1, 1, 1, 1, 1, 1.5, 1),
    ('team1', 15, 1, 1, 1, 1, 1.5, 1.5, 1),
    ('team1', 16, 1, 1, 1, 1, 1.5, 1, 1),
    ('team1', 17, 2, 2, 2, 2, 2.5, 1, 1),
    ('team1', 18, 2, 2, 2, 2, 2, 1, 0.5),
    ('team1', 19, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 0.5),
    ('team1', 20, 1, 1, 1, 1, 1.5, 0.5, 0.5),
    ('team1', 21, 1, 1, 1, 1, 1, 0.5, 0.25),
    ('team1', 22, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25),
    ('team2', 7, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25),
    ('team2', 8, 1, 1, 1, 1, 1, 0.5, 0.25),
    ('team2', 9, 1, 1, 1, 1, 1, 0.5, 0.5),
    ('team2', 10, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 0.5),
    ('team2', 11, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 1),
    ('team2', 12, 1, 1, 1, 1, 1, 1, 1),
    ('team2', 13, 1, 1, 1, 1, 1, 1, 1),
    ('team2', 14, 1, 1, 1, 1, 1, 1, 0.5),
    ('team2', 15, 1, 1, 1, 1, 1, 1, 0.5),
    ('team2', 16, 1, 1, 1, 1, 1.5, 1, 0.5),
    ('team2', 17, 1.5, 1.5, 1.5, 1.5, 2, 1, 0.5),
    ('team2', 18, 1.5, 1.5, 1.5, 1.5, 1.5, 0.5, 0.5),
    ('team2', 19, 1, 1, 1, 1, 1, 0.5, 0.25),
    ('team2', 20, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.25),
    ('team2', 21, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25),
    ('team3', 6, 1, 1, 1, 1, 1, 0.25, 0.25),
    ('team3', 7, 2.5, 2.5, 2.5, 2.5, 2.5, 1, 0.5),
    ('team3', 8, 3, 3, 3, 3, 3, 1.5, 1),
    ('team3', 9, 2.5, 2.5, 2.5, 2.5, 2.5, 1.5, 1),
    ('team3', 10, 2, 2, 2, 2, 2, 2, 1.5),
    ('team3', 11, 2, 2, 2, 2, 2, 2, 1.5),
    ('team3', 12, 2, 2, 2, 2, 2, 2, 2),
    ('team3', 13, 2, 2, 2, 2, 2, 2, 2),
    ('team3', 14, 2, 2, 2, 2, 2, 2, 1.5),
    ('team3', 15, 2.5, 2.5, 2.5, 2.5, 2.5, 2, 1.5),
    ('team3', 16, 3, 3, 3, 3, 3, 2, 1.5),
    ('team3', 17, 3, 3, 3, 3, 3, 1.5, 1.5),
    ('team3', 18, 2.5, 2.5, 2.5, 2.5, 2.5, 1.5, 1),
    ('team3', 19, 2, 2, 2, 2, 2, 1.5, 1),
    ('team3', 20, 1.5, 1.5, 1.5, 1.5, 2, 1, 1),
    ('team3', 21, 1, 1, 1, 1, 1.5, 1, 0.5),
    ('team3', 22, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25),
    ('team4', 9, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 0),
    ('team4', 10, 2, 2, 2, 2, 2, 2, 0),
    ('team4', 11, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 0),
    ('team4', 12, 2.5, 2.5, 2.5, 2.5, 3, 3, 1.5),
    ('team4', 13, 3, 3, 3, 3, 3, 3, 2.5),
    ('team4', 14, 3, 3, 3, 3, 3, 3, 2.5),
    ('team4', 15, 3, 3, 3, 3, 3, 3, 2.5),
    ('team4', 16, 2.5, 2.5, 2.5, 2.5, 3, 2.5, 2),
    ('team4', 17, 2, 2, 2, 2, 2.5, 2, 1),
    ('team4', 18, 2, 2, 2, 2, 2, 1.5, 0),
    ('team4', 19, 1.5, 1.5, 1.5, 1.5, 1.5, 0.5, 0),
    ('team4', 20, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0),
    ('team5', 5, 1, 1, 1, 1, 1, 0.5, 0.5),
    ('team5', 6, 2, 2, 2, 2, 2, 1.5, 1.5),
    ('team5', 7, 3, 3, 3, 3, 3, 2.5, 2),
    ('team5', 8, 3, 3, 3, 3, 3, 2.5, 2.5),
    ('team5', 9, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2),
    ('team5', 10, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5),
    ('team5', 11, 2, 2, 2, 2, 2.5, 2.5, 2.5),
    ('team5', 12, 2, 2, 2, 2, 2, 2.5, 2.5),
    ('team5', 13, 2, 2, 2, 2, 2, 2.5, 2),
    ('team5', 14, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2),
    ('team5', 15, 3, 3, 3, 3, 3, 2.5, 2.5),
    ('team5', 16, 3, 3, 3, 3, 3, 3, 2.5),
    ('team5', 17, 2.5, 2.5, 2.5, 2.5, 3, 2.5, 2.5),
    ('team5', 18, 2.5, 2.5, 2.5, 2.5, 2.5, 2, 2),
    ('team5', 19, 2, 2, 2, 2, 2.5, 2, 2),
    ('team5', 20, 2, 2, 2, 2, 2, 1.5, 1.5),
    ('team5', 21, 1.5, 1.5, 1.5, 1.5, 2, 1.5, 1),
    ('team5', 22, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5)
  ) as v(team, hour, mon, tue, wed, thu, fri, sat, sun);

  insert into public.staffing_budgets (
    org_id, team, hour,
    mon, tue, wed, thu, fri, sat, sun,
    week_override, year_override, created_by
  )
  values
    (demo_id, 'team5', 7,  4, 4, 4, 4, 4, 3, 3, iso_week, iso_year, 'demo-seed'),
    (demo_id, 'team5', 16, 4, 4, 4, 4, 4, 3.5, 3, iso_week, iso_year, 'demo-seed');

  select count(*) into default_rows
  from public.staffing_budgets
  where org_id = demo_id
    and created_by = 'demo-seed'
    and week_override is null
    and year_override is null;

  select count(*) into override_rows
  from public.staffing_budgets
  where org_id = demo_id
    and created_by = 'demo-seed'
    and week_override = iso_week
    and year_override = iso_year;

  if default_rows <> 78 or override_rows <> 2 then
    raise exception 'demo prognose seed wrote % default rows and % override rows', default_rows, override_rows;
  end if;
end
$demo_prognose$;
