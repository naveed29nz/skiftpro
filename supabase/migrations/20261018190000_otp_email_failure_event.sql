-- An OTP row can exist without an email when the phone leaves the page
-- after the code is stored and before Resend answers. Record that failure
-- so it is visible next to otp_sendt.

alter table public.contract_events drop constraint if exists contract_events_type_check;
alter table public.contract_events add constraint contract_events_type_check check (
  event_type in (
    'opprettet', 'sendt', 'påminnelse', 'åpnet', 'otp_sendt', 'otp_feil', 'otp_epost_feilet',
    'signert', 'motsignert', 'avvist', 'trukket', 'utløpt'
  )
);

create or replace function public.record_otp_email_failure(
  p_contract_id text,
  p_role text,
  p_actor text,
  p_status integer,
  p_resend_id text,
  p_error text,
  p_ip text,
  p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contracts%rowtype;
  actor text;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return;
  end if;
  actor := nullif(btrim(coalesce(p_actor, '')), '');
  if actor is null and p_role = 'ansatt' then
    actor := 'guest:' || c.worker_id;
  end if;
  perform public.log_contract_event(
    c.id,
    c.org_id,
    'otp_epost_feilet',
    actor,
    p_role,
    p_ip,
    p_user_agent,
    jsonb_strip_nulls(jsonb_build_object(
      'status', p_status,
      'resend_id', nullif(btrim(coalesce(p_resend_id, '')), ''),
      'error', nullif(left(coalesce(p_error, ''), 500), '')
    )),
    c.content_sha256
  );
end;
$$;

revoke all on function public.record_otp_email_failure(text, text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_otp_email_failure(text, text, text, integer, text, text, text, text) to service_role;
