-- Employer signatory is the legal company name. The countersigning admin stays in the audit trail.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

update public.organizations
set name = 'Butikkdrift Nas AS',
    contact_name = 'ZAS'
where id = 'org-a';

insert into public.employer_settings (id, org_id, selskap, org_nr, adresse, signatur_navn, signatur_stilling)
values (
  'es-a', 'org-a', 'Butikkdrift Nas AS', '999999999', 'Firma 1', 'Kari Person', 'Daglig leder'
);

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status, template_key, body_snapshot
) values (
  'c-company', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'signert_ansatt', 'fast', 'Avtaletekst'
);

insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
values (
  'c-company',
  '11111111-1111-1111-1111-111111111111',
  'arbeidsgiver',
  encode(digest('654321:c-company', 'sha256'), 'hex'),
  now() + interval '10 minutes'
);

do $do$
declare
  fields jsonb;
  missing text[];
  body text;
  detail text;
  actor text;
begin
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'employer signer is the company name, not the contact or a person',
    fields ->> 'signatur_navn' = 'Butikkdrift Nas AS'
      and fields ->> 'selskap' = 'Butikkdrift Nas AS'
      and coalesce(fields ->> 'signatur_stilling', '') = ''
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Kari Person',
    coalesce(fields ->> 'signatur_navn', '') || ' / ' || coalesce(fields ->> 'signatur_stilling', '')
  );

  update public.employer_settings
  set selskap = '  ',
      signatur_navn = 'Kari Person'
  where id = 'es-a';

  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'employer signer falls back to the organization name',
    fields ->> 'signatur_navn' = 'Butikkdrift Nas AS'
      and fields ->> 'selskap' = 'Butikkdrift Nas AS',
    coalesce(fields ->> 'signatur_navn', '')
  );

  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'person signatory is not a required field',
    not ('Signaturberettiget navn' = any(missing))
      and not ('Signaturberettiget stilling' = any(missing))
      and not ('Arbeidsgivers juridiske navn' = any(missing)),
    array_to_string(missing, ', ')
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'fast'
  order by version desc
  limit 1;
  insert into rls_results values (
    'fast signature block prints the company, not a job title',
    body like '%' || E'For {{selskap}}' || E'\n{{signatur_navn}}' || '%'
      and body not like '%Stilling: {{signatur_stilling}}%'
      and body not like '%Navn: {{signatur_navn}}%',
    case when body like '%Stilling: {{signatur_stilling}}%' then 'stilling remains' else 'company block' end
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$select public.complete_contract_signature('c-company', 'arbeidsgiver', '654321', '203.0.113.9', 'admin-agent')$q$
  );
  select actor_id into actor
  from public.contract_events
  where contract_id = 'c-company' and event_type = 'motsignert'
  order by created_at desc
  limit 1;
  insert into rls_results values (
    'countersigning admin stays in the audit trail',
    detail = 'ok'
      and (select employer_signed_by = '11111111-1111-1111-1111-111111111111' and status = 'signert' from public.contracts where id = 'c-company')
      and actor = '11111111-1111-1111-1111-111111111111',
    detail || ' actor=' || coalesce(actor, '')
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
