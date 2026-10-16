-- Store address on the contract, and signing-mail bookkeeping.
-- NOT APPLIED to the live database by this change.
--
-- Arbeidsgivers adresse is the worker's store address (teamN_address on
-- the first team), then employer_settings.adresse. Company name, contact
-- name, and the workplace name are not used as this address. An empty
-- settings address does not block the contract when the store has one.
--
-- signing_email_sent_at stays null on every existing row. Nothing here
-- sends mail or backfills a send. Reminder emails are withheld unless
-- that timestamp was set by a send after this migration.

alter table public.organizations
  add column if not exists signert_kopi_epost text;

comment on column public.organizations.signert_kopi_epost is
  'Kopi av signerte avtaler til. Empty falls back to admin_email, then contact_email.';

alter table public.contracts
  add column if not exists signing_email_sent_at timestamptz,
  add column if not exists signing_email_claim text;

comment on column public.contracts.signing_email_sent_at is
  'Set only when a signing email is claimed for a send after this column exists. Null means do not email the employee, including reminders.';

comment on column public.contracts.signing_email_claim is
  'Internal claim id for the in-flight signing email. Not a signing link.';

create table if not exists public.contract_access_tokens (
  id text primary key default gen_random_uuid()::text,
  contract_id text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists contract_access_tokens_hash_idx
  on public.contract_access_tokens (token_hash);

create index if not exists contract_access_tokens_contract_idx
  on public.contract_access_tokens (contract_id);

alter table public.contract_access_tokens enable row level security;
revoke all on table public.contract_access_tokens from public, anon, authenticated;

comment on table public.contract_access_tokens is
  'SHA-256 of a signing-link token. The raw token is not stored. The link opens the contract; it does not sign it.';

-- Address of the employer on the agreement: the worker's store, then
-- employer settings. Not the workplace name, the company name, or the contact.
create or replace function public.worker_employer_address(p_worker_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  s public.employer_settings%rowtype;
  ws public.workplace_settings%rowtype;
  team_key text;
  team_address text;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return '';
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  if w.teams is not null and cardinality(w.teams) > 0 then
    team_key := w.teams[1];
  end if;
  if team_key ~ '^team(10|[1-9])$' and ws.id is not null then
    team_address := nullif(btrim(to_jsonb(ws) ->> (team_key || '_address')), '');
  end if;
  return coalesce(team_address, nullif(btrim(s.adresse), ''), '');
end;
$$;

create or replace function public.contract_field_values(p_worker_id text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  s public.employer_settings%rowtype;
  ws public.workplace_settings%rowtype;
  org public.organizations%rowtype;
  store jsonb;
  party jsonb;
  stilling text;
  ub jsonb;
  hours_base double precision;
  data jsonb;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return '{}'::jsonb;
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  select * into org from public.organizations where id = w.org_id;
  store := public.worker_store_fields(p_worker_id);
  party := public.employer_contract_party(w.org_id);
  ub := coalesce(s.ub_tillegg, '[]'::jsonb);
  hours_base := coalesce(s.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  stilling := coalesce(
    nullif(btrim(w.position), ''),
    'selger, som for tiden innebærer salg og kundeservice, renhold, varepåfylling, tilberedning av mat og matsikkerhet'
  );
  data := jsonb_build_object(
    'selskap', coalesce(party ->> 'selskap', ''),
    'org_nr', coalesce(party ->> 'org_nr', ''),
    'adresse', public.worker_employer_address(p_worker_id),
    'navn', coalesce(w.name, ''),
    'stilling', stilling,
    'stillingsprosent', public.format_no_number(coalesce(w.employment_percentage, 0)::numeric),
    'tiltredelsesdato', coalesce(to_char(w.tiltredelsesdato, 'DD.MM.YYYY'), ''),
    'opphorsdato', coalesce(to_char(w.opphorsdato, 'DD.MM.YYYY'), ''),
    'timer_per_uke', case when w.timer_per_uke is null then '' else public.format_no_number(w.timer_per_uke::numeric) end,
    'timer_per_dag', case when w.timer_per_dag is null then '' else public.format_no_number(w.timer_per_dag::numeric) end,
    'apningstid_fra', coalesce(store ->> 'apningstid_fra', ''),
    'apningstid_til', coalesce(store ->> 'apningstid_til', ''),
    'apningstider', coalesce(store ->> 'apningstider', ''),
    'notater', coalesce(store ->> 'notater', ''),
    'sted', coalesce(store ->> 'sted', ''),
    'timelonn', public.format_no_number(coalesce(w.hourly_rate, 0)::numeric),
    'signatur_navn', coalesce(party ->> 'signatur_navn', ''),
    'signatur_stilling', coalesce(s.signatur_stilling, ''),
    'lonningsdag', coalesce(s.lonningsdag, 15)::text,
    'feriepenger_utbetales', coalesce(nullif(s.feriepenger_utbetales, ''), 'mai'),
    'ferie_uker', coalesce(nullif(s.ferie_uker, ''), 'fire uker og 1 dag'),
    'feriepenger_prosent', public.format_no_number(coalesce(s.feriepenger_prosent, 10.2)::numeric) || ' %',
    'otp_leverandor', coalesce(nullif(s.otp_leverandor, ''), 'DNB-LIV'),
    'yrkesskade_forsikring', coalesce(nullif(s.yrkesskade_forsikring, ''), 'Gjensidige'),
    'oppsigelsesfrist_mnd', coalesce(s.oppsigelsesfrist_mnd_midlertidig, 1)::text,
    'provetid_mnd', coalesce(w.provetid_mnd, 0)::text,
    'arbeidsoppgaver', coalesce(w.arbeidsoppgaver, ''),
    'alminnelig_ukentlig_arbeidstid', public.format_no_number(hours_base::numeric),
    'tariff', coalesce(s.tariff, false),
    'under_18', w.birth_date is not null and w.birth_date > (coalesce(w.tiltredelsesdato, current_date) - interval '18 years'),
    'otp', coalesce(s.otp, true),
    'provetid', coalesce(w.provetid_mnd, 0) > 0,
    'har_ub', jsonb_array_length(ub) > 0,
    'ub_tillegg', ub,
    'grunnlag', case coalesce(s.tilkalling_grunnlag, 'vikar') when 'sesong' then 'Sesong' else 'Vikar' end,
    'har_hovedavtale', false,
    'har_rammeavtale', false
  );
  return data || coalesce(p_extra, '{}'::jsonb);
end;
$$;

create or replace function public.employment_contract_missing(p_worker_id text, p_checklist jsonb default '{}'::jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  s public.employer_settings%rowtype;
  org public.organizations%rowtype;
  store jsonb;
  party jsonb;
  missing text[] := '{}';
  months integer;
  half numeric;
  item text;
  required text[] := array[
    'lederfunksjoner', 'egen_arbeidstid', 'frivillig_stempling', 'egen_innsats',
    'delegerer', 'sammenlignbart_ansvar', 'fleksibilitet', 'lonn_speiler_ansvar'
  ];
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return array['Ansatt finnes ikke'];
  end if;
  select * into s from public.employer_settings where org_id = w.org_id limit 1;
  select * into org from public.organizations where id = w.org_id;
  store := public.worker_store_fields(p_worker_id);
  party := public.employer_contract_party(w.org_id);

  if nullif(btrim(w.name), '') is null then missing := array_append(missing, 'Fullt navn'); end if;
  if nullif(btrim(w.email), '') is null then missing := array_append(missing, 'E-post'); end if;
  if w.birth_date is null then missing := array_append(missing, 'Fødselsdato'); end if;
  if w.tiltredelsesdato is null then missing := array_append(missing, 'Tiltredelsesdato'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' and w.opphorsdato is null then
    missing := array_append(missing, 'Opphørsdato');
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'midlertidig_vikar', 'butikksjef_ledende')
     and w.employment_percentage is null then
    missing := array_append(missing, 'Stillingsprosent');
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_uke is null then
    missing := array_append(missing, 'Timer per uke (snitt)');
  end if;
  if coalesce(w.ansettelsestype, 'fast') <> 'tilkalling' and w.timer_per_dag is null then
    missing := array_append(missing, 'Timer per dag (snitt)');
  end if;
  if coalesce(w.hourly_rate, 0) <= 0 then missing := array_append(missing, 'Timelønn'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' and nullif(btrim(w.arbeidsoppgaver), '') is null then
    missing := array_append(missing, 'Arbeidsoppgaver');
  end if;
  if coalesce(w.ansettelsestype, 'fast') in ('fast', 'butikksjef_ledende') and coalesce(w.provetid_mnd, -1) <> 6 then
    missing := array_append(missing, 'Prøvetid på 6 måneder');
  end if;
  if coalesce(w.ansettelsestype, 'fast') = 'midlertidig_vikar' then
    if w.provetid_mnd is null or w.provetid_mnd < 0 or w.provetid_mnd > 6 then
      missing := array_append(missing, 'Prøvetid mellom 0 og 6 måneder');
    elsif w.tiltredelsesdato is not null and w.opphorsdato is not null then
      months := (extract(year from age(w.opphorsdato, w.tiltredelsesdato)) * 12
        + extract(month from age(w.opphorsdato, w.tiltredelsesdato)))::integer;
      half := months / 2.0;
      if w.provetid_mnd > half then
        missing := array_append(missing, 'Prøvetid kan ikke være lenger enn halvparten av ansettelsen');
      end if;
    end if;
  end if;
  if nullif(btrim(party ->> 'selskap'), '') is null then missing := array_append(missing, 'Arbeidsgivers juridiske navn'); end if;
  if nullif(btrim(party ->> 'org_nr'), '') is null then missing := array_append(missing, 'Organisasjonsnummer'); end if;
  if nullif(btrim(party ->> 'signatur_navn'), '') is null then missing := array_append(missing, 'Signaturberettiget navn'); end if;
  if nullif(btrim(public.worker_employer_address(p_worker_id)), '') is null then
    missing := array_append(missing, 'Arbeidsgivers adresse');
  end if;
  if coalesce(store ->> 'har_arbeidssted', '') <> 'true' then missing := array_append(missing, 'Arbeidssted'); end if;
  if nullif(btrim(store ->> 'apningstid_fra'), '') is null then missing := array_append(missing, 'Åpningstid fra'); end if;
  if nullif(btrim(store ->> 'apningstid_til'), '') is null then missing := array_append(missing, 'Åpningstid til'); end if;
  if coalesce(w.ansettelsestype, 'fast') = 'butikksjef_ledende' then
    foreach item in array required loop
      if coalesce(p_checklist ->> item, '') is distinct from 'true' then
        missing := array_append(missing, 'Butikksjef-sjekklisten må være ja på alle punkter');
        exit;
      end if;
    end loop;
  end if;
  return missing;
end;
$$;

-- The admin who may ask the service to email a contract that is already sent.
create or replace function public.contract_sender_context(p_contract_id text)
returns jsonb
language plpgsql
stable
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
    return jsonb_build_object('ok', false, 'error', 'Bare admin kan sende arbeidsavtale');
  end if;
  if c.status not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen er ikke sendt til signering');
  end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'org_id', c.org_id);
end;
$$;

-- Claims the signing email and returns a one-time raw token. Does not send mail.
-- A second call returns already_sent and no token. Existing rows stay unclaimed.
create or replace function public.prepare_contract_signing_mail(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.contracts%rowtype;
  w public.workers%rowtype;
  claim text;
  token text;
  token_hash text;
begin
  if auth.uid() is not null then
    raise exception 'Signeringslenke kan bare utstedes av tjenesten';
  end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if c.status not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen venter ikke på signering');
  end if;
  if c.signing_email_sent_at is not null then
    return jsonb_build_object('ok', true, 'already_sent', true, 'id', c.id);
  end if;
  select * into w from public.workers where id = c.worker_id;
  if nullif(btrim(coalesce(w.email, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Ansatt mangler e-post');
  end if;

  claim := gen_random_uuid()::text;
  update public.contracts
    set signing_email_sent_at = now(),
        signing_email_claim = claim
    where id = c.id
      and signing_email_sent_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'already_sent', true, 'id', c.id);
  end if;

  token := encode(gen_random_bytes(32), 'hex');
  token_hash := encode(digest(token, 'sha256'), 'hex');
  insert into public.contract_access_tokens (contract_id, token_hash, expires_at)
  values (c.id, token_hash, coalesce(c.expires_at, now() + interval '14 days'));

  return jsonb_build_object(
    'ok', true,
    'already_sent', false,
    'id', c.id,
    'claim', claim,
    'token', token,
    'email', btrim(w.email),
    'navn', coalesce(nullif(btrim(w.name), ''), c.worker_name, ''),
    'selskap', coalesce(c.org_name, ''),
    'frist', coalesce(c.expires_at, now() + interval '14 days')
  );
end;
$$;

create or replace function public.release_contract_signing_mail(p_contract_id text, p_claim text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'Signeringslenke kan bare utstedes av tjenesten';
  end if;
  if nullif(btrim(coalesce(p_claim, '')), '') is null then
    return;
  end if;
  update public.contracts
    set signing_email_sent_at = null,
        signing_email_claim = null
    where id = p_contract_id
      and signing_email_claim = p_claim;
end;
$$;

-- A fresh link for a reminder. Refuses contracts that were never emailed
-- by the signing-mail claim, so old rows cannot be mailed on deploy.
create or replace function public.create_contract_access_token(p_contract_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.contracts%rowtype;
  w public.workers%rowtype;
  token text;
  token_hash text;
begin
  if auth.uid() is not null then
    raise exception 'Signeringslenke kan bare utstedes av tjenesten';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Fant ikke avtalen');
  end if;
  if c.signing_email_sent_at is null then
    return jsonb_build_object('ok', false, 'error', 'Ingen signerings-e-post er sendt for denne avtalen');
  end if;
  if c.status not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen venter ikke på den ansatte');
  end if;
  select * into w from public.workers where id = c.worker_id;
  token := encode(gen_random_bytes(32), 'hex');
  token_hash := encode(digest(token, 'sha256'), 'hex');
  insert into public.contract_access_tokens (contract_id, token_hash, expires_at)
  values (c.id, token_hash, coalesce(c.expires_at, now() + interval '14 days'));
  return jsonb_build_object(
    'ok', true,
    'id', c.id,
    'token', token,
    'email', coalesce(w.email, ''),
    'navn', coalesce(nullif(btrim(w.name), ''), c.worker_name, ''),
    'selskap', coalesce(c.org_name, ''),
    'frist', coalesce(c.expires_at, now() + interval '14 days')
  );
end;
$$;

create or replace function public.guest_contract_context(p_contract_id text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c public.contracts%rowtype;
  w public.workers%rowtype;
  token_row public.contract_access_tokens%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'Signeringslenken kan bare brukes av tjenesten';
  end if;
  if nullif(btrim(coalesce(p_token, '')), '') is null or length(btrim(p_token)) < 32 then
    raise exception 'Lenken er ugyldig eller utløpt';
  end if;
  select * into token_row
  from public.contract_access_tokens t
  where t.contract_id = p_contract_id
    and t.token_hash = encode(digest(btrim(p_token), 'sha256'), 'hex')
    and t.revoked_at is null
    and t.expires_at > now();
  if not found then
    raise exception 'Lenken er ugyldig eller utløpt';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    raise exception 'Fant ikke avtalen';
  end if;
  select * into w from public.workers where id = c.worker_id;
  return jsonb_build_object(
    'ok', true,
    'id', c.id,
    'org_id', c.org_id,
    'worker_id', c.worker_id,
    'status', c.status,
    'body_snapshot', c.body_snapshot,
    'content_sha256', c.content_sha256,
    'template_key', c.template_key,
    'template_version', c.template_version,
    'worker_name', coalesce(nullif(btrim(w.name), ''), c.worker_name, ''),
    'email', coalesce(w.email, ''),
    'selskap', coalesce(c.field_values ->> 'selskap', c.org_name, ''),
    'expires_at', c.expires_at
  );
end;
$$;

create or replace function public.open_guest_contract(
  p_contract_id text,
  p_token text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx jsonb;
begin
  ctx := public.guest_contract_context(p_contract_id, p_token);
  if ctx ->> 'status' in ('trukket', 'utkast') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen er ikke tilgjengelig');
  end if;
  if ctx ->> 'status' = 'sendt' then
    update public.contracts
      set status = 'apnet',
          opened_at = coalesce(opened_at, now())
      where id = p_contract_id;
    perform public.log_contract_event(
      p_contract_id, ctx ->> 'org_id', 'åpnet', 'guest:' || (ctx ->> 'worker_id'), 'ansatt',
      p_ip, p_user_agent, '{}'::jsonb, ctx ->> 'content_sha256'
    );
    ctx := jsonb_set(ctx, '{status}', '"apnet"'::jsonb);
  end if;
  return ctx;
end;
$$;

create or replace function public.issue_guest_contract_otp(
  p_contract_id text,
  p_token text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ctx jsonb;
  code text;
  guest_user text;
begin
  ctx := public.guest_contract_context(p_contract_id, p_token);
  if ctx ->> 'status' not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen venter ikke på ansattes signatur');
  end if;
  if nullif(btrim(ctx ->> 'email'), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Ansatt mangler e-post');
  end if;
  guest_user := 'guest:' || (ctx ->> 'worker_id');
  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  update public.contract_otp
    set consumed_at = now()
    where contract_id = p_contract_id
      and user_id = guest_user
      and role = 'ansatt'
      and consumed_at is null;
  insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
  values (
    p_contract_id, guest_user, 'ansatt',
    encode(digest(code || ':' || p_contract_id, 'sha256'), 'hex'),
    now() + interval '10 minutes'
  );
  perform public.log_contract_event(
    p_contract_id, ctx ->> 'org_id', 'otp_sendt', guest_user, 'ansatt',
    p_ip, p_user_agent, '{}'::jsonb, ctx ->> 'content_sha256'
  );
  return jsonb_build_object('ok', true, 'code', code, 'email', ctx ->> 'email');
end;
$$;

create or replace function public.complete_guest_contract_signature(
  p_contract_id text,
  p_token text,
  p_code text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ctx jsonb;
  otp public.contract_otp%rowtype;
  expected text;
  guest_user text;
  signer text;
  worker_email text;
begin
  ctx := public.guest_contract_context(p_contract_id, p_token);
  if ctx ->> 'status' not in ('sendt', 'apnet') then
    raise exception 'Avtalen venter ikke på ansattes signatur';
  end if;
  guest_user := 'guest:' || (ctx ->> 'worker_id');
  worker_email := nullif(btrim(ctx ->> 'email'), '');
  select p.id into signer
  from public.profiles p
  where worker_email is not null
    and lower(p.email) = lower(worker_email)
  order by p.created_date
  limit 1;
  signer := coalesce(signer, guest_user);

  select * into otp
  from public.contract_otp o
  where o.contract_id = p_contract_id
    and o.user_id = guest_user
    and o.role = 'ansatt'
    and o.consumed_at is null
  order by o.created_at desc
  limit 1;
  if not found or otp.expires_at < now() then
    raise exception 'Engangskoden er ugyldig eller utløpt';
  end if;
  if otp.attempts >= 5 then
    raise exception 'For mange forsøk. Be om en ny kode.';
  end if;
  expected := encode(digest(coalesce(p_code, '') || ':' || p_contract_id, 'sha256'), 'hex');
  if expected is distinct from otp.code_hash then
    update public.contract_otp set attempts = attempts + 1 where id = otp.id;
    perform public.log_contract_event(
      p_contract_id, ctx ->> 'org_id', 'otp_feil', guest_user, 'ansatt',
      p_ip, p_user_agent, '{}'::jsonb, ctx ->> 'content_sha256'
    );
    raise exception 'Feil engangskode';
  end if;
  update public.contract_otp set consumed_at = now() where id = otp.id;

  update public.contracts
    set status = 'signert_ansatt',
        employee_signed_at = now(),
        employee_signed_by = signer,
        approved_by_worker_id = signer,
        approved_at = now()
    where id = p_contract_id;
  perform public.log_contract_event(
    p_contract_id, ctx ->> 'org_id', 'signert', signer, 'ansatt',
    p_ip, p_user_agent, '{}'::jsonb, ctx ->> 'content_sha256'
  );
  perform public.enqueue_notification(
    (select o.admin_user_id from public.organizations o where o.id = ctx ->> 'org_id'),
    ctx ->> 'org_id', 'contract_employee_signed', 'Ansatt har signert',
    coalesce(ctx ->> 'worker_name', 'Ansatt') || ' har signert avtalen. Arbeidsgiver må motsignere.'
  );
  return jsonb_build_object('ok', true, 'status', 'signert_ansatt', 'id', p_contract_id);
end;
$$;

create or replace function public.reject_guest_contract(
  p_contract_id text,
  p_token text,
  p_reason text default '',
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx jsonb;
  guest_user text;
begin
  ctx := public.guest_contract_context(p_contract_id, p_token);
  if ctx ->> 'status' not in ('sendt', 'apnet') then
    return jsonb_build_object('ok', false, 'error', 'Avtalen kan ikke avvises nå');
  end if;
  guest_user := 'guest:' || (ctx ->> 'worker_id');
  update public.contracts
    set status = 'avvist',
        rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_contract_id;
  perform public.log_contract_event(
    p_contract_id, ctx ->> 'org_id', 'avvist', guest_user, 'ansatt',
    p_ip, p_user_agent,
    jsonb_build_object('reason', coalesce(p_reason, '')),
    ctx ->> 'content_sha256'
  );
  perform public.enqueue_notification(
    (select o.admin_user_id from public.organizations o where o.id = ctx ->> 'org_id'),
    ctx ->> 'org_id', 'contract_rejected', 'Arbeidsavtale avvist',
    coalesce(ctx ->> 'worker_name', 'En ansatt') || ' har avvist avtalen.'
  );
  return jsonb_build_object('ok', true, 'status', 'avvist');
end;
$$;

create or replace function public.enqueue_contract_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  frist integer;
  result jsonb := '[]'::jsonb;
  worker_email text;
  reminder_day integer;
  email_allowed boolean;
begin
  for c in
    select * from public.contracts
    where status in ('sendt', 'apnet', 'signert_ansatt')
      and sent_at is not null
  loop
    select coalesce(e.signering_frist_dager, 14) into frist
    from public.employer_settings e where e.org_id = c.org_id;
    frist := coalesce(frist, 14);

    if now() >= coalesce(c.expires_at, c.sent_at + make_interval(days => frist)) then
      update public.contracts set status = 'utlopt' where id = c.id and status in ('sendt', 'apnet', 'signert_ansatt');
      perform public.log_contract_event(c.id, c.org_id, 'utløpt', null, 'system', null, null, '{}'::jsonb, c.content_sha256);
      perform public.enqueue_notification(
        (select o.admin_user_id from public.organizations o where o.id = c.org_id),
        c.org_id, 'contract_expired', 'Avtale utløpt',
        'Signeringsfristen er ute for ' || coalesce(c.worker_name, 'en ansatt') || '.'
      );
      result := result || jsonb_build_array(jsonb_build_object(
        'contract_id', c.id, 'kind', 'expired', 'worker_name', c.worker_name, 'org_id', c.org_id,
        'email', null, 'email_allowed', false, 'status', 'utlopt'
      ));
      continue;
    end if;

    if c.sent_at <= now() - interval '5 days' then
      reminder_day := 5;
    elsif c.sent_at <= now() - interval '2 days' then
      reminder_day := 2;
    else
      reminder_day := null;
    end if;

    if reminder_day is null then
      continue;
    end if;
    if exists (
      select 1 from public.contract_events e
      where e.contract_id = c.id
        and e.event_type = 'påminnelse'
        and e.payload ->> 'day' = reminder_day::text
    ) then
      continue;
    end if;

    perform public.log_contract_event(
      c.id, c.org_id, 'påminnelse', null, 'system', null, null,
      jsonb_build_object('day', reminder_day), c.content_sha256
    );
    if c.status = 'signert_ansatt' then
      perform public.enqueue_notification(
        (select o.admin_user_id from public.organizations o where o.id = c.org_id),
        c.org_id, 'contract_reminder', 'Motsignering venter',
        coalesce(c.worker_name, 'Ansatt') || ' har signert. Arbeidsgiver må motsignere.'
      );
    else
      perform public.enqueue_notification(
        public.profile_id_for_worker(c.worker_id), c.org_id, 'contract_reminder',
        'Påminnelse om arbeidsavtale',
        'Du har en avtale som venter på signering.'
      );
    end if;

    -- Employee reminder mail only after a real signing email. Old rows stay null.
    email_allowed := c.signing_email_sent_at is not null and c.status is distinct from 'signert_ansatt';
    worker_email := null;
    if email_allowed then
      select w.email into worker_email from public.workers w where w.id = c.worker_id;
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'contract_id', c.id,
      'kind', 'day' || reminder_day::text,
      'email', worker_email,
      'email_allowed', email_allowed,
      'worker_name', c.worker_name,
      'selskap', coalesce(c.org_name, ''),
      'expires_at', c.expires_at,
      'org_id', c.org_id,
      'status', c.status
    ));
  end loop;
  return jsonb_build_object('reminders', result);
end;
$$;

revoke all on function public.worker_employer_address(text) from public, anon, authenticated;
revoke all on function public.prepare_contract_signing_mail(text) from public, anon, authenticated;
revoke all on function public.release_contract_signing_mail(text, text) from public, anon, authenticated;
revoke all on function public.create_contract_access_token(text) from public, anon, authenticated;
revoke all on function public.guest_contract_context(text, text) from public, anon, authenticated;
revoke all on function public.open_guest_contract(text, text, text, text) from public, anon, authenticated;
revoke all on function public.issue_guest_contract_otp(text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_guest_contract_signature(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reject_guest_contract(text, text, text, text, text) from public, anon, authenticated;

revoke all on function public.contract_sender_context(text) from public, anon;
grant execute on function public.contract_sender_context(text) to authenticated;

grant execute on function public.prepare_contract_signing_mail(text) to service_role;
grant execute on function public.release_contract_signing_mail(text, text) to service_role;
grant execute on function public.create_contract_access_token(text) to service_role;
grant execute on function public.guest_contract_context(text, text) to service_role;
grant execute on function public.open_guest_contract(text, text, text, text) to service_role;
grant execute on function public.issue_guest_contract_otp(text, text, text, text) to service_role;
grant execute on function public.complete_guest_contract_signature(text, text, text, text, text) to service_role;
grant execute on function public.reject_guest_contract(text, text, text, text, text) to service_role;
