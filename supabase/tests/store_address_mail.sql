-- Store address on the agreement, and signing-mail safety.
-- Runs on the throwaway database after the other contract tests.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

update public.workers set teams = array['team1'] where id = 'w-ansatt-a';
update public.workers set teams = array['team2'] where id = 'w-other-a';

update public.organizations
set contact_name = 'ZAS'
where id = 'org-a';

update public.workplace_settings
set workplace_name = 'Kiosk',
    workplace_address = 'Stedet 1',
    team1_address = null,
    team2_address = 'Butikkveien 2'
where id = 'ws-a';

update public.employer_settings
set adresse = 'Firma 1'
where org_id = 'org-a';

do $do$
declare
  fields jsonb;
  missing text[];
  org_name text;
  org_nr text;
  contact text;
  prepared jsonb;
  again jsonb;
  token text;
  other_token text;
  claim text;
  detail text;
  code text;
  opened jsonb;
  ctx jsonb;
  reminders jsonb;
  old_row jsonb;
  new_row jsonb;
  n integer;
  signer text;
begin
  select o.name, o.org_number, o.contact_name
    into org_name, org_nr, contact
  from public.organizations o where o.id = 'org-a';

  fields := public.contract_field_values('w-other-a');
  insert into rls_results values (
    'employer address is the worker store, not the settings address',
    fields ->> 'adresse' = 'Butikkveien 2'
      and fields ->> 'selskap' = org_name
      and fields ->> 'org_nr' = org_nr
      and fields ->> 'adresse' is distinct from org_name
      and fields ->> 'adresse' is distinct from contact
      and fields ->> 'adresse' is distinct from 'Kiosk'
      and fields ->> 'adresse' is distinct from 'Firma 1',
    coalesce(fields ->> 'adresse', '') || ' / ' || coalesce(fields ->> 'selskap', '')
  );

  fields := public.contract_field_values('w-ansatt-a');
  insert into rls_results values (
    'empty store address falls back to employer settings',
    fields ->> 'adresse' = 'Firma 1',
    coalesce(fields ->> 'adresse', '')
  );

  update public.workplace_settings set team2_address = '   ' where id = 'ws-a';
  fields := public.contract_field_values('w-other-a');
  insert into rls_results values (
    'blank store address falls back to employer settings',
    fields ->> 'adresse' = 'Firma 1',
    coalesce(fields ->> 'adresse', '')
  );

  update public.employer_settings set adresse = null where org_id = 'org-a';
  update public.workplace_settings set team2_address = 'Butikkveien 2' where id = 'ws-a';
  missing := public.employment_contract_missing('w-other-a', '{}'::jsonb);
  fields := public.contract_field_values('w-other-a');
  insert into rls_results values (
    'empty settings address does not block when the store has an address',
    not ('Arbeidsgivers adresse' = any(missing))
      and fields ->> 'adresse' = 'Butikkveien 2',
    array_to_string(missing, ', ')
  );

  update public.employer_settings set adresse = '' where org_id = 'org-a';
  update public.workplace_settings
  set team1_address = '  ',
      team2_address = null,
      workplace_name = 'Kiosk',
      workplace_address = 'Stedet 1'
  where id = 'ws-a';
  fields := public.contract_field_values('w-ansatt-a');
  missing := public.employment_contract_missing('w-ansatt-a', '{}'::jsonb);
  insert into rls_results values (
    'company name and workplace name are not the employer address',
    coalesce(fields ->> 'adresse', '') = ''
      and 'Arbeidsgivers adresse' = any(missing)
      and fields ->> 'adresse' is distinct from org_name
      and fields ->> 'adresse' is distinct from contact
      and fields ->> 'adresse' is distinct from 'Kiosk'
      and fields ->> 'adresse' is distinct from 'Stedet 1'
      and coalesce(fields ->> 'sted', '') <> '',
    'adresse=' || coalesce(fields ->> 'adresse', '') || ' sted=' || coalesce(fields ->> 'sted', '')
  );

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    template_key, body_snapshot, field_values, sent_at, expires_at, content_sha256, reason
  ) values (
    'c-guest', 'org-a', 'w-other-a', 'Other A', 'fast', 'sendt', org_name,
    'fast', 'Hemmelig avtaletekst', jsonb_build_object('selskap', org_name),
    now(), now() + interval '14 days', 'hash-guest', null
  );
  insert into rls_results values (
    'a new sent contract has no signing email until it is claimed',
    (select signing_email_sent_at is null from public.contracts where id = 'c-guest'),
    coalesce((select signing_email_sent_at::text from public.contracts where id = 'c-guest'), 'null')
  );

  prepared := public.prepare_contract_signing_mail('c-guest');
  token := prepared ->> 'token';
  claim := prepared ->> 'claim';
  insert into rls_results values (
    'signing mail claim stores only the token hash',
    prepared ->> 'ok' = 'true'
      and prepared ->> 'already_sent' = 'false'
      and prepared ->> 'email' = 'other-a@example.com'
      and length(token) = 64
      and exists (
        select 1 from public.contract_access_tokens t
        where t.contract_id = 'c-guest'
          and t.token_hash = encode(digest(token, 'sha256'), 'hex')
          and t.token_hash <> token
      )
      and (select signing_email_sent_at is not null from public.contracts where id = 'c-guest'),
    coalesce(prepared ->> 'email', '')
  );

  again := public.prepare_contract_signing_mail('c-guest');
  insert into rls_results values (
    'a second signing mail claim does not return a new token',
    again ->> 'already_sent' = 'true' and again ->> 'token' is null,
    again::text
  );

  begin
    perform public.open_guest_contract('c-guest', 'ikke-lenken-ikke-lenken-ikke-lenken', null, null);
    detail := 'opened';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'a wrong signing link does not open the contract',
    detail like '%ugyldig%'
      and (select status = 'sendt' from public.contracts where id = 'c-guest'),
    detail
  );

  opened := public.open_guest_contract('c-guest', token, '203.0.113.10', 'mail-test');
  insert into rls_results values (
    'the signing link opens the contract without signing it',
    opened ->> 'status' = 'apnet'
      and opened ->> 'body_snapshot' = 'Hemmelig avtaletekst'
      and (select status = 'apnet' and employee_signed_at is null from public.contracts where id = 'c-guest'),
    coalesce(opened ->> 'status', '')
  );

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    template_key, body_snapshot, sent_at, expires_at, content_sha256, reason
  ) values (
    'c-guest-user', 'org-a', 'w-ansatt-a', 'Ansatt A', 'fast', 'sendt', org_name,
    'fast', 'Annen avtale', now(), now() + interval '14 days', 'hash-user', null
  );
  again := public.prepare_contract_signing_mail('c-guest-user');
  other_token := again ->> 'token';
  begin
    perform public.open_guest_contract('c-guest-user', token, null, null);
    detail := 'opened';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'a signing link works only for its own contract',
    detail like '%ugyldig%'
      and (select status = 'sendt' from public.contracts where id = 'c-guest-user'),
    detail
  );

  prepared := public.issue_guest_contract_otp('c-guest', token, '203.0.113.10', 'mail-test');
  code := prepared ->> 'code';
  begin
    perform public.complete_guest_contract_signature('c-guest', token, '000000', null, null);
    detail := 'signed';
  exception when others then
    detail := sqlerrm;
  end;
  insert into rls_results values (
    'the signing link cannot sign without the emailed code',
    detail like '%Feil kode%forsøk igjen%'
      and (select status = 'apnet' from public.contracts where id = 'c-guest'),
    detail
  );

  opened := public.complete_guest_contract_signature('c-guest', token, code, '203.0.113.10', 'mail-test');
  insert into rls_results values (
    'guest signature without an account is stored as guest and not as employer',
    opened ->> 'status' = 'signert_ansatt'
      and (select status = 'signert_ansatt'
        and employee_signed_by = 'guest:w-other-a'
        and employer_signed_by is null
        from public.contracts where id = 'c-guest'),
    coalesce((select employee_signed_by from public.contracts where id = 'c-guest'), '')
  );

  perform public.open_guest_contract('c-guest-user', other_token, null, null);
  prepared := public.issue_guest_contract_otp('c-guest-user', other_token, null, null);
  opened := public.complete_guest_contract_signature(
    'c-guest-user', other_token, prepared ->> 'code', null, null
  );
  select employee_signed_by into signer from public.contracts where id = 'c-guest-user';
  insert into rls_results values (
    'guest signature uses the profile when the worker email already has one',
    opened ->> 'status' = 'signert_ansatt'
      and signer = '55555555-5555-5555-5555-555555555555',
    coalesce(signer, '')
  );

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    template_key, body_snapshot, sent_at, expires_at, content_sha256, reason
  ) values (
    'c-otp-keep', 'org-a', 'w-other-a', 'Other A', 'fast', 'sendt', org_name,
    'fast', 'Kort avtale', now(), now() + interval '14 days', 'hash-otp-keep', null
  );
  prepared := public.prepare_contract_signing_mail('c-otp-keep');
  perform public.open_guest_contract('c-otp-keep', prepared ->> 'token', null, null);
  again := public.issue_guest_contract_otp('c-otp-keep', prepared ->> 'token', null, null);
  code := again ->> 'code';
  opened := public.issue_guest_contract_otp('c-otp-keep', prepared ->> 'token', null, null);
  insert into rls_results values (
    'a second code within 30 seconds is refused and the first code stays valid',
    again ->> 'ok' = 'true'
      and opened ->> 'ok' = 'false'
      and opened ->> 'error' like '%Ny kode kan sendes om 30 sekunder%'
      and (select count(*) = 1 from public.contract_otp o
            where o.contract_id = 'c-otp-keep' and o.consumed_at is null),
    coalesce(opened ->> 'error', opened::text)
  );
  update public.contract_otp
    set created_at = now() - interval '31 seconds'
    where contract_id = 'c-otp-keep';
  opened := public.issue_guest_contract_otp('c-otp-keep', prepared ->> 'token', null, null);
  insert into rls_results values (
    'a later code does not consume the earlier unexpired code',
    opened ->> 'ok' = 'true'
      and (select count(*) = 2 from public.contract_otp o
            where o.contract_id = 'c-otp-keep'
              and o.consumed_at is null
              and o.expires_at > now()),
    coalesce(opened ->> 'code', opened::text)
  );
  again := public.complete_guest_contract_signature(
    'c-otp-keep', prepared ->> 'token', code, null, null
  );
  insert into rls_results values (
    'verification accepts an earlier unexpired code after a resend',
    again ->> 'status' = 'signert_ansatt'
      and (select count(*) = 0 from public.contract_otp o
            where o.contract_id = 'c-otp-keep' and o.consumed_at is null),
    coalesce(again ->> 'status', again::text)
  );

  perform public.record_otp_email_failure(
    'c-otp-keep', 'ansatt', null, 429, null, 'Too many requests', '203.0.113.10', 'mail-test'
  );
  insert into rls_results values (
    'a failed code email is stored without the code',
    exists (
      select 1 from public.contract_events e
      where e.contract_id = 'c-otp-keep'
        and e.event_type = 'otp_epost_feilet'
        and e.actor_id = 'guest:w-other-a'
        and e.payload ->> 'status' = '429'
        and e.payload ->> 'error' = 'Too many requests'
        and e.payload::text not like '%855561%'
    ),
    coalesce((
      select e.payload::text from public.contract_events e
      where e.contract_id = 'c-otp-keep' and e.event_type = 'otp_epost_feilet'
      limit 1
    ), '')
  );

  n := (
    select count(*) from public.contract_events e
    where e.contract_id in ('c-guest', 'c-guest-user')
      and (
        e.payload::text like '%' || token || '%'
        or e.payload::text like '%' || other_token || '%'
        or coalesce(e.actor_id, '') in (token, other_token)
      )
  );
  insert into rls_results values (
    'contract events do not store the raw signing link',
    n = 0,
    n::text
  );

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    sent_at, expires_at, reason
  ) values (
    'c-release', 'org-a', 'w-other-a', 'Other A', 'fast', 'sendt', org_name,
    now(), now() + interval '14 days', null
  );
  prepared := public.prepare_contract_signing_mail('c-release');
  perform public.release_contract_signing_mail('c-release', prepared ->> 'claim');
  again := public.prepare_contract_signing_mail('c-release');
  insert into rls_results values (
    'a failed send releases the claim so it can be sent later',
    (select signing_email_sent_at is not null from public.contracts where id = 'c-release')
      and again ->> 'already_sent' = 'false'
      and length(again ->> 'token') = 64,
    coalesce(again ->> 'already_sent', '')
  );

  perform public.release_contract_signing_mail('c-release', 'feil-krav');
  insert into rls_results values (
    'a wrong claim does not clear a sent signing email',
    (select signing_email_sent_at is not null from public.contracts where id = 'c-release'),
    coalesce((select signing_email_claim from public.contracts where id = 'c-release'), '')
  );

  detail := public._rls_exec(
    '11111111-1111-1111-1111-111111111111',
    $q$select public.prepare_contract_signing_mail('c-guest')$q$
  );
  insert into rls_results values (
    'an admin cannot mint a signing link from the database role',
    detail like '%permission denied%',
    detail
  );

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
    execute 'set local role authenticated';
    ctx := public.contract_sender_context('c-release');
    execute 'reset role';
  exception when others then
    begin
      execute 'reset role';
    exception when others then
      null;
    end;
    ctx := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  insert into rls_results values (
    'the customer admin may ask for the signing email',
    ctx ->> 'ok' = 'true',
    coalesce(ctx::text, '')
  );

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222')::text, true);
    execute 'set local role authenticated';
    ctx := public.contract_sender_context('c-release');
    execute 'reset role';
  exception when others then
    begin
      execute 'reset role';
    exception when others then
      null;
    end;
    ctx := jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  insert into rls_results values (
    'another customers admin cannot ask for the signing email',
    ctx ->> 'ok' = 'false',
    coalesce(ctx ->> 'error', ctx::text, '')
  );

  perform set_config('request.jwt.claims', '', true);

  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    sent_at, expires_at, signing_email_sent_at, reason
  ) values
    (
      'c-old-mail', 'org-a', 'w-other-a', 'Other A', 'fast', 'sendt', org_name,
      now() - interval '3 days', now() + interval '10 days', null, null
    ),
    (
      'c-new-mail', 'org-a', 'w-other-a', 'Other A', 'fast', 'sendt', org_name,
      now() - interval '3 days', now() + interval '10 days', now(), null
    );

  prepared := public.create_contract_access_token('c-old-mail');
  insert into rls_results values (
    'reminders cannot mint a link for a contract that was never emailed',
    prepared ->> 'ok' = 'false' and prepared ->> 'token' is null,
    coalesce(prepared ->> 'error', '')
  );

  reminders := public.enqueue_contract_reminders();
  select elem into old_row
  from jsonb_array_elements(reminders -> 'reminders') elem
  where elem ->> 'contract_id' = 'c-old-mail';
  select elem into new_row
  from jsonb_array_elements(reminders -> 'reminders') elem
  where elem ->> 'contract_id' = 'c-new-mail';
  insert into rls_results values (
    'reminder email is withheld unless a signing email was actually sent',
    old_row ->> 'email' is null
      and old_row ->> 'email_allowed' = 'false'
      and new_row ->> 'email' = 'other-a@example.com'
      and new_row ->> 'email_allowed' = 'true'
      and exists (
        select 1 from public.contract_events e
        where e.contract_id = 'c-old-mail' and e.event_type = 'påminnelse'
      ),
    coalesce(old_row::text, 'missing old') || ' / ' || coalesce(new_row::text, 'missing new')
  );
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
