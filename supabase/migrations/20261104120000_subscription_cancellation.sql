-- Oppsigelsesprotokoll for kundens abonnement.
-- NOT APPLIED to the hosted database by this file. Review it, then run it
-- on a non-production database when the preview is accepted.
--
-- Rules, Europe/Oslo:
--   Notice is 30 days and starts on the 1st of the month after the request.
--   The subscription ends when those 30 days have passed.
--   Customer data is kept 60 days after the subscription ends.
-- This migration does not delete organizations, workers, shifts, or files.
-- data_deletion_on is only a date. A super-admin records a manual deletion later.

create or replace function public.norwegian_long_date(p_date date)
returns text
language sql
immutable
as $$
  select extract(day from p_date)::int::text
    || '. '
    || (array[
      'januar', 'februar', 'mars', 'april', 'mai', 'juni',
      'juli', 'august', 'september', 'oktober', 'november', 'desember'
    ])[extract(month from p_date)::int]
    || ' '
    || extract(year from p_date)::int::text;
$$;

create or replace function public.subscription_cancellation_schedule(p_at timestamptz)
returns table (
  requested_on date,
  notice_starts_on date,
  subscription_ends_on date,
  data_deletion_on date
)
language sql
stable
set search_path = public
as $$
  with oslo as (
    select (p_at at time zone 'Europe/Oslo')::date as requested_on
  )
  select
    requested_on,
    (date_trunc('month', requested_on::timestamp)::date + interval '1 month')::date as notice_starts_on,
    ((date_trunc('month', requested_on::timestamp)::date + interval '1 month')::date + 30) as subscription_ends_on,
    (((date_trunc('month', requested_on::timestamp)::date + interval '1 month')::date + 30) + 60) as data_deletion_on
  from oslo;
$$;

create or replace function public.cancellation_reason_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'pris' then 'Prisen passer ikke lenger'
    when 'funksjoner' then 'Vi savner funksjoner vi trenger'
    when 'bytte' then 'Vi bytter til et annet system'
    when 'stenger' then 'Virksomheten legges ned eller reduseres'
    when 'midlertidig' then 'Vi trenger en pause, ikke en avslutning'
    when 'support' then 'Vi er ikke fornøyde med oppfølgingen'
    when 'annet' then 'Annen grunn'
    else null
  end;
$$;

create or replace function public.cancellation_offer_id(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'pris' then 'prisavtale'
    when 'funksjoner' then 'behov'
    when 'bytte' then 'overgang'
    when 'stenger' then 'behold'
    when 'midlertidig' then 'pause'
    when 'support' then 'oppfolging'
    when 'annet' then 'dialog'
    else null
  end;
$$;

create or replace function public.is_customer_admin(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    join public.profiles p on p.id = auth.uid()::text
    where o.id = org
      and (
        o.admin_user_id = p.id
        or (
          o.admin_email is not null
          and btrim(o.admin_email) <> ''
          and lower(o.admin_email) = lower(coalesce(p.email, ''))
        )
      )
  );
$$;

create sequence public.subscription_cancellation_receipt_seq;

create table public.subscription_cancellations (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  org_name text not null,
  status text not null default 'scheduled',
  reason_code text not null,
  reason_label text not null,
  reason_detail text,
  offer_id text not null,
  offer_choice text not null default 'declined',
  requested_at timestamptz not null default now(),
  requested_by text,
  requested_by_name text,
  requested_by_email text,
  notice_starts_on date not null,
  subscription_ends_on date not null,
  data_deletion_on date not null,
  receipt_number text not null unique,
  acknowledgement text not null,
  data_deleted_at timestamptz,
  data_deleted_by text,
  data_deleted_note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint subscription_cancellations_status_check check (status in ('scheduled', 'withdrawn', 'data_deleted')),
  constraint subscription_cancellations_reason_check check (
    reason_code in ('pris', 'funksjoner', 'bytte', 'stenger', 'midlertidig', 'support', 'annet')
  ),
  constraint subscription_cancellations_offer_check check (offer_choice = 'declined'),
  constraint subscription_cancellations_detail_check check (
    char_length(coalesce(reason_detail, '')) <= 2000
    and (
      (reason_code = 'annet' and reason_detail is not null and char_length(btrim(reason_detail)) >= 10)
      or reason_code <> 'annet'
    )
  ),
  constraint subscription_cancellations_notice_day check (extract(day from notice_starts_on) = 1),
  constraint subscription_cancellations_notice_length check (subscription_ends_on = notice_starts_on + 30),
  constraint subscription_cancellations_retention check (data_deletion_on = subscription_ends_on + 60),
  constraint subscription_cancellations_note_check check (char_length(coalesce(data_deleted_note, '')) <= 2000)
);

comment on table public.subscription_cancellations is
  'Oppsigelsesprotokoll. Lagrer sluttdato og planlagt slettedato. Sletter ingen kundedata.';

create index subscription_cancellations_org_idx
  on public.subscription_cancellations (org_id, requested_at desc);

create unique index subscription_cancellations_one_scheduled_idx
  on public.subscription_cancellations (org_id)
  where status = 'scheduled';

create trigger subscription_cancellations_prepare
  before insert or update on public.subscription_cancellations
  for each row execute function public.prepare_entity_row();

alter table public.subscription_cancellations enable row level security;

create policy subscription_cancellations_select on public.subscription_cancellations
  for select to authenticated
  using (public.is_super_admin() or public.is_customer_admin(org_id));

revoke all on table public.subscription_cancellations from public, anon, authenticated;
grant select on table public.subscription_cancellations to authenticated;

revoke all on sequence public.subscription_cancellation_receipt_seq from public, anon, authenticated;

create or replace function public.subscription_cancellation_json(p public.subscription_cancellations)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'org_id', p.org_id,
    'org_name', p.org_name,
    'status', p.status,
    'reason_code', p.reason_code,
    'reason_label', p.reason_label,
    'reason_detail', p.reason_detail,
    'offer_id', p.offer_id,
    'offer_choice', p.offer_choice,
    'requested_at', p.requested_at,
    'requested_by', p.requested_by,
    'requested_by_name', p.requested_by_name,
    'requested_by_email', p.requested_by_email,
    'notice_starts_on', p.notice_starts_on,
    'subscription_ends_on', p.subscription_ends_on,
    'data_deletion_on', p.data_deletion_on,
    'receipt_number', p.receipt_number,
    'acknowledgement', p.acknowledgement,
    'data_deleted_at', p.data_deleted_at,
    'data_deleted_by', p.data_deleted_by,
    'data_deleted_note', p.data_deleted_note
  );
