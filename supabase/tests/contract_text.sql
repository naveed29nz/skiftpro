-- Version 2 contract text and the protected fødselsnummer column.
-- Runs on the throwaway database after 20261016260000.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into rls_results values
  ('valid fødselsnummer 15059000060', public.fodselsnummer_valid('15059000060'), ''),
  ('valid fødselsnummer with spaces', public.fodselsnummer_valid('150590 00060'), ''),
  ('valid fødselsnummer 11077941012', public.fodselsnummer_valid('11077941012'), ''),
  ('invalid fødselsnummer checksum', not public.fodselsnummer_valid('12345678901'), ''),
  ('invalid fødselsnummer length', not public.fodselsnummer_valid('1505900006'), '');

do $do$
declare
  detail text;
  digits text;
  masked text;
  missing text[];
  body text;
  active boolean;
  tpl_version integer;
begin
  perform set_config('request.jwt.claims', '', true);
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'missing contract fields include identity and not opening hours',
    'Fødselsnummer' = any(missing)
      and 'Adresse' = any(missing)
      and 'Mobilnummer' = any(missing)
      and not ('Åpningstid fra' = any(missing))
      and not ('Åpningstid til' = any(missing)),
    array_to_string(missing, ', ')
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$select fodselsnummer from public.workers where id = 'w-ansatt-a'$q$
  );
  insert into rls_results values (
    'authenticated cannot select the fødselsnummer column',
    detail like '%permission denied%',
    detail
  );

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001')::text, true);
    execute 'set local role authenticated';
    perform public.set_worker_fodselsnummer('w-ansatt-a', '15059000060');
    execute 'reset role';
    detail := 'ok';
  exception when others then
    begin
      execute 'reset role';
    exception when others then
      null;
    end;
    detail := sqlerrm;
  end;
  insert into rls_results values ('super admin can store a fødselsnummer', detail = 'ok', detail);

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001')::text, true);
  digits := public.worker_fodselsnummer('w-ansatt-a');
  insert into rls_results values (
    'super admin can read the stored fødselsnummer',
    digits = '15059000060',
    coalesce(digits, 'null')
  );

  select m.masked into masked
  from public.worker_fodselsnummer_masks() m
  where m.id = 'w-ansatt-a';
  insert into rls_results values (
    'mask is seven bullets and the last four digits',
    masked = '•••••••0060',
    coalesce(masked, 'null')
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$select public.worker_fodselsnummer('w-ansatt-a')$q$
  );
  insert into rls_results values (
    'employee cannot read a fødselsnummer',
    detail like '%Ikke tillatt%',
    detail
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$select public.set_worker_fodselsnummer('w-ansatt-a', '11077941012')$q$
  );
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001')::text, true);
  digits := public.worker_fodselsnummer('w-ansatt-a');
  insert into rls_results values (
    'butikksjef cannot replace a fødselsnummer',
    detail like '%Ikke tillatt%' and digits = '15059000060',
    detail || ' / ' || coalesce(digits, 'null')
  );

  detail := public._rls_exec(
    '22222222-2222-2222-2222-222222222222',
    $q$select public.worker_fodselsnummer('w-ansatt-a')$q$
  );
  insert into rls_results values (
    'another customer cannot read the number',
    detail like '%Ikke tillatt%',
    detail
  );

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
    execute 'set local role authenticated';
    perform public.set_worker_fodselsnummer('w-ansatt-a', '12345678901');
    execute 'reset role';
    detail := 'ok';
  exception when others then
    begin
      execute 'reset role';
    exception when others then
      null;
    end;
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'invalid fødselsnummer is rejected without echoing the number',
    detail = 'Fødselsnummer må være 11 gyldige sifre',
    detail
  );

  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.worker_fodselsnummer('w-ansatt-a');
    detail := 'ok';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'a call without a user cannot read a fødselsnummer',
    detail like '%Ikke tillatt%',
    detail
  );

  perform set_config('request.jwt.claims', '', true);
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'a stored fødselsnummer drops that label before address and phone',
    not ('Fødselsnummer' = any(missing))
      and 'Adresse' = any(missing)
      and 'Mobilnummer' = any(missing),
    array_to_string(missing, ', ')
  );

  update public.workers
  set address = 'Økernveien 7, 0653 Oslo',
      phone = '900 00 000'
  where id = 'w-ansatt-a';
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'a stored fødselsnummer, address and phone leave those labels',
    not ('Fødselsnummer' = any(missing))
      and not ('Adresse' = any(missing))
      and not ('Mobilnummer' = any(missing))
      and not ('Åpningstid fra' = any(missing)),
    array_to_string(missing, ', ')
  );

  select t.body_markdown, t.is_active, t.version into body, active, tpl_version
  from public.contract_templates t
  where t.org_id is null and t.key = 'fast' and t.is_active
  order by t.version desc
  limit 1;
  insert into rls_results values (
    'active fast template is version 2 with the party block',
    tpl_version = 2
      and active
      and ltrim(body, E'\n') like E'ANSETTELSESAVTALE\n{{selskap}}\nOrg.nr {{org_nr}}\n{{navn}}\n{{fodselsnummer}}\n{{ansatt_adresse}}\n{{mobil}}\n%'
      and body like E'%NOK {{timelonn}}.\n{{^tariff}}Bedriften er ikke bundet av tariffavtale.\n{{/tariff}}%'
      and body like '%butikkens åpningstider%'
      and body not like '%mellom klokken%'
      and body not like '%{{#apningstider}}%'
      and body not like '%Hendelseslogg%',
    'v' || coalesce(tpl_version::text, '?')
  );

  select is_active into active
  from public.contract_templates
  where org_id is null and key = 'fast' and version = 1;
  insert into rls_results values ('fast version 1 is inactive', active = false, active::text);

  select is_active into active
  from public.contract_templates
  where org_id is null and key = 'merarbeid' and version = 1;
  insert into rls_results values ('merarbeid version 1 stays active', active = true, active::text);

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'bilag' and is_active
  order by version desc
  limit 1;
  insert into rls_results values (
    'bilag starts with the six identity lines',
    ltrim(body, E'\n') like E'{{selskap}}\nOrg.nr {{org_nr}}\n{{navn}}\n{{fodselsnummer}}\n{{ansatt_adresse}}\n{{mobil}}\n%'
      and ltrim(body, E'\n') not like 'ANSETTELSESAVTALE%'
      and ltrim(body, E'\n') not like 'BILAG%',
    left(body, 40)
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$select public.contract_field_values('w-ansatt-a')$q$
  );
  insert into rls_results values (
    'logged-in users cannot call contract_field_values',
    detail like '%permission denied%',
    detail
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
