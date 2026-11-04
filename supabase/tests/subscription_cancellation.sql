-- Oppsigelsesprotokoll on the throwaway database.
-- Does not connect to the hosted Supabase project.
-- Requires the fixtures from rls_isolation.sql and
-- 20261104120000_subscription_cancellation.sql.

create temp table if not exists rls_results (
  name text primary key,
  ok boolean not null,
  detail text
);

insert into rls_results (name, ok, detail)
select
  'long date is Norwegian',
  public.norwegian_long_date(date '2026-12-01') = '1. desember 2026'
    and public.norwegian_long_date(date '2027-03-01') = '1. mars 2027',
  public.norwegian_long_date(date '2026-12-01');

insert into rls_results (name, ok, detail)
select
  '4 November 2026 ends 31 December and is deleted 1 March',
  requested_on = date '2026-11-04'
    and notice_starts_on = date '2026-12-01'
    and subscription_ends_on = date '2026-12-31'
    and data_deletion_on = date '2027-03-01',
  notice_starts_on::text || ' ' || subscription_ends_on::text || ' ' || data_deletion_on::text
from public.subscription_cancellation_schedule('2026-11-04 10:00:00+01');

insert into rls_results (name, ok, detail)
select
  'Oslo midnight moves the notice into the next month',
  (
    select notice_starts_on = date '2026-12-01'
    from public.subscription_cancellation_schedule('2026-11-30 22:30:00+00')
  )
  and (
    select notice_starts_on = date '2027-01-01'
      and subscription_ends_on = date '2027-01-31'
      and data_deletion_on = date '2027-04-01'
    from public.subscription_cancellation_schedule('2026-11-30 23:30:00+00')
  ),
  'ok';

insert into rls_results (name, ok, detail)
select
  'leap-year February notice is 30 days',
  notice_starts_on = date '2020-02-01'
    and subscription_ends_on = date '2020-03-02'
    and data_deletion_on = date '2020-05-01',
  subscription_ends_on::text || ' ' || data_deletion_on::text
from public.subscription_cancellation_schedule('2020-01-15 12:00:00+01');

insert into rls_results (name, ok, detail)
select
  'reason labels match the customer text',
  public.cancellation_reason_label('pris') = 'Prisen passer ikke lenger'
    and public.cancellation_offer_id('pris') = 'prisavtale'
    and public.cancellation_reason_label('annet') = 'Annen grunn'
    and public.cancellation_offer_id('midlertidig') = 'pause'
    and public.cancellation_reason_label('ukjent') is null,
  coalesce(public.cancellation_reason_label('pris'), 'null');

do $do$
declare
  detail text;
  workers_before integer;
  org_status text;
  row_count integer;
  scheduled public.subscription_cancellations%rowtype;
  sched record;
