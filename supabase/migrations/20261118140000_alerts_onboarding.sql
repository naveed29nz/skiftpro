-- Varselsenter read/dismiss state, new-employee checklist progress, and a
-- contact update that only writes phone and address.
-- Does not send email, invitations, or contracts.
-- Not applied to the hosted database by this file.

create table public.alert_states (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  user_id text not null,
  alert_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint alert_states_user_key unique (user_id, alert_key),
  constraint alert_states_key_len check (char_length(alert_key) between 1 and 200)
);

comment on table public.alert_states is
  'Per-user read and dismiss flags for the manager alert list. The alerts themselves are computed from shifts and contracts.';

create index alert_states_org_idx on public.alert_states (org_id, user_id);

create trigger alert_states_prepare
  before insert or update on public.alert_states
  for each row execute function public.prepare_entity_row();

create table public.onboarding_progress (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  user_id text not null,
  worker_id text not null,
  dismissed_at timestamptz,
  notifications_done_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint onboarding_progress_user unique (user_id),
  constraint onboarding_progress_worker unique (worker_id)
);

comment on table public.onboarding_progress is
  'Dismiss flag and the notifications step for one employee. Profile, contract and availability are derived from existing rows.';

create index onboarding_progress_org_idx on public.onboarding_progress (org_id);

create trigger onboarding_progress_prepare
  before insert or update on public.onboarding_progress
  for each row execute function public.prepare_entity_row();

create or replace function public.can_see_manager_alerts(target_org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or (
        public.in_org(target_org)
        and public.effective_role() in ('admin', 'sub_admin', 'butikksjef')
      );
$$;

revoke all on function public.can_see_manager_alerts(text) from public, anon;
grant execute on function public.can_see_manager_alerts(text) to authenticated;

create or replace function public.guard_alert_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.can_see_manager_alerts(new.org_id) then
    raise exception 'ikke tilgang til varsler' using errcode = '42501';
  end if;
  new.user_id := auth.uid()::text;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.alert_key := old.alert_key;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_alert_state() from public, anon, authenticated;

drop trigger if exists alert_states_guard on public.alert_states;
create trigger alert_states_guard
  before insert or update on public.alert_states
  for each row execute function public.guard_alert_state();

create or replace function public.guard_onboarding_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.worker_matches(new.worker_id) or not public.in_org(new.org_id) then
    raise exception 'ikke tilgang til sjekklisten' using errcode = '42501';
  end if;
  new.user_id := auth.uid()::text;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.worker_id := old.worker_id;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_onboarding_progress() from public, anon, authenticated;

drop trigger if exists onboarding_progress_guard on public.onboarding_progress;
create trigger onboarding_progress_guard
  before insert or update on public.onboarding_progress
  for each row execute function public.guard_onboarding_progress();

alter table public.alert_states enable row level security;
alter table public.onboarding_progress enable row level security;

create policy alert_states_select on public.alert_states
  for select to authenticated
  using (user_id = auth.uid()::text and public.can_see_manager_alerts(org_id));

create policy alert_states_insert on public.alert_states
  for insert to authenticated
  with check (user_id = auth.uid()::text and public.can_see_manager_alerts(org_id));

create policy alert_states_update on public.alert_states
  for update to authenticated
  using (user_id = auth.uid()::text and public.can_see_manager_alerts(org_id))
  with check (user_id = auth.uid()::text and public.can_see_manager_alerts(org_id));

create policy alert_states_delete on public.alert_states
  for delete to authenticated
  using (user_id = auth.uid()::text and public.can_see_manager_alerts(org_id));

create policy onboarding_progress_select on public.onboarding_progress
  for select to authenticated
  using (
    user_id = auth.uid()::text
    or public.is_super_admin()
    or public.can_manage_worker(worker_id)
  );

create policy onboarding_progress_insert on public.onboarding_progress
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and public.worker_matches(worker_id)
    and public.in_org(org_id)
  );

create policy onboarding_progress_update on public.onboarding_progress
  for update to authenticated
  using (
    user_id = auth.uid()::text
    and public.worker_matches(worker_id)
    and public.in_org(org_id)
  )
  with check (
    user_id = auth.uid()::text
    and public.worker_matches(worker_id)
    and public.in_org(org_id)
  );

grant select, insert, update, delete on public.alert_states to authenticated;
grant select, insert, update on public.onboarding_progress to authenticated;

-- Employee writes only their own phone and address. Wage, role and teams stay.
create or replace function public.save_own_contact(p_phone text, p_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_phone is null or btrim(p_phone) = '' or char_length(btrim(p_phone)) > 40 then
    raise exception 'telefonnummer mangler' using errcode = '22023';
  end if;
  if p_address is null or btrim(p_address) = '' or char_length(btrim(p_address)) > 200 then
    raise exception 'adresse mangler' using errcode = '22023';
  end if;

  update public.workers
     set phone = btrim(p_phone),
         address = btrim(p_address),
         updated_date = now()
   where id in (select public.my_worker_ids());

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'fant ikke ansattkortet' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.save_own_contact(text, text) from public, anon;
grant execute on function public.save_own_contact(text, text) to authenticated;

-- Booleans only. No phone, address, wage or contract text leaves this function.
create or replace function public.onboarding_overview(p_org_id text)
returns table (
  worker_id text,
  has_phone boolean,
  has_address boolean,
  pending_contracts integer,
  has_availability boolean,
  notifications_done boolean,
  dismissed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    nullif(btrim(w.phone), '') is not null,
    nullif(btrim(w.address), '') is not null,
    (
      select count(*)::integer
      from public.contracts c
      where c.worker_id = w.id
        and c.org_id = w.org_id
        and c.status in ('sendt', 'apnet')
    ),
    exists (
      select 1 from public.availability a
      where a.worker_id = w.id and a.org_id = w.org_id
    ),
    exists (
      select 1 from public.onboarding_progress p
      where p.worker_id = w.id and p.notifications_done_at is not null
    ),
    exists (
      select 1 from public.onboarding_progress p
      where p.worker_id = w.id and p.dismissed_at is not null
    )
  from public.workers w
  where w.org_id = p_org_id
    and w.status = 'active'
    and (
      public.is_super_admin()
      or (
        public.in_org(p_org_id)
        and public.effective_role() in ('admin', 'sub_admin', 'butikksjef')
        and public.can_manage_worker(w.id)
      )
    );
$$;

revoke all on function public.onboarding_overview(text) from public, anon;
grant execute on function public.onboarding_overview(text) to authenticated;
