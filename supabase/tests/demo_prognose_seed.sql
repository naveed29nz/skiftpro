-- Prognose seed stays inside Narvesen Demo AS and can be applied twice.
-- Loaded by scripts/run-rls-tests.sh against a throwaway database.

create temp table rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into public.organizations (id, name, admin_email, status)
values
  ('de30000000000000000000a1', 'Narvesen Demo AS', 'demo.admin@demo.skiftpro.invalid', 'active'),
  ('org-prognose-other', 'Annen kunde AS', 'other@example.com', 'active');

insert into public.staffing_budgets (id, org_id, team, hour, mon, created_by)
values
  ('other-seed', 'org-prognose-other', 'team1', 10, 9, 'demo-seed'),
  ('manual-demo-row', 'de30000000000000000000a1', 'team1', 7, 9, 'manual-demo');

\ir ../migrations/20261105100000_demo_prognose_seed.sql
\ir ../migrations/20261105100000_demo_prognose_seed.sql

do $$
declare
  demo_id constant text := 'de30000000000000000000a1';
  other_id constant text := 'org-prognose-other';
  next_week date := date_trunc('week', current_date)::date + 7;
  iso_week integer := extract(week from next_week)::integer;
  iso_year integer := extract(isoyear from next_week)::integer;
  detail text;
  hours integer[];
begin
  insert into rls_results values (
    'other customer staffing row is untouched',
    (select count(*) = 1 and min(mon) = 9 and min(created_by) = 'demo-seed'
      from public.staffing_budgets where org_id = other_id),
    (select count(*)::text || ' mon=' || min(mon)::text from public.staffing_budgets where org_id = other_id)
  );

  insert into rls_results values (
    'manual demo row is not deleted',
    (select count(*) = 1 and min(mon) = 9 from public.staffing_budgets where id = 'manual-demo-row'),
    null
  );

  insert into rls_results values (
    'seed is 78 default rows and 2 overrides after two runs',
    (select count(*) filter (where week_override is null) = 78
        and count(*) filter (where week_override is not null) = 2
      from public.staffing_budgets
      where org_id = demo_id and created_by = 'demo-seed'),
    (select count(*)::text from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed')
  );

  insert into rls_results values (
    'override is the next ISO week on Flyplass hour 7 and 16',
    (select count(*) = 2
        and bool_and(team = 'team5' and hour in (7, 16))
        and bool_and(week_override = iso_week and year_override = iso_year)
        and bool_and(mon = 4)
      from public.staffing_budgets
      where org_id = demo_id and created_by = 'demo-seed' and week_override is not null),
    iso_week::text || '/' || iso_year::text
  );

  select array_agg(hour order by hour) into hours
  from public.staffing_budgets
  where org_id = demo_id and created_by = 'demo-seed' and team = 'team1' and week_override is null;
  insert into rls_results values (
    'Sentrum is staffed 07-23',
    hours = array[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
    hours::text
  );

  select array_agg(hour order by hour) into hours
  from public.staffing_budgets
  where org_id = demo_id and created_by = 'demo-seed' and team = 'team2' and week_override is null;
  insert into rls_results values (
    'Bydel is staffed 07-22',
    hours = array[7,8,9,10,11,12,13,14,15,16,17,18,19,20,21],
    hours::text
  );

  select array_agg(hour order by hour) into hours
  from public.staffing_budgets
  where org_id = demo_id and created_by = 'demo-seed' and team = 'team3' and week_override is null;
  insert into rls_results values (
    'Stasjon is staffed 06-23',
    hours = array[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
    hours::text
  );

  select array_agg(hour order by hour) into hours
  from public.staffing_budgets
  where org_id = demo_id and created_by = 'demo-seed' and team = 'team4' and week_override is null;
  insert into rls_results values (
    'Storsenter is staffed 09-21',
    hours = array[9,10,11,12,13,14,15,16,17,18,19,20],
    hours::text
  );

  select array_agg(hour order by hour) into hours
  from public.staffing_budgets
  where org_id = demo_id and created_by = 'demo-seed' and team = 'team5' and week_override is null;
  insert into rls_results values (
    'Flyplass is staffed 05-23',
    hours = array[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
    hours::text
  );

  insert into rls_results values (
    'small stores peak at 2 and open or close at half a person or less',
    (select mon = 2 and (select mon from public.staffing_budgets d where d.org_id = demo_id and d.created_by = 'demo-seed' and d.team = 'team1' and d.hour = 17 and d.week_override is null) = 2
        and (select greatest(mon, tue, wed, thu, fri, sat, sun) from public.staffing_budgets d where d.org_id = demo_id and d.created_by = 'demo-seed' and d.team = 'team1' and d.hour = 7 and d.week_override is null) <= 0.5
        and (select greatest(mon, tue, wed, thu, fri, sat, sun) from public.staffing_budgets d where d.org_id = demo_id and d.created_by = 'demo-seed' and d.team = 'team1' and d.hour = 22 and d.week_override is null) <= 0.5
      from public.staffing_budgets
      where org_id = demo_id and created_by = 'demo-seed' and team = 'team1' and hour = 10 and week_override is null)
      and (select mon = 1.5 from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team2' and hour = 10 and week_override is null),
    null
  );

  insert into rls_results values (
    'station and airport are busier and quieter on weekend mornings',
    (select mon = 3 and sun < mon from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team3' and hour = 8 and week_override is null)
      and (select mon = 3 and sat < mon from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team5' and hour = 7 and week_override is null)
      and (select mon = 3 from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team4' and hour = 13 and week_override is null),
    null
  );

  insert into rls_results values (
    'shopping centre is closed Sunday morning and Saturday after 20',
    (select sun = 0 from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team4' and hour = 11 and week_override is null)
      and (select sun = 2.5 and sat = 3 from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team4' and hour = 13 and week_override is null)
      and (select mon = 0.5 and sat = 0 and sun = 0 from public.staffing_budgets where org_id = demo_id and created_by = 'demo-seed' and team = 'team4' and hour = 20 and week_override is null),
    null
  );

  insert into rls_results values (
    'seed values stay inside 0 to 4 people',
    (select bool_and(mon between 0 and 4 and tue between 0 and 4 and wed between 0 and 4
        and thu between 0 and 4 and fri between 0 and 4 and sat between 0 and 4 and sun between 0 and 4)
      from public.staffing_budgets
      where org_id = demo_id and created_by = 'demo-seed'),
    null
  );

  select string_agg(name, ', ') into detail
  from rls_results
  where not ok;
  if detail is not null then
    raise notice 'demo prognose failures: %', detail;
  end if;
end
$$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