begin
  insert into public.profiles (id, email, full_name, role) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cancel-admin@example.com', 'Kari Nordmann', 'admin'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'mail-admin@example.com', 'Mail Admin', 'admin');

  insert into public.organizations (id, name, admin_user_id, status) values
    ('org-cancel', 'Kiosk Eksempel AS', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'active'),
    ('org-cancel-closed', 'Stengt AS', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'inactive');

  insert into public.organizations (id, name, admin_email, status) values
    ('org-cancel-mail', 'Epostkunde AS', 'mail-admin@example.com', 'trial');

  insert into public.workers (id, org_id, name, email) values
    ('w-cancel', 'org-cancel', 'Ansatt Cancel', 'cancel-worker@example.com');

  select count(*) into workers_before from public.workers where org_id = 'org-cancel';

  detail := public._rls_exec(
    '33333333-3333-3333-3333-333333333333',
    $q$select public.submit_subscription_cancellation('org-cancel', 'pris', null)$q$
  );
  insert into rls_results values (
    'department admin cannot cancel',
    detail like '%administratoren%',
    detail
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$select public.submit_subscription_cancellation('org-cancel', 'pris', null)$q$
  );
  insert into rls_results values (
    'super-admin cannot cancel for the customer',
    detail like '%administratoren%',
    detail
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.submit_subscription_cancellation('org-cancel-closed', 'pris', null)$q$
  );
  insert into rls_results values (
    'inactive subscription cannot be cancelled again',
    detail like '%allerede avsluttet%',
    detail
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.submit_subscription_cancellation('org-cancel', 'annet', 'kort')$q$
  );
  insert into rls_results values (
    'other reason needs ten characters',
    detail like '%minst ti tegn%',
    detail
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.submit_subscription_cancellation('org-cancel', 'pris', null)$q$
  );
  if detail <> 'ok' then
    insert into rls_results values ('customer admin can submit', false, detail);
    return;
  end if;

  select * into scheduled
  from public.subscription_cancellations
  where org_id = 'org-cancel' and status = 'scheduled';

  select * into sched
  from public.subscription_cancellation_schedule(scheduled.requested_at);

  select status into org_status from public.organizations where id = 'org-cancel';

  insert into rls_results values (
    'customer admin can submit',
    scheduled.reason_code = 'pris'
      and scheduled.reason_label = 'Prisen passer ikke lenger'
      and scheduled.offer_id = 'prisavtale'
      and scheduled.offer_choice = 'declined'
      and scheduled.notice_starts_on = sched.notice_starts_on
      and scheduled.subscription_ends_on = sched.subscription_ends_on
      and scheduled.data_deletion_on = sched.data_deletion_on
      and scheduled.receipt_number ~ '^OP-[0-9]{4}-[0-9]{5}$'
      and scheduled.acknowledgement like '%' || public.norwegian_long_date(scheduled.subscription_ends_on) || '%'
      and scheduled.acknowledgement like '%' || public.norwegian_long_date(scheduled.data_deletion_on) || '%'
      and scheduled.acknowledgement like '%slettes ikke automatisk%'
      and scheduled.requested_by_name = 'Kari Nordmann'
      and org_status = 'active'
      and scheduled.org_name = 'Kiosk Eksempel AS',
    coalesce(scheduled.receipt_number, detail)
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.submit_subscription_cancellation('org-cancel', 'pris', null)$q$
  );
  insert into rls_results values (
    'a second open cancellation is rejected',
    detail like '%allerede en oppsigelse%',
    detail
  );

  insert into rls_results values (
    'customer admin reads only their protocol',
    public._rls_count(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      $q$select id from public.subscription_cancellations where org_id = 'org-cancel'$q$
    ) = 1,
    'count'
  );

  insert into rls_results values (
    'another customer cannot read the protocol',
    public._rls_count(
      '22222222-2222-2222-2222-222222222222',
      $q$select id from public.subscription_cancellations$q$
    ) = 0,
    'count'
  );

  insert into rls_results values (
    'employee cannot read the protocol',
    public._rls_count(
      '55555555-5555-5555-5555-555555555555',
      $q$select id from public.subscription_cancellations$q$
    ) = 0,
    'count'
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$insert into public.subscription_cancellations (org_id, org_name, reason_code, reason_label, offer_id, notice_starts_on, subscription_ends_on, data_deletion_on, receipt_number, acknowledgement) values ('org-cancel', 'Kiosk Eksempel AS', 'pris', 'Prisen passer ikke lenger', 'prisavtale', date '2026-12-01', date '2026-12-31', date '2027-03-01', 'OP-2099-99999', 'nei')$q$
  );
  insert into rls_results values (
    'customer cannot insert a protocol directly',
    detail like '%permission denied%',
    detail
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$update public.subscription_cancellations set status = 'withdrawn' where org_id = 'org-cancel'$q$
  );
  insert into rls_results values (
    'customer cannot update a protocol directly',
    detail like '%permission denied%',
    detail
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.mark_subscription_data_deleted((select id from public.subscription_cancellations where org_id = 'org-cancel' and status = 'scheduled'), null)$q$
  );
  insert into rls_results values (
    'customer cannot record deletion',
    detail like '%superadministrator%',
    detail
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$select public.mark_subscription_data_deleted((select id from public.subscription_cancellations where org_id = 'org-cancel' and status = 'scheduled'), 'for tidlig')$q$
  );
  insert into rls_results values (
    'deletion cannot be recorded before the deletion date',
    detail like '%Slettedatoen er ikke nådd%',
    detail
  );

  select count(*) into row_count from public.workers where id = 'w-cancel';
  insert into rls_results values (
    'early deletion attempt keeps the employee',
    row_count = 1 and workers_before = 1,
    row_count::text
  );

  detail := public._rls_exec(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    $q$select public.withdraw_subscription_cancellation((select id from public.subscription_cancellations where org_id = 'org-cancel' and status = 'scheduled'))$q$
  );
  insert into rls_results values (
    'customer admin can withdraw before the end date',
    detail = 'ok'
      and exists (
        select 1 from public.subscription_cancellations
        where org_id = 'org-cancel' and status = 'withdrawn'
      ),
    detail
  );

  detail := public._rls_exec(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    $q$select public.submit_subscription_cancellation('org-cancel-mail', 'annet', 'Vi stenger kiosken i desember.')$q$
  );
  insert into rls_results values (
    'admin matched by email can cancel a trial',
    detail = 'ok'
      and exists (
        select 1 from public.subscription_cancellations
        where org_id = 'org-cancel-mail'
          and status = 'scheduled'
          and reason_detail = 'Vi stenger kiosken i desember.'
          and offer_id = 'dialog'
      ),
    detail
  );

  insert into public.subscription_cancellations (
    id, org_id, org_name, status, reason_code, reason_label, offer_id, offer_choice,
    requested_at, requested_by, requested_by_name, requested_by_email,
    notice_starts_on, subscription_ends_on, data_deletion_on, receipt_number, acknowledgement
  ) values (
    'cancel-old', 'org-cancel', 'Kiosk Eksempel AS', 'scheduled', 'stenger',
    'Virksomheten legges ned eller reduseres', 'behold', 'declined',
    '2020-01-15 12:00:00+01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kari Nordmann', 'cancel-admin@example.com',
    date '2020-02-01', date '2020-03-02', date '2020-05-01', 'OP-2020-00077',
    'historisk protokoll'
  );
