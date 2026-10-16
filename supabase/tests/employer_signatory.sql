-- Employer party is the customer-card company. The signature line is an
-- explicit signatory, otherwise the organization owner's full name.
-- organizations.contact_name is never the signer.
-- The countersigning admin stays in the audit trail.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

update public.profiles
set full_name = 'Naveed Zafar'
where id = '11111111-1111-1111-1111-111111111111';

update public.organizations
set name = 'Butikkdrift Nas AS',
    org_number = '912345678',
    contact_name = 'ZAS',
    admin_user_id = '11111111-1111-1111-1111-111111111111',
    admin_email = 'admin-a@example.com'
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
  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'card company and org number win, explicit signatory is used',
    fields ->> 'selskap' = 'Butikkdrift Nas AS'
      and fields ->> 'org_nr' = '912345678'
      and fields ->> 'signatur_navn' = 'Kari Person'
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and fields ->> 'signatur_navn' is distinct from 'Butikkdrift Nas AS'
      and fields ->> 'selskap' is distinct from 'Annet navn AS'
      and fields ->> 'org_nr' is distinct from '000000000',
    coalesce(fields ->> 'selskap', '') || ' / ' || coalesce(fields ->> 'org_nr', '') || ' / ' || coalesce(fields ->> 'signatur_navn', '')
  );

  update public.employer_settings
  set signatur_navn = '   '
  where id = 'es-a';

  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'blank signatory falls back to the owner full name',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'selskap' = 'Butikkdrift Nas AS'
      and fields ->> 'signatur_navn' is distinct from 'ZAS',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.organizations
  set admin_user_id = '00000000-0000-0000-0000-000000000099'
  where id = 'org-a';

  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'owner name is found from admin email when the user id does not match',
    fields ->> 'signatur_navn' = 'Naveed Zafar'
      and fields ->> 'signatur_navn' is distinct from 'ZAS',
    coalesce(fields ->> 'signatur_navn', '')
  );

  update public.profiles
  set full_name = '   '
  where id = '11111111-1111-1111-1111-111111111111';
  update public.organizations
  set admin_user_id = '11111111-1111-1111-1111-111111111111',
      admin_email = 'nobody@example.com'
  where id = 'org-a';

  fields := public.contract_field_values('w-ansatt-a');
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'missing owner name is required and the contact is not used',
    coalesce(fields ->> 'signatur_navn', '') = ''
      and fields ->> 'signatur_navn' is distinct from 'ZAS'
      and 'Signaturberettiget navn' = any(missing)
      and not ('Signaturberettiget stilling' = any(missing))
      and not ('Arbeidsgivers juridiske navn' = any(missing))
      and not ('Organisasjonsnummer' = any(missing)),
    coalesce(fields ->> 'signatur_navn', '') || ' | ' || array_to_string(missing, ', ')
  );

  update public.organizations
  set org_number = '   ',
      name = '   '
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
      admin_email = 'admin-a@example.com'
  where id = 'org-a';
  update public.profiles
  set full_name = 'Naveed Zafar'
  where id = '11111111-1111-1111-1111-111111111111';

  rendered := public.render_mustache(
    E'For {{selskap}}: {{signatur_navn}}',
    public.contract_field_values('w-ansatt-a')
  );
  insert into rls_results values (
    'rendered signature line names the company and the owner',
    rendered = E'For Butikkdrift Nas AS: Naveed Zafar\n',
    rendered
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'fast'
  order by version desc
  limit 1;
  insert into rls_results values (
    'fast template prints the company, org number, and owner signature line',
    body like '%' || E'For {{selskap}}: {{signatur_navn}}' || '%'
      and body like '%Org.nr {{org_nr}}%'
      and body not like '%Stilling: {{signatur_stilling}}%'
      and body not like '%Navn: {{signatur_navn}}%',
    case
      when body like '%Stilling: {{signatur_stilling}}%' then 'stilling remains'
      when body not like '%Org.nr {{org_nr}}%' then 'org.nr missing'
      else 'owner line'
    end
  );

  select body_markdown into body
  from public.contract_templates
  where org_id is null and key = 'bilag'
  order by version desc
  limit 1;
  insert into rls_results values (
    'bilag prints the company, org number, and owner signature line',
    body like '%' || E'For {{selskap}}: {{signatur_navn}}' || '%'
      and body like '%Org.nr {{org_nr}}%'
      and body not like '%Stilling: {{signatur_stilling}}%',
    case when body like '%Org.nr {{org_nr}}%' then 'org.nr present' else 'org.nr missing' end
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
