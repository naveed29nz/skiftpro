-- Record the countersigning admin's name and email on the motsignert event.
-- employer_signed_by stays the admin's user id. This does not rewrite
-- contracts that were already countersigned.

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
  otp public.contract_otp%rowtype;
  expected text;
  ctx jsonb;
  signer_name text;
  signer_email text;
begin
  ctx := public.contract_sign_context(p_contract_id, p_role);
  if coalesce(ctx ->> 'ok', 'false') <> 'true' then
    raise exception '%', coalesce(ctx ->> 'error', 'Ikke tillatt');
  end if;
  select * into c from public.contracts where id = p_contract_id;
  select * into otp
  from public.contract_otp o
  where o.contract_id = p_contract_id
    and o.user_id = auth.uid()::text
    and o.role = p_role
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
    perform public.log_contract_event(c.id, c.org_id, 'otp_feil', auth.uid()::text, p_role, p_ip, p_user_agent, '{}'::jsonb, c.content_sha256);
    raise exception 'Feil engangskode';
  end if;
  update public.contract_otp set consumed_at = now() where id = otp.id;

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

create or replace function public.contract_document(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  payload jsonb;
  signer_name text;
  signer_email text;
begin
  select * into c from public.contracts where id = p_id;
  if not found then
    return null;
  end if;
  if not (
    public.is_super_admin()
    or public.worker_matches(c.worker_id)
    or (public.can_read_wages() and public.in_org(c.org_id))
  ) then
    return null;
  end if;

  select e.payload into payload
  from public.contract_events e
  where e.contract_id = c.id
    and e.event_type = 'motsignert'
  order by e.created_at desc
  limit 1;
  signer_name := nullif(btrim(payload ->> 'name'), '');
  signer_email := nullif(btrim(payload ->> 'email'), '');
  if (signer_name is null or signer_email is null)
     and c.employer_signed_by is not null
     and c.employer_signed_by !~ '^guest:' then
    select
      coalesce(signer_name, nullif(btrim(p.full_name), '')),
      coalesce(signer_email, nullif(btrim(p.email), ''))
      into signer_name, signer_email
    from public.profiles p
    where p.id = c.employer_signed_by;
  end if;

  return jsonb_build_object(
    'id', c.id,
    'body_snapshot', c.body_snapshot,
    'field_values', c.field_values,
    'hourly_rate', c.hourly_rate,
    'pdf_path', c.pdf_path,
    'pdf_url', c.pdf_url,
    'pdf_sha256', c.pdf_sha256,
    'content_sha256', c.content_sha256,
    'metadata', c.metadata,
    'template_key', c.template_key,
    'template_version', c.template_version,
    'status', c.status,
    'employee_signed_at', c.employee_signed_at,
    'employee_signed_by', c.employee_signed_by,
    'employer_signed_at', c.employer_signed_at,
    'employer_signed_by', c.employer_signed_by,
    'employer_signed_name', signer_name,
    'employer_signed_email', signer_email
  );
end;
$$;
