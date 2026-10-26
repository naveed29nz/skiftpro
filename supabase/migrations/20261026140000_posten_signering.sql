-- Posten Signering portal jobs for employment contracts.
-- This file is not applied by the change that adds it. Apply it before
-- deploying the posten-signering-poll function.

alter table public.employer_settings drop constraint if exists employer_settings_provider_check;
alter table public.employer_settings
  add constraint employer_settings_provider_check
  check (signing_provider in ('simple_otp', 'skiftpro', 'idura', 'signicat', 'posten'));

alter table public.contracts
  add column if not exists posten_job_id text,
  add column if not exists posten_status text,
  add column if not exists posten_signer_status jsonb not null default '[]'::jsonb,
  add column if not exists posten_pades_path text,
  add column if not exists posten_sender_org text,
  add column if not exists posten_environment text;

alter table public.contracts drop constraint if exists contracts_posten_status_check;
alter table public.contracts
  add constraint contracts_posten_status_check
  check (
    posten_status is null
    or posten_status in ('IN_PROGRESS', 'COMPLETED_SUCCESSFULLY', 'FAILED')
  );

alter table public.contracts drop constraint if exists contracts_posten_environment_check;
alter table public.contracts
  add constraint contracts_posten_environment_check
  check (posten_environment is null or posten_environment in ('test', 'production'));

create unique index if not exists contracts_posten_job_id_idx
  on public.contracts (posten_job_id)
  where posten_job_id is not null;

create index if not exists contracts_posten_open_idx
  on public.contracts (posten_sender_org, posten_environment)
  where posten_job_id is not null and posten_status = 'IN_PROGRESS';

comment on column public.contracts.posten_job_id is
  'Portal signature job id from Posten Signering. The customer org number is the sender; Zastek is the behandler.';
comment on column public.contracts.posten_status is
  'Latest portal job status: IN_PROGRESS, COMPLETED_SUCCESSFULLY or FAILED.';
comment on column public.contracts.posten_signer_status is
  'Per-signer portal status without fødselsnummer. Roles are ansatt and arbeidsgiver.';
comment on column public.contracts.posten_pades_path is
  'Storage path of the signed PAdES downloaded when the portal job completes.';

alter table public.contract_events drop constraint if exists contract_events_type_check;
alter table public.contract_events add constraint contract_events_type_check check (
  event_type in (
    'opprettet', 'sendt', 'påminnelse', 'åpnet', 'otp_sendt', 'otp_feil', 'otp_epost_feilet',
    'signert', 'motsignert', 'avvist', 'trukket', 'utløpt', 'posten_status'
  )
);

create table if not exists public.posten_poll_state (
  sender_org text not null,
  environment text not null,
  next_permitted_poll_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (sender_org, environment),
  constraint posten_poll_state_environment_check check (environment in ('test', 'production'))
);

comment on table public.posten_poll_state is
  'Next permitted poll time per sender organization, from the X-Next-permitted-poll-time header.';

alter table public.posten_poll_state enable row level security;
revoke all on public.posten_poll_state from public, anon, authenticated;
grant select, insert, update, delete on public.posten_poll_state to service_role;

grant select (
  posten_job_id, posten_status, posten_signer_status, posten_pades_path
) on public.contracts to authenticated, anon;

