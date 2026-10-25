-- Monthly ekstrahjelp / merarbeid checks on the throwaway database.
-- Does not connect to the hosted Supabase project.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into public.organizations (id, name, status) values
  ('org-month', 'Måned AS', 'active'),
  ('org-default', 'Uten innstilling AS', 'active');

insert into public.workplace_settings (id, org_id, workplace_name, workplace_address, full_time_hours_per_week)
values ('ws-month', 'org-month', 'Kiosk', 'Karl Johans gate 1, Oslo', 37.5);

insert into public.employer_settings (
  id, org_id, selskap, ekstrahjelp_periode, send_tilleggsavtaler_automatisk,
  alminnelig_ukentlig_arbeidstid, signatur_navn
) values (
  'es-month', 'org-month', 'Måned AS', 'maned', true, 37.5, 'Ola Hansen'
);

insert into public.profiles (id, email, full_name, role) values
  ('99999999-9999-9999-9999-999999999999', 'kari.maned@example.com', 'Kari Nordmann', 'user'),
  ('88888888-8888-8888-8888-888888888888', 'behold@example.com', 'Behold Uke', 'user');

insert into public.workers (
  id, org_id, name, email, role, teams, hourly_rate, employment_percentage,
  ansettelsestype, timer_per_uke, status, position
) values
  ('w-month', 'org-month', 'Kari Nordmann', 'kari.maned@example.com', 'user', array['team1'], 220, 50, 'fast', 20, 'active', 'Selger'),
  ('w-keep', 'org-month', 'Behold Uke', 'behold@example.com', 'user', array['team1'], 220, 50, 'fast', 20, 'active', 'Selger'),
  ('w-pct', 'org-month', 'Prosent', 'prosent@example.com', 'user', array['team1'], 200, 50, 'fast', null, 'active', 'Selger'),
  ('w-extra', 'org-month', 'Ekstra', 'ekstra@example.com', 'user', array['team1'], 190, null, 'tilkalling', null, 'active', 'Ekstrahjelp'),
  ('w-def', 'org-default', 'Standard', 'standard@example.com', 'user', array['team1'], 210, 50, 'fast', 20, 'active', 'Selger');

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status,
  start_date, end_date, generated_automatically, week_number, year, metadata
) values (
  'c-extra-old', 'org-month', 'w-extra', 'Ekstra', 'ekstrahjelp', 'utkast',
  date '2026-02-02', date '2026-02-08', true, 6, 2026, '{}'::jsonb
);

do $do$
declare
  n integer;
  detail text;
  overtime double precision;
  body text;