$$;

create or replace function public.submit_subscription_cancellation(
  p_org_id text,
  p_reason_code text,
  p_reason_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations%rowtype;
  v_code text;
  v_label text;
  v_offer text;
  v_detail text;
  v_name text;
  v_email text;
  v_requested_on date;
  v_notice date;
  v_ends date;
  v_deletion date;
  v_receipt text;
  v_ack text;
  v_row public.subscription_cancellations%rowtype;
begin
  -- Records the protocol only. Does not delete customer data or change status.
  if not public.is_customer_admin(p_org_id) then
    raise exception 'Bare administratoren som står på kundekortet kan si opp abonnementet.'
      using errcode = '42501';
  end if;

  select * into v_org
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'Fant ikke kunden.' using errcode = 'P0001';
  end if;

  if v_org.status not in ('active', 'trial') then
    raise exception 'Abonnementet er allerede avsluttet.' using errcode = 'P0001';
  end if;

  v_code := lower(btrim(coalesce(p_reason_code, '')));
  v_label := public.cancellation_reason_label(v_code);
  v_offer := public.cancellation_offer_id(v_code);
  if v_label is null or v_offer is null then
    raise exception 'Velg hvorfor dere sier opp.' using errcode = '22023';
  end if;

  if v_code = 'annet' then
    v_detail := btrim(coalesce(p_reason_detail, ''));
    if char_length(v_detail) < 10 then
      raise exception 'Beskriv grunnen med minst ti tegn.' using errcode = '22023';
    end if;
    if char_length(v_detail) > 2000 then
      raise exception 'Teksten kan være på maks 2000 tegn.' using errcode = '22023';
    end if;
  else
    v_detail := null;
  end if;

  if exists (
    select 1
    from public.subscription_cancellations
    where org_id = v_org.id
      and status = 'scheduled'
  ) then
    raise exception 'Det finnes allerede en oppsigelse for denne kunden.' using errcode = 'P0001';
  end if;

  select requested_on, notice_starts_on, subscription_ends_on, data_deletion_on
    into v_requested_on, v_notice, v_ends, v_deletion
  from public.subscription_cancellation_schedule(now());

  select coalesce(nullif(btrim(p.full_name), ''), p.email), p.email
    into v_name, v_email
  from public.profiles p
  where p.id = auth.uid()::text;

  v_receipt := 'OP-' || extract(year from v_requested_on)::int::text || '-'
    || lpad(nextval('public.subscription_cancellation_receipt_seq')::text, 5, '0');

  v_ack := format(
    'Jeg er administrator for %s og bekrefter at abonnementet sies opp. Oppsigelsen begynner %s, abonnementet opphører %s, og planlagt slettedato er %s. Data slettes ikke automatisk.',
    v_org.name,
    public.norwegian_long_date(v_notice),
    public.norwegian_long_date(v_ends),
    public.norwegian_long_date(v_deletion)
  );

  insert into public.subscription_cancellations (
    org_id,
    org_name,
    status,
    reason_code,
    reason_label,
    reason_detail,
    offer_id,
    offer_choice,
    requested_at,
    requested_by,
    requested_by_name,
    requested_by_email,
    notice_starts_on,
    subscription_ends_on,
    data_deletion_on,
    receipt_number,
    acknowledgement
  ) values (
    v_org.id,
    v_org.name,
    'scheduled',
    v_code,
    v_label,
    v_detail,
    v_offer,
    'declined',
    now(),
    auth.uid()::text,
    v_name,
    v_email,
    v_notice,
    v_ends,
    v_deletion,
    v_receipt,
    v_ack
  )
  returning * into v_row;

  return public.subscription_cancellation_json(v_row);
exception
  when unique_violation then
    raise exception 'Det finnes allerede en oppsigelse for denne kunden.' using errcode = 'P0001';
end;
$$;

create or replace function public.withdraw_subscription_cancellation(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_cancellations%rowtype;
begin
  select * into v_row
  from public.subscription_cancellations
  where id = p_id
  for update;

  if not found then
    raise exception 'Fant ikke oppsigelsen.' using errcode = 'P0001';
  end if;

  if not public.is_customer_admin(v_row.org_id) then
    raise exception 'Bare administratoren som står på kundekortet kan angre oppsigelsen.'
      using errcode = '42501';
  end if;

  if v_row.status <> 'scheduled' then
    raise exception 'Oppsigelsen kan ikke angres.' using errcode = 'P0001';
  end if;

  if (now() at time zone 'Europe/Oslo')::date > v_row.subscription_ends_on then
    raise exception 'Oppsigelsen kan ikke angres etter at abonnementet er avsluttet.'
      using errcode = 'P0001';
  end if;

  update public.subscription_cancellations
  set status = 'withdrawn'
  where id = v_row.id
  returning * into v_row;

  return public.subscription_cancellation_json(v_row);
end;
$$;

create or replace function public.mark_subscription_data_deleted(p_id text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_cancellations%rowtype;
  v_note text;
begin
  -- Records that a super-admin deleted the customer's data by hand.
  -- This function does not delete organizations, workers, shifts, stamps, or files.
  if not public.is_super_admin() then
    raise exception 'Bare en superadministrator kan registrere at data er slettet.'
      using errcode = '42501';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Teksten kan være på maks 2000 tegn.' using errcode = '22023';
  end if;

  select * into v_row
  from public.subscription_cancellations
  where id = p_id
  for update;

  if not found then
    raise exception 'Fant ikke oppsigelsen.' using errcode = 'P0001';
  end if;

  if v_row.status = 'withdrawn' then
    raise exception 'Oppsigelsen er angret. Det er ingen sletting å registrere.' using errcode = 'P0001';
  end if;

  if v_row.status = 'data_deleted' then
    raise exception 'Slettingen er allerede registrert.' using errcode = 'P0001';
  end if;

  if v_row.status <> 'scheduled' then
    raise exception 'Oppsigelsen kan ikke oppdateres.' using errcode = 'P0001';
  end if;

  if (now() at time zone 'Europe/Oslo')::date < v_row.data_deletion_on then
    raise exception 'Slettedatoen er ikke nådd. Data skal bli liggende til den dagen, og slettes deretter manuelt.'
      using errcode = 'P0001';
  end if;

  update public.subscription_cancellations
  set
    status = 'data_deleted',
    data_deleted_at = now(),
    data_deleted_by = auth.uid()::text,
    data_deleted_note = v_note
  where id = v_row.id
  returning * into v_row;

  return public.subscription_cancellation_json(v_row);
end;
$$;

revoke all on function public.norwegian_long_date(date) from public;
revoke all on function public.subscription_cancellation_schedule(timestamptz) from public;
revoke all on function public.cancellation_reason_label(text) from public;
revoke all on function public.cancellation_offer_id(text) from public;
revoke all on function public.subscription_cancellation_json(public.subscription_cancellations) from public;
revoke all on function public.is_customer_admin(text) from public;
revoke all on function public.submit_subscription_cancellation(text, text, text) from public;
revoke all on function public.withdraw_subscription_cancellation(text) from public;
revoke all on function public.mark_subscription_data_deleted(text, text) from public;

grant execute on function public.is_customer_admin(text) to authenticated;
grant execute on function public.submit_subscription_cancellation(text, text, text) to authenticated;
grant execute on function public.withdraw_subscription_cancellation(text) to authenticated;
grant execute on function public.mark_subscription_data_deleted(text, text) to authenticated;
