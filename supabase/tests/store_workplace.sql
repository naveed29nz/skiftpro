-- Per-store workplace fields. Runs after the contract tests on the throwaway database.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into rls_results (name, ok, detail)
select
  'store columns are readable without wage access',
  public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select team2_address, team2_apningstider, team2_notes from public.workplace_settings where id = 'ws-a'$q$
  ) = 'ok',
  public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select team2_address from public.workplace_settings where id = 'ws-a'$q$
  );

update public.workplace_settings
set workplace_address = 'Firmaadresse 1',
    workplace_name = 'Kiosk',
    apningstid_fra = '08:00',
    apningstid_til = '16:00',
    team1_address = null,
    team1_apningstid_fra = null,
    team1_apningstid_til = null,
    team1_apningstider = null,
    team2_address = 'Butikkveien 2',
    team2_apningstid_fra = '10:00',
    team2_apningstid_til = '22:00',
    team2_apningstider = 'man–lør 10–22',
    team2_notes = 'Inngang fra bakgården'
where id = 'ws-a';

do $do$
declare
  fields jsonb;
  missing text[];
  rendered text;
  body text;
begin
  fields := public.contract_field_values('w-other-a');
  insert into rls_results values (
    'contract uses the worker team address and opening hours',
    fields ->> 'sted' = 'Butikkveien 2'
      and fields ->> 'apningstid_fra' = '10:00'
      and fields ->> 'apningstid_til' = '22:00'
      and fields ->> 'apningstider' = 'man–lør 10–22'
      and fields ->> 'notater' = 'Inngang fra bakgården',
    fields ->> 'sted' || ' / ' || (fields ->> 'apningstid_fra') || '-' || (fields ->> 'apningstid_til')
  );

  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'contract falls back to company workplace when the team fields are empty',
    fields ->> 'sted' = 'Firmaadresse 1'
      and fields ->> 'apningstid_fra' = '08:00'
      and fields ->> 'apningstid_til' = '16:00'
      and coalesce(fields ->> 'apningstider', '') = '',
    fields ->> 'sted' || ' / ' || coalesce(fields ->> 'apningstid_fra', '')
  );

  update public.workplace_settings
  set workplace_name = '',
      workplace_address = '',
      apningstid_fra = '',
      apningstid_til = '',
      team1_name = '',
      team2_name = 'Butikk 2'
  where id = 'ws-a';

  missing := public.employment_contract_missing('w-other-a', '{}'::jsonb);
  insert into rls_results values (
    'team workplace satisfies the missing-field check',
    not ('Arbeidssted' = any(missing))
      and not ('Åpningstid fra' = any(missing))
      and not ('Åpningstid til' = any(missing)),
    array_to_string(missing, ', ')
  );

  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'missing workplace is reported when neither team nor company has it',
    'Arbeidssted' = any(missing)
      and 'Åpningstid fra' = any(missing)
      and 'Åpningstid til' = any(missing),
    array_to_string(missing, ', ')
  );

  rendered := public.render_mustache(
    E'Kl {{apningstid_fra}}–{{apningstid_til}}\n{{#apningstider}}Åpningstidene er {{apningstider}}.\n{{/apningstider}}',
    '{"apningstid_fra":"10:00","apningstid_til":"22:00","apningstider":""}'::jsonb
  );
  insert into rls_results values (
    'empty opening-hours summary is left out of the agreement',
    rendered = E'Kl 10:00–22:00\n',
    rendered
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'fast'
  order by version desc
  limit 1;
  insert into rls_results values (
    'fast template includes the optional opening-hours summary',
    body like '%{{#apningstider}}%' and body like '%{{apningstider}}%',
    left(body, 80)
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'tilkalling_ramme'
  order by version desc
  limit 1;
  insert into rls_results values (
    'tilkalling template includes the optional opening-hours summary',
    body like '%{{#apningstider}}%',
    case when body like '%{{#apningstider}}%' then 'yes' else 'no' end
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
