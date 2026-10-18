-- A second "send code" used to mark every earlier code consumed before the
-- new email was attempted. If that email never arrived, the only code in
-- the inbox no longer matched the one unconsumed row, and a later check
-- of that code looked like a wrong code. Keep every unexpired code usable
-- until it is actually used or it expires, and refuse a new code for 30
-- seconds so two taps cannot create two rows.

create or replace function public.match_live_contract_otp(
  p_contract_id text,
  p_user_id text,
  p_role text,
  p_code text,
  p_ip text,
  p_user_agent text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected text;
  latest public.contract_otp%rowtype;
  matched public.contract_otp%rowtype;
  org_id text;
  content_hash text;
  remaining integer;
begin
  select c.org_id, c.content_sha256 into org_id, content_hash
  from public.contracts c
  where c.id = p_contract_id;

  expected := encode(digest(coalesce(p_code, '') || ':' || p_contract_id, 'sha256'), 'hex');

  select * into latest
  from public.contract_otp o
  where o.contract_id = p_contract_id
    and o.user_id = p_user_id
    and o.role = p_role
    and o.consumed_at is null
    and o.expires_at > now()
  order by o.created_at desc
  limit 1;

  if not found then
    raise exception 'Koden er utløpt, send ny kode';
  end if;
  if latest.attempts >= 5 then
    raise exception 'For mange forsøk. Be om en ny kode.';
  end if;

  select * into matched
  from public.contract_otp o
  where o.contract_id = p_contract_id
    and o.user_id = p_user_id
    and o.role = p_role
    and o.consumed_at is null
    and o.expires_at > now()
    and o.code_hash = expected
  order by o.created_at desc
  limit 1;

  if not found then
    update public.contract_otp
      set attempts = attempts + 1
      where id = latest.id
      returning attempts into remaining;
    remaining := greatest(0, 5 - remaining);
    perform public.log_contract_event(
      p_contract_id, org_id, 'otp_feil', p_user_id, p_role, p_ip, p_user_agent,
      '{}'::jsonb, content_hash
    );
    if remaining <= 0 then
      raise exception 'For mange forsøk. Be om en ny kode.';
    end if;
    raise exception 'Feil kode, prøv igjen – du har % forsøk igjen', remaining;
  end if;

  update public.contract_otp
    set consumed_at = now()
    where contract_id = p_contract_id
      and user_id = p_user_id
      and role = p_role
      and consumed_at is null;

  return matched.id;
end;
$$;

revoke all on function public.match_live_contract_otp(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.match_live_contract_otp(text, text, text, text, text, text) to service_role;

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
  perform pg_advisory_xact_lock(hashtext('otp:' || p_contract_id || ':' || guest_user || ':ansatt'));
  if exists (
    select 1 from public.contract_otp o
    where o.contract_id = p_contract_id
      and o.user_id = guest_user
      and o.role = 'ansatt'
      and o.created_at > now() - interval '30 seconds'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ny kode kan sendes om 30 sekunder');
  end if;
  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
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

  perform public.match_live_contract_otp(
    p_contract_id, guest_user, 'ansatt', p_code, p_ip, p_user_agent
  );

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

create or replace function public.issue_contract_otp(
  p_user_id text,
  p_contract_id text,
  p_role text,
  p_ip text default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
  c public.contracts%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'Engangskode kan bare utstedes av tjenesten';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    raise exception 'Fant ikke avtalen';
  end if;
  perform pg_advisory_xact_lock(hashtext('otp:' || p_contract_id || ':' || p_user_id || ':' || p_role));
  if exists (
    select 1 from public.contract_otp o
    where o.contract_id = p_contract_id
      and o.user_id = p_user_id
      and o.role = p_role
      and o.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Ny kode kan sendes om 30 sekunder';
  end if;
  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  insert into public.contract_otp (contract_id, user_id, role, code_hash, expires_at)
  values (
    p_contract_id, p_user_id, p_role,
    encode(digest(code || ':' || p_contract_id, 'sha256'), 'hex'),
    now() + interval '10 minutes'
  );
  perform public.log_contract_event(
    c.id, c.org_id, 'otp_sendt', p_user_id, p_role, p_ip, p_user_agent, '{}'::jsonb, c.content_sha256
  );
  return code;
end;
$$;

create or replace function public.complete_contract_signature(
  p_contract_id text,
  p_role text,
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
  c public.contracts%rowtype;
  ctx jsonb;
  signer_name text;
  signer_email text;
begin
  ctx := public.contract_sign_context(p_contract_id, p_role);
  if coalesce(ctx ->> 'ok', 'false') <> 'true' then
    raise exception '%', coalesce(ctx ->> 'error', 'Ikke tillatt');
  end if;
  select * into c from public.contracts where id = p_contract_id;

  perform public.match_live_contract_otp(
    p_contract_id, auth.uid()::text, p_role, p_code, p_ip, p_user_agent
  );

  if p_role = 'ansatt' then
    update public.contracts
      set status = 'signert_ansatt',
          employee_signed_at = now(),
          employee_signed_by = auth.uid()::text,
          approved_by_worker_id = auth.uid()::text,
          approved_at = now()
      where id = c.id;
    perform public.log_contract_event(c.id, c.org_id, 'signert', auth.uid()::text, 'ansatt', p_ip, p_user_agent, '{}'::jsonb, c.content_sha256);
    perform public.enqueue_notification(
      (select o.admin_user_id from public.organizations o where o.id = c.org_id),
      c.org_id, 'contract_employee_signed', 'Ansatt har signert',
      coalesce(c.worker_name, 'Ansatt') || ' har signert avtalen. Arbeidsgiver må motsignere.'
    );
    return jsonb_build_object('ok', true, 'status', 'signert_ansatt', 'id', c.id);
  end if;

  select nullif(btrim(p.full_name), ''), nullif(btrim(p.email), '')
    into signer_name, signer_email
  from public.profiles p
  where p.id = auth.uid()::text;

  update public.contracts
    set status = 'signert',
        employer_signed_at = now(),
        employer_signed_by = auth.uid()::text
    where id = c.id;
  perform public.log_contract_event(
    c.id, c.org_id, 'motsignert', auth.uid()::text, 'arbeidsgiver', p_ip, p_user_agent,
    jsonb_strip_nulls(jsonb_build_object(
      'user_id', auth.uid()::text,
      'name', signer_name,
      'email', signer_email
    )),
    c.content_sha256
  );
  perform public.enqueue_notification(
    public.profile_id_for_worker(c.worker_id), c.org_id, 'contract_signed',
    'Arbeidsavtale signert',
    'Avtalen er signert av begge parter. En kopi blir sendt på e-post når den er klar.'
  );
  return jsonb_build_object(
    'ok', true,
    'status', 'signert',
    'id', c.id,
    'employer_signed_by', auth.uid()::text,
    'employer_signed_name', signer_name,
    'employer_signed_email', signer_email
  );
end;
$$;
