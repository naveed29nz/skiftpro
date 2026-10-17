-- The contract party is the customer-card company.
-- The signature line is the chosen customer admin, then that customer's
-- primary admin, then the explicit employer-settings text.
-- The contact name, a platform super-admin, and another customer's admin
-- are not the signer. The countersigning admin stays in the audit trail.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

update public.profiles
set full_name = 'Naveed Zafar'
where id = '11111111-1111-1111-1111-111111111111';

update public.profiles
set full_name = 'Kari Avdeling'
where id = '33333333-3333-3333-3333-333333333333';

update public.organizations
set name = 'Butikkdrift Nas AS',
    org_number = '912345678',
    contact_name = 'ZAS',
    admin_user_id = '11111111-1111-1111-1111-111111111111',
    admin_email = 'admin-a@example.com',
    employer_signatory_user_id = '33333333-3333-3333-3333-333333333333'
where id = 'org-a';

insert into public.employer_settings (id, org_id, selskap, org_nr, adresse, signatur_navn, signatur_stilling)
values (
  'es-a', 'org-a', 'Annet navn AS', '000000000', 'Firma 1', 'Kari Person', 'Daglig leder'
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
  rendered text;
  detail text;
  actor text;
begin
  update public.organizations
  set admin_signerer_navn = 'Naveed Zafar'
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'customer-card admin name signs, not the contact or the selected profile',
    fields ->> 'selskap' = 'Butikkdrift Nas AS'
      and fields ->> 'org_nr' = '912345678'
      and fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Kari Avdeling'
      and fields ->> 'signatur_navn' is distinct from 'Kari Person'
      and fields ->> 'signatur_navn' is distinct from 'Super'
      and fields ->> 'signatur_navn' is distinct from 'Admin B',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set admin_signerer_navn = '   '
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'chosen department admin signs for the customer company',
    fields ->> 'selskap' = 'Butikkdrift Nas AS'
      and fields ->> 'org_nr' = '912345678'
      and fields ->> 'signatur_navn' = 'Kari Avdeling'
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Kari Person'
      and fields ->> 'signatur_navn' is distinct from 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'Super'
      and fields ->> 'signatur_navn' is distinct from 'Admin B'
      and fields ->> 'selskap' is distinct from 'Annet navn AS',
    coalesce(fields ->> 'selskap', '') || ' / ' || coalesce(fields ->> 'org_nr', '') || ' / ' || coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set employer_signatory_user_id = null
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'empty choice uses the customer primary admin, not the explicit text',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'Kari Person'
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Super'
      and fields ->> 'signatur_navn' is distinct from 'Admin B',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set employer_signatory_user_id = '22222222-2222-2222-2222-222222222222'
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'another customer admin is not the signer',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'Admin B',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set employer_signatory_user_id = '00000000-0000-0000-0000-000000000001'
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'the platform super-admin is not the signer',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'Super',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set employer_signatory_user_id = '44444444-4444-4444-4444-444444444444'
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'a store manager is not the signer',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'Sjef A',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set admin_user_id = null,
      employer_signatory_user_id = null
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'primary admin is found from the customer admin email',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'ZAS',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.profiles
  set full_name = '   '
  where id = '11111111-1111-1111-1111-111111111111';
  update public.organizations
  set admin_user_id = '11111111-1111-1111-1111-111111111111',
      admin_email = 'nobody@example.com',
      employer_signatory_user_id = null
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'explicit signatory text is used when the customer admin has no name',
    fields ->> 'signatur_navn' = 'Kari Person'
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Super'
      and fields ->> 'signatur_navn' is distinct from 'Admin B',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.employer_settings
  set signatur_navn = '   '
  where id = 'es-a';
  fields := public.contract_field_values('w-ansatt-a');
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'missing admin name is required and the contact is not used',
    coalesce(fields ->> 'signatur_navn', '') = ''
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and 'Signaturberettiget navn' = any(missing)
      and not ('Arbeidsgivers juridiske navn' = any(missing))
      and not ('Organisasjonsnummer' = any(missing)),
    coalesce(fields ->> 'signatur_navn', '') || ' | ' || array_to_string(missing, ', ')
  );

  update public.organizations
  set name = '   ',
      org_number = '   '
  where id = 'org-a';
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'empty card falls back to employer settings for company and org number',
    fields ->> 'selskap' = 'Annet navn AS'
      and fields ->> 'org_nr' = '000000000',
    coalesce(fields ->> 'selskap', '') || ' / ' || coalesce(fields ->> 'org_nr', '')
  );

  update public.organizations
  set name = 'Butikkdrift Nas AS',
      org_number = '912345678',
      admin_user_id = '11111111-1111-1111-1111-111111111111',
      admin_email = 'admin-a@example.com',
      employer_signatory_user_id = null
  where id = 'org-a';
  update public.profiles
  set full_name = 'Naveed Zafar'
  where id = '11111111-1111-1111-1111-111111111111';

  rendered := public.render_mustache(
    E'For {{selskap}}: {{signatur_navn}}',
    public.contract_field_values('w-ansatt-a')
  );
  insert into rls_results values (
    'rendered signature line names the company and the customer admin',
    rendered = E'For Butikkdrift Nas AS: Naveed Zafar\n',
    rendered
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'fast'
  order by version desc
  limit 1;
  insert into rls_results values (
    'fast template prints the company and org number without a paper signature block',
    body like E'%{{selskap}}\nOrg.nr {{org_nr}}\n%'
      and body not like '%For {{selskap}}: {{signatur_navn}}%'
      and body not like '%Stilling: {{signatur_stilling}}%',
    case when body like '%Org.nr {{org_nr}}%' then 'party block' else 'org.nr missing' end
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
