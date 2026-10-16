-- Countersigning stores the admin user id, name, and email.
-- A row that only has employer_signed_by still shows the profile on read.
-- This test does not update any already signed production contract.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

update public.profiles
set full_name = 'Naveed Zafar',
    email = 'admin-a@example.com'
where id = '11111111-1111-1111-1111-111111111111';

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status, template_key, body_snapshot
) values (
  'c-countersign', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'signert_ansatt', 'fast', 'Avtaletekst'
);

insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
values (
  'c-countersign',
  '11111111-1111-1111-1111-111111111111',
  'arbeidsgiver',
  encode(digest('246810:c-countersign', 'sha256'), 'hex'),
  now() + interval '10 minutes'
);

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status, template_key,
  employer_signed_at, employer_signed_by
) values (
  'c-stored-id', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'signert', 'fast',
  now(), '11111111-1111-1111-1111-111111111111'
);

select public.log_contract_event(
  'c-stored-id', 'org-a', 'motsignert',
  '11111111-1111-1111-1111-111111111111',
  'arbeidsgiver', null, null, '{}'::jsonb, null
);

do $do$
declare
  detail text;
  actor text;
  payload jsonb;
  doc jsonb;
begin
  perform set_config('request.jwt.claims', '', true);

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$select public.complete_contract_signature('c-countersign', 'arbeidsgiver', '246810', '203.0.113.9', 'admin-agent')$q$
  );
  select e.actor_id, e.payload into actor, payload
  from public.contract_events e
  where e.contract_id = 'c-countersign' and e.event_type = 'motsignert'
  order by e.created_at desc
  limit 1;
  insert into rls_results values (
    'countersign stores user id, name, and email',
    detail = 'ok'
      and (select employer_signed_by = '11111111-1111-1111-1111-111111111111' and status = 'signert' from public.contracts where id = 'c-countersign')
      and actor = '11111111-1111-1111-1111-111111111111'
      and payload ->> 'user_id' = '11111111-1111-1111-1111-111111111111'
      and payload ->> 'name' = 'Naveed Zafar'
      and payload ->> 'email' = 'admin-a@example.com',
    detail || ' actor=' || coalesce(actor, '') || ' payload=' || coalesce(payload::text, '')
  );

  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
  doc := public.contract_document('c-countersign');
  insert into rls_results values (
    'contract document returns the countersigner',
    doc ->> 'employer_signed_by' = '11111111-1111-1111-1111-111111111111'
      and doc ->> 'employer_signed_name' = 'Naveed Zafar'
      and doc ->> 'employer_signed_email' = 'admin-a@example.com'
      and doc ->> 'status' = 'signert',
    coalesce(doc ->> 'employer_signed_name', '') || ' / ' || coalesce(doc ->> 'employer_signed_email', '') || ' / ' || coalesce(doc ->> 'employer_signed_by', '')
  );

  doc := public.contract_document('c-stored-id');
  insert into rls_results values (
    'stored user id is shown from the profile when the event has no name',
    doc ->> 'employer_signed_by' = '11111111-1111-1111-1111-111111111111'
      and doc ->> 'employer_signed_name' = 'Naveed Zafar'
      and doc ->> 'employer_signed_email' = 'admin-a@example.com',
    coalesce(doc ->> 'employer_signed_name', '') || ' / ' || coalesce(doc ->> 'employer_signed_email', '')
  );

  perform set_config('request.jwt.claims', '', true);
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