begin
  insert into public.organizations (id, name, status) values ('org-probe', 'Probe AS', 'active');
  insert into public.employer_settings (id, org_id) values ('es-probe', 'org-probe');
  insert into rls_results values (
    'new employer settings default to month',
    (select ekstrahjelp_periode = 'maned' from public.employer_settings where id = 'es-probe'),
    (select ekstrahjelp_periode from public.employer_settings where id = 'es-probe')
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('feb-1', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-02', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('feb-2', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-03', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('feb-3', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-04', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('feb-4', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-09', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('feb-5', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-10', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('feb-6', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-16', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('feb-7', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-17', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('feb-8', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-23', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('feb-9', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-24', '08:00', '18:00', 0, 'scheduled', 'team1');

  n := (select count(*) from public.contracts where worker_id = 'w-month' and status <> 'trukket');
  insert into rls_results values (
    'a long week offset by a short week does not create a monthly contract',
    n = 0,
    n::text
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values (
    'feb-10', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-25', '08:00', '10:00', 0, 'scheduled', 'team1'
  );

  select c.overtime_hours, c.body_snapshot
    into overtime, body
  from public.contracts c
  where c.worker_id = 'w-month' and c.status <> 'trukket'
  order by c.created_date
  limit 1;

  n := (select count(*) from public.contracts where worker_id = 'w-month' and status <> 'trukket');
  insert into rls_results values (
    'month total above contracted hours creates one draft for the whole month',
    n = 1
      and (select start_date = date '2026-02-01' and end_date = date '2026-02-28'
             and status = 'utkast' and sent_at is null and generated_automatically
             and contract_type = 'merarbeid' and metadata ->> 'periode' = 'maned'
             and round(overtime_hours::numeric, 2) = 2
           from public.contracts where worker_id = 'w-month' and status <> 'trukket')
      and body like '%01.02.2026%'
      and body like '%28.02.2026%'
      and body like '%er 2 timer%',
    coalesce(n::text, '0') || ' overtime=' || coalesce(overtime::text, 'null')
  );

  insert into rls_results values (
    'automatic monthly contract is not sent even when auto-send is on',
    not exists (
      select 1 from public.contract_events e
      join public.contracts c on c.id = e.contract_id
      where c.worker_id = 'w-month' and e.event_type = 'sendt'
    )
    and not exists (
      select 1 from public.notification_outbox o
      where o.user_id = '99999999-9999-9999-9999-999999999999'
        and o.kind = 'contract_sent'
    ),
    (select coalesce(string_agg(kind, ','), 'none') from public.notification_outbox where user_id = '99999999-9999-9999-9999-999999999999' and kind = 'contract_sent')
  );

  perform public.check_overtime_for_shift('w-month', date '2026-02-02');
  n := (select count(*) from public.contracts where worker_id = 'w-month' and status <> 'trukket');
  insert into rls_results values ('monthly evaluation is idempotent', n = 1, n::text);

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values (
    'feb-11', 'org-month', 'w-month', 'Kari Nordmann', date '2026-02-26', '08:00', '11:00', 0, 'scheduled', 'team1'
  );
  n := (select count(*) from public.contracts where worker_id = 'w-month' and status <> 'trukket');
  insert into rls_results values (
    'more hours in the same month update the one draft',
    n = 1
      and (select status = 'utkast' and round(overtime_hours::numeric, 2) = 5 and sent_at is null
           from public.contracts where worker_id = 'w-month' and status <> 'trukket'),
    (select overtime_hours::text from public.contracts where worker_id = 'w-month' and status <> 'trukket')
  );

  update public.shifts set status = 'cancelled' where worker_id = 'w-month';
  insert into rls_results values (
    'unsigned monthly draft is withdrawn when the month no longer exceeds',
    (select count(*) from public.contracts where worker_id = 'w-month' and status = 'trukket') = 1
      and (select count(*) from public.contracts where worker_id = 'w-month' and status <> 'trukket') = 0,
    (select status from public.contracts where worker_id = 'w-month')
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  )
  select 'nov-' || g, 'org-month', 'w-month', 'Kari Nordmann', d, '08:00', '16:00', 0, 'scheduled', 'team1'
  from (
    select row_number() over () as g, d
    from unnest(array[
      date '2026-11-02', date '2026-11-03', date '2026-11-04', date '2026-11-05',
      date '2026-11-09', date '2026-11-10', date '2026-11-11', date '2026-11-12',
      date '2026-11-16', date '2026-11-17', date '2026-11-18', date '2026-11-19'
    ]) as d
  ) days;

  select c.body_snapshot into body
  from public.contracts c
  where c.worker_id = 'w-month' and c.status <> 'trukket' and c.start_date = date '2026-11-01';

  insert into rls_results values (
    'november uses days divided by seven and the excess only',
    (select count(*) = 1
      from public.contracts
     where worker_id = 'w-month' and status = 'utkast' and sent_at is null
       and metadata ->> 'periode' = 'maned'
       and start_date = date '2026-11-01' and end_date = date '2026-11-30'
       and round(overtime_hours::numeric, 2) = round((96 - 20 * 30 / 7.0)::numeric, 2)
       and round(weekly_hours::numeric, 2) = round((96 / (30 / 7.0))::numeric, 2))
      and body like '%' || public.format_no_number(96) || '%'
      and body like '%' || public.format_no_number((20 * 30 / 7.0)::numeric) || '%'
      and body like '%' || public.format_no_number((96 - 20 * 30 / 7.0)::numeric) || '%',
    coalesce(body, 'no body')
  );

  update public.employer_settings set ekstrahjelp_periode = 'uke' where id = 'es-month';
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('oct-1', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-12', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-2', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-13', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-3', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-14', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-4', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-15', '08:00', '16:00', 0, 'scheduled', 'team1');

  insert into rls_results values (
    'week mode still creates one draft for the exceeding week',
    (select count(*) = 1
       from public.contracts
      where worker_id = 'w-keep' and metadata ->> 'periode' = 'uke' and status = 'utkast'
        and start_date = date '2026-10-12' and end_date = date '2026-10-18'),
    (select string_agg(start_date::text || '..' || end_date::text || ' ' || coalesce(metadata ->> 'periode', 'empty'), ', ')
       from public.contracts where worker_id = 'w-keep' and status <> 'trukket')
  );

  update public.employer_settings set ekstrahjelp_periode = 'maned' where id = 'es-month';
  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status,
    start_date, end_date, generated_automatically, week_number, year, metadata
  ) values (
    'c-legacy-week', 'org-month', 'w-keep', 'Behold Uke', 'merarbeid', 'utkast',
    date '2026-09-07', date '2026-09-13', true, 37, 2026, '{}'::jsonb
  );
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('oct-5', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-05', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-6', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-06', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-7', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-07', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-8', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-19', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-9', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-20', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-10', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-21', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-11', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-26', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-12', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-27', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('oct-13', 'org-month', 'w-keep', 'Behold Uke', date '2026-10-28', '08:00', '16:00', 0, 'scheduled', 'team1');

  insert into rls_results values (
    'monthly evaluation keeps already created weekly contracts',
    (select status = 'utkast' and start_date = date '2026-10-12' and end_date = date '2026-10-18'
       from public.contracts where worker_id = 'w-keep' and metadata ->> 'periode' = 'uke')
      and (select status = 'utkast' and start_date = date '2026-09-07' and end_date = date '2026-09-13'
             from public.contracts where id = 'c-legacy-week')
      and (select count(*) = 1
           from public.contracts
          where worker_id = 'w-keep' and metadata ->> 'periode' = 'maned' and status = 'utkast'
            and start_date = date '2026-10-01' and end_date = date '2026-10-31'
            and round(overtime_hours::numeric, 2) = round((104 - 20 * 31 / 7.0)::numeric, 2)),
    (select string_agg(id || ' ' || start_date::text || '..' || end_date::text || ' ' || status || ' ' || coalesce(metadata ->> 'periode', 'legacy'), ', ')
       from public.contracts where worker_id = 'w-keep')
  );

  update public.employer_settings set ekstrahjelp_periode = 'uke' where id = 'es-month';
  perform public.check_overtime_for_shift('w-keep', date '2026-10-12');
  insert into rls_results values (
    'switching back to week does not withdraw the monthly contract',
    (select status = 'utkast' and start_date = date '2026-10-01' and end_date = date '2026-10-31'
       from public.contracts where worker_id = 'w-keep' and metadata ->> 'periode' = 'maned'),
    (select status || ' ' || start_date::text
       from public.contracts where worker_id = 'w-keep' and metadata ->> 'periode' = 'maned')
  );
  update public.employer_settings set ekstrahjelp_periode = 'maned' where id = 'es-month';

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  )
  select 'pct-' || g, 'org-month', 'w-pct', 'Prosent', d, '08:00', '16:00', 0, 'scheduled', 'team1'
  from unnest(array[
    date '2026-02-02', date '2026-02-03', date '2026-02-04', date '2026-02-05', date '2026-02-06',
    date '2026-02-09', date '2026-02-10', date '2026-02-11', date '2026-02-12', date '2026-02-13'
  ]) with ordinality as t(d, g);

  insert into rls_results values (
    'stillingsprosent is the weekly basis when timer per uke is empty',
    (select count(*) = 1
      from public.contracts
     where worker_id = 'w-pct' and status = 'utkast'
       and start_date = date '2026-02-01' and end_date = date '2026-02-28'
       and round(overtime_hours::numeric, 2) = 5),
    (select overtime_hours::text from public.contracts where worker_id = 'w-pct' and status <> 'trukket')
  );

  update public.contracts
    set status = 'signert', employee_signed_at = now(), employer_signed_at = now()
  where worker_id = 'w-pct' and status <> 'trukket';
  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values (
    'pct-extra', 'org-month', 'w-pct', 'Prosent', date '2026-02-18', '08:00', '12:00', 0, 'scheduled', 'team1'
  );
  n := (select count(*) from public.contracts where worker_id = 'w-pct');
  insert into rls_results values (
    'a signed monthly contract is not replaced or resent',
    n = 1 and (select status = 'signert' and sent_at is null from public.contracts where worker_id = 'w-pct'),
    n::text
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('ex-1', 'org-month', 'w-extra', 'Ekstra', date '2026-02-02', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('ex-2', 'org-month', 'w-extra', 'Ekstra', date '2026-02-03', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('ex-3', 'org-month', 'w-extra', 'Ekstra', date '2026-02-04', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('ex-4', 'org-month', 'w-extra', 'Ekstra', date '2026-02-05', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('ex-5', 'org-month', 'w-extra', 'Ekstra', date '2026-02-06', '08:00', '18:00', 0, 'scheduled', 'team1');

  insert into rls_results values (
    'ekstrahjelp without stillingsprosent is excluded and old drafts stay',
    (select count(*) = 1
       from public.contracts
      where worker_id = 'w-extra' and id = 'c-extra-old' and status = 'utkast'),
    (select string_agg(id || ' ' || status || ' ' || contract_type, ', ') from public.contracts where worker_id = 'w-extra')
  );

  insert into public.shifts (
    id, org_id, worker_id, worker_name, date, start_time, end_time, break_minutes, status, team
  ) values
    ('def-1', 'org-default', 'w-def', 'Standard', date '2026-02-02', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('def-2', 'org-default', 'w-def', 'Standard', date '2026-02-03', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('def-3', 'org-default', 'w-def', 'Standard', date '2026-02-04', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('def-4', 'org-default', 'w-def', 'Standard', date '2026-02-09', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('def-5', 'org-default', 'w-def', 'Standard', date '2026-02-10', '08:00', '16:00', 0, 'scheduled', 'team1'),
    ('def-6', 'org-default', 'w-def', 'Standard', date '2026-02-16', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('def-7', 'org-default', 'w-def', 'Standard', date '2026-02-17', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('def-8', 'org-default', 'w-def', 'Standard', date '2026-02-23', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('def-9', 'org-default', 'w-def', 'Standard', date '2026-02-24', '08:00', '18:00', 0, 'scheduled', 'team1'),
    ('def-10', 'org-default', 'w-def', 'Standard', date '2026-02-25', '08:00', '10:00', 0, 'scheduled', 'team1');

  insert into rls_results values (
    'missing organization setting still evaluates the calendar month',
    (select count(*) = 1
      from public.contracts
     where worker_id = 'w-def' and status = 'utkast' and metadata ->> 'periode' = 'maned'
       and start_date = date '2026-02-01' and end_date = date '2026-02-28'),
    (select string_agg(start_date::text || '..' || end_date::text || ' ' || coalesce(metadata ->> 'periode', ''), ', ')
       from public.contracts where worker_id = 'w-def')
  );
end
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