end;
$do$;

do $do$
declare
  detail text;
  workers_after integer;
  marked public.subscription_cancellations%rowtype;
  source text;
begin
  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$select public.mark_subscription_data_deleted('cancel-old', 'Slettet manuelt i arkivet')$q$
  );

  select * into marked from public.subscription_cancellations where id = 'cancel-old';
  select count(*) into workers_after from public.workers where org_id = 'org-cancel';

  insert into rls_results values (
    'super-admin records manual deletion without deleting rows',
    detail = 'ok'
      and marked.status = 'data_deleted'
      and marked.data_deleted_at is not null
      and marked.data_deleted_by = '00000000-0000-0000-0000-000000000001'
      and marked.data_deleted_note = 'Slettet manuelt i arkivet'
      and workers_after = 1
      and exists (select 1 from public.organizations where id = 'org-cancel' and status = 'active'),
    detail || ' status=' || coalesce(marked.status, 'missing')
  );

  detail := public._rls_exec(
    '00000000-0000-0000-0000-000000000001',
    $q$select public.mark_subscription_data_deleted('cancel-old', null)$q$
  );
  insert into rls_results values (
    'manual deletion is recorded once',
    detail like '%allerede registrert%',
    detail
  );

  select string_agg(lower(prosrc), ' ') into source
  from pg_proc
  where proname in (
    'submit_subscription_cancellation',
    'withdraw_subscription_cancellation',
    'mark_subscription_data_deleted'
  );

  insert into rls_results values (
    'protocol functions do not delete customer tables',
    source not like '%delete from%'
      and source like '%does not delete%',
    'scanned'
  );
end;
$do$;

do $do$
begin
  insert into public.subscription_cancellations (
    id, org_id, org_name, reason_code, reason_label, offer_id,
    notice_starts_on, subscription_ends_on, data_deletion_on, receipt_number, acknowledgement
  ) values (
    'cancel-bad', 'org-cancel', 'Kiosk Eksempel AS', 'pris', 'Prisen passer ikke lenger', 'prisavtale',
    date '2026-12-01', date '2026-12-30', date '2027-02-28', 'OP-2026-00002', 'feil lengde'
  );
  insert into rls_results values ('short notice is rejected', false, 'insert succeeded');
exception
  when check_violation then
    insert into rls_results values ('short notice is rejected', true, sqlerrm);
end;
$do$;

select name, case when ok then 'PASS' else 'FAIL' end as result, detail
from rls_results
order by ok, name;

select count(*) filter (where not ok) as failed, count(*) as total from rls_results;