-- Service role only. Returns the fødselsnummer so the edge function can
-- address the employee. Authenticated clients keep using worker_fodselsnummer.
create or replace function public.posten_signing_parties(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  w public.workers%rowtype;
  org public.organizations%rowtype;
  secret bytea;
  fn_digits text := '';
  frist integer;
  admin_email text;
  admin_phone text;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  select * into w from public.workers where id = c.worker_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke den ansatte');
  end if;
  select * into org from public.organizations where id = c.org_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke kunden');
  end if;
  select coalesce(e.signering_frist_dager, 14) into frist
  from public.employer_settings e where e.org_id = c.org_id;
  if w.fodselsnummer is not null then
    select k.key into secret from private.sensitive_keys k where k.name = 'fodselsnummer';
    if secret is not null then
      fn_digits := coalesce(pgp_sym_decrypt(w.fodselsnummer, encode(secret, 'hex')), '');
    end if;
  end if;
  admin_email := coalesce(
    nullif(btrim(org.admin_email), ''),
    nullif(btrim(org.signert_kopi_epost), ''),
    nullif(btrim(org.contact_email), '')
  );
  admin_phone := nullif(btrim(org.contact_phone), '');
  return jsonb_build_object(
    'ok', true,
    'contract_id', c.id,
    'org_id', c.org_id,
    'org_name', coalesce(org.name, c.org_name, ''),
    'org_number', coalesce(org.org_number, ''),
    'worker_id', c.worker_id,
    'worker_name', coalesce(w.name, c.worker_name, ''),
    'status', c.status,
    'body_snapshot', c.body_snapshot,
    'content_sha256', c.content_sha256,
    'available_days', coalesce(frist, 14),
    'employee', jsonb_build_object(
      'personal_identification_number', fn_digits,
      'email', coalesce(w.email, ''),
      'phone', coalesce(w.phone, '')
    ),
    'employer', jsonb_build_object(
      'name', coalesce(nullif(btrim(org.admin_signerer_navn), ''), ''),
      'email', coalesce(admin_email, ''),
      'phone', coalesce(admin_phone, '')
    )
  );
end;
$$;

create or replace function public.assert_contract_sendable(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if not (public.can_read_wages() and public.in_org(c.org_id)) then
    raise exception 'Bare admin kan sende arbeidsavtale med lønn';
  end if;
  if c.status <> 'utkast' then
    return jsonb_build_object('ok', false, 'error', 'Bare utkast kan sendes');
  end if;
  return jsonb_build_object('ok', true, 'org_id', c.org_id, 'id', c.id);
end;
$$;

create or replace function public.mark_posten_job_sent(
  p_contract_id text,
  p_job_id text,
  p_sender_org text,
  p_environment text,
  p_signer_status jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  frist integer;
  updated_id text;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if c.status <> 'utkast' then
    return jsonb_build_object('ok', false, 'error', 'Bare utkast kan sendes');
  end if;
  if nullif(btrim(coalesce(p_job_id, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Mangler oppdrags-id');
  end if;
  select coalesce(e.signering_frist_dager, 14) into frist
  from public.employer_settings e where e.org_id = c.org_id;
  update public.contracts
    set status = 'sendt',
        sent_at = now(),
        expires_at = now() + make_interval(days => coalesce(frist, 14)),
        signing_provider = 'posten',
        posten_job_id = p_job_id,
        posten_status = 'IN_PROGRESS',
        posten_sender_org = p_sender_org,
        posten_environment = p_environment,
        posten_signer_status = coalesce(p_signer_status, '[]'::jsonb)
    where id = c.id and status = 'utkast'
    returning id into updated_id;
  if updated_id is null then
    return jsonb_build_object('ok', false, 'error', 'Bare utkast kan sendes');
  end if;
  perform public.log_contract_event(
    c.id, c.org_id, 'sendt', 'system', 'arbeidsgiver', null, null,
    jsonb_build_object('provider', 'posten', 'job_id', p_job_id),
    c.content_sha256
  );
  return jsonb_build_object('ok', true, 'status', 'sendt', 'id', c.id);
end;
$$;

create or replace function public.record_posten_status(
  p_contract_id text,
  p_posten_status text,
  p_contract_status text,
  p_signer_status jsonb,
  p_employee_signed_at timestamptz,
  p_employer_signed_at timestamptz,
  p_pades_path text,
  p_pades_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found or c.posten_job_id is null then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke Posten-oppdraget');
  end if;
  if p_posten_status not in ('IN_PROGRESS', 'COMPLETED_SUCCESSFULLY', 'FAILED') then
    return jsonb_build_object('ok', false, 'error', 'Ukjent Posten-status');
  end if;
  if p_contract_status not in ('sendt', 'signert_ansatt', 'signert', 'avvist', 'utlopt') then
    return jsonb_build_object('ok', false, 'error', 'Ukjent avtalestatus');
  end if;
  update public.contracts
    set posten_status = p_posten_status,
        posten_signer_status = coalesce(p_signer_status, posten_signer_status),
        status = case
          when status = 'signert' then status
          when status in ('avvist', 'utlopt', 'trukket') and p_contract_status not in ('signert') then status
          else p_contract_status
        end,
        employee_signed_at = coalesce(employee_signed_at, p_employee_signed_at),
        employer_signed_at = coalesce(employer_signed_at, p_employer_signed_at),
        pdf_path = coalesce(p_pades_path, pdf_path),
        pdf_sha256 = coalesce(p_pades_sha256, pdf_sha256),
        posten_pades_path = coalesce(p_pades_path, posten_pades_path)
    where id = c.id;
  perform public.log_contract_event(
    c.id, c.org_id, 'posten_status', 'system', 'system', null, null,
    jsonb_build_object('job_id', c.posten_job_id, 'status', p_posten_status),
    c.content_sha256
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.touch_posten_poll_state(
  p_sender_org text,
  p_environment text,
  p_next timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.posten_poll_state (sender_org, environment, next_permitted_poll_at, updated_at)
  values (p_sender_org, p_environment, p_next, now())
  on conflict (sender_org, environment) do update
    set next_permitted_poll_at = excluded.next_permitted_poll_at,
        updated_at = now();
end;
$$;

revoke all on function public.posten_signing_parties(text) from public, anon, authenticated;
revoke all on function public.assert_contract_sendable(text) from public, anon;
revoke all on function public.mark_posten_job_sent(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_posten_status(text, text, text, jsonb, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.touch_posten_poll_state(text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.posten_signing_parties(text) to service_role;
grant execute on function public.assert_contract_sendable(text) to authenticated;
grant execute on function public.mark_posten_job_sent(text, text, text, text, jsonb) to service_role;
grant execute on function public.record_posten_status(text, text, text, jsonb, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.touch_posten_poll_state(text, text, timestamptz) to service_role;

-- Polling itself is the edge function posten-signering-poll. It must be
-- invoked on a schedule. Every minute is safe: the function skips a sender
-- until X-Next-permitted-poll-time, which is about 10 minutes in production
-- when the queue is empty. See docs/posten-signering.md.
