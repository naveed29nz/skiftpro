-- Deleting a contract must not use RETURNING *, and must revoke the signing link.
-- Runs on the throwaway database. Does not connect to the hosted project.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into public.contracts (
  id, org_id, worker_id, worker_name, contract_type, status, org_name, start_date
) values
  ('c-del-star', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', 'Kiosk AS', current_date),
  ('c-del', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', 'Kiosk AS', current_date),
  ('c-del-sjef', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', 'Kiosk AS', current_date),
  ('c-del-ansatt', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', 'Kiosk AS', current_date),
  ('c-del-signed', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'signert', 'Kiosk AS', current_date),
  ('c-del-admin', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'signert_ansatt', 'Kiosk AS', current_date);

insert into public.contract_access_tokens (id, contract_id, token_hash, expires_at) values
  (
    'tok-del',
    'c-del',
    encode(digest('contract-delete-token-0123456789abcdef', 'sha256'), 'hex'),
    now() + interval '7 days'
  ),
  (
    'tok-del-old',
    'c-del',
    encode(digest('contract-delete-token-already-revoked-1', 'sha256'), 'hex'),
    now() + interval '7 days'
  ),
  (
    'tok-star',
    'c-del-star',
    encode(digest('contract-delete-token-returning-star-1', 'sha256'), 'hex'),
    now() + interval '7 days'
  );

update public.contract_access_tokens
set revoked_at = timestamptz '2020-01-01'
where id = 'tok-del-old';

insert into public.contract_otp (id, contract_id, user_id, role, code_hash, expires_at)
values (
  'otp-del',
  'c-del',
  '55555555-5555-5555-5555-555555555555',
  'ansatt',
  encode(digest('654321:c-del', 'sha256'), 'hex'),
  now() + interval '10 minutes'
);

insert into public.contract_events (id, contract_id, org_id, event_type, actor_id, actor_role)
values ('evt-del', 'c-del', 'org-a', 'sendt', '11111111-1111-1111-1111-111111111111', 'arbeidsgiver');

do $do$
declare
  detail text;
  n integer;
  revoked timestamptz;
  consumed timestamptz;
  kept timestamptz;
  guest_error text;
begin
  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$delete from public.contracts where id = 'c-del-star' returning *$q$
  );
  select count(*) into n from public.contracts where id = 'c-del-star';
  select revoked_at into revoked from public.contract_access_tokens where id = 'tok-star';
  insert into rls_results values (
    'returning every contract column is denied and the row stays',
    detail like '%permission denied%' and n = 1 and revoked is null,
    detail || ' / rows ' || n::text
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$delete from public.contracts where id = 'c-del'$q$
  );
  select count(*) into n from public.contracts where id = 'c-del';
  select revoked_at into revoked from public.contract_access_tokens where id = 'tok-del';
  select revoked_at into kept from public.contract_access_tokens where id = 'tok-del-old';
  select consumed_at into consumed from public.contract_otp where id = 'otp-del';
  insert into rls_results values (
    'super-admin delete of a sent contract revokes the link and consumes the code',
    detail = 'ok'
      and n = 0
      and revoked is not null
      and kept = timestamptz '2020-01-01'
      and consumed is not null
      and exists (select 1 from public.contract_events where id = 'evt-del'),
    detail || ' / revoked ' || coalesce(revoked::text, 'null')
  );

  detail := public._rls_exec(
    '44444444-4444-4444-4444-444444444444',
    $q$delete from public.contracts where id = 'c-del-sjef'$q$
  );
  select count(*) into n from public.contracts where id = 'c-del-sjef';
  insert into rls_results values (
    'butikksjef delete removes no contract',
    detail = 'ok' and n = 1,
    detail || ' / rows ' || n::text
  );

  detail := public._rls_exec(
    '55555555-5555-5555-5555-555555555555',
    $q$delete from public.contracts where id = 'c-del-ansatt'$q$
  );
  select count(*) into n from public.contracts where id = 'c-del-ansatt';
  insert into rls_results values (
    'employee delete removes no contract',
    detail = 'ok' and n = 1,
    detail || ' / rows ' || n::text
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$delete from public.contracts where id = 'c-del-signed'$q$
  );
  select count(*) into n from public.contracts where id = 'c-del-signed';
  insert into rls_results values (
    'a fully signed contract cannot be deleted',
    detail like '%Signert avtale kan ikke slettes%' and n = 1,
    detail
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$delete from public.contracts where id = 'c-del-admin'$q$
  );
  select count(*) into n from public.contracts where id = 'c-del-admin';
  insert into rls_results values (
    'org admin can withdraw a contract the employee has signed',
    detail = 'ok' and n = 0,
    detail || ' / rows ' || n::text
  );

  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.guest_contract_context('c-del', 'contract-delete-token-0123456789abcdef');
    guest_error := 'opened';
  exception when others then
    guest_error := sqlerrm;
  end;
  insert into rls_results values (
    'a deleted contract signing link no longer opens',
    guest_error = 'Lenken er ugyldig eller utløpt',
    guest_error
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
