-- Role helpers, audit triggers, and row level security.
--
-- Roles used by the app:
--   super-admin  profiles.role = 'admin' AND not linked to any organization
--                (not admin_user_id, and admin_email does not match)
--   admin        organization admin (role admin, linked to one org)
--   sub_admin    manager
--   butikksjef   store manager
--   user         worker
--
-- Managers (admin, sub_admin, butikksjef) write operational data in their org.
-- Workers read their organization and write their own stamps, availability,
-- tasks, settlements, and shift-swap responses.
-- Super-admins read and write every organization. Impersonation is a client
-- filter (localStorage); the database still treats them as super-admins.

-- ---------------------------------------------------------------------------
-- Identity helpers. SECURITY DEFINER so policies can read membership tables
-- without recursive RLS. search_path is pinned.
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()::text
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()::text
      and p.role = 'admin'
      and not exists (
        select 1
        from public.organizations o
        where o.admin_user_id = p.id
           or (
             o.admin_email is not null
             and btrim(o.admin_email) <> ''
             and lower(o.admin_email) = lower(coalesce(p.email, ''))
           )
      )
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'sub_admin', 'butikksjef');
$$;

create or replace function public.user_org_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.organizations o
  join public.profiles p on p.id = auth.uid()::text
  where o.admin_user_id = p.id
     or (
       o.admin_email is not null
       and btrim(o.admin_email) <> ''
       and lower(o.admin_email) = lower(coalesce(p.email, ''))
     )
  union
  select w.org_id
  from public.workers w
  join public.profiles p on p.id = auth.uid()::text
  where w.org_id is not null
    and btrim(w.org_id) <> ''
    and w.email is not null
    and btrim(w.email) <> ''
    and lower(w.email) = lower(coalesce(p.email, ''))
$$;

create or replace function public.in_org(org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or (
        org is not null
        and btrim(org) <> ''
        and exists (
          select 1
          from public.user_org_ids() ids
          where ids.user_org_ids = org
        )
      );
$$;

create or replace function public.my_worker_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select w.id
  from public.workers w
  join public.profiles p on p.id = auth.uid()::text
  where w.email is not null
    and btrim(w.email) <> ''
    and lower(w.email) = lower(coalesce(p.email, ''))
$$;

create or replace function public.worker_matches(worker text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select worker is not null
     and exists (
       select 1
       from public.my_worker_ids() ids
       where ids.my_worker_ids = worker
     );
$$;

create or replace function public.can_see_monthly_result(target_org text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or (public.is_manager() and public.in_org(target_org))
      or exists (
        select 1
        from public.workers w
        where w.id in (select public.my_worker_ids())
          and w.can_see_resultat is true
          and w.org_id = target_org
      );
$$;

-- ---------------------------------------------------------------------------
-- Audit columns and org_id backfill.
-- BEFORE INSERT fills id / created_by / timestamps and, when the caller
-- belongs to exactly one organization, copies that org onto rows the UI
-- creates without org_id (stamps, availability, holidays, swaps).
-- ---------------------------------------------------------------------------

create or replace function public.prepare_entity_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved text;
  org_count integer;
begin
  if tg_op = 'INSERT' then
    if new.id is null or btrim(new.id) = '' then
      new.id := gen_random_uuid()::text;
    end if;
    if new.created_date is null then
      new.created_date := now();
    end if;
    -- Logged-in users cannot spoof created_by. Service-role imports
    -- (auth.uid() is null) keep the value from the payload.
    if auth.uid() is not null then
      new.created_by := auth.uid()::text;
    elsif new.created_by is null or btrim(new.created_by) = '' then
      new.created_by := null;
    end if;
    if new.updated_date is null then
      new.updated_date := new.created_date;
    end if;
  else
    new.id := old.id;
    new.created_date := old.created_date;
    new.created_by := old.created_by;
    new.updated_date := now();
  end if;

  if tg_table_name not in ('profiles', 'organizations') then
    if new.org_id is null or btrim(new.org_id) = '' then
      resolved := null;

      if tg_table_name in ('shifts', 'stamps', 'availability', 'contracts') then
        if new.worker_id is not null
           and btrim(new.worker_id) <> ''
           and new.worker_id <> 'ledig' then
          select w.org_id into resolved
          from public.workers w
          where w.id = new.worker_id;
        end if;
      elsif tg_table_name = 'shift_swaps' then
        if new.requester_worker_id is not null and btrim(new.requester_worker_id) <> '' then
          select w.org_id into resolved
          from public.workers w
          where w.id = new.requester_worker_id;
        end if;
      end if;

      if (resolved is null or btrim(resolved) = '')
         and auth.uid() is not null
         and not public.is_super_admin() then
        select count(*) into org_count from public.user_org_ids();
        if org_count = 1 then
          select ids.user_org_ids into resolved
          from public.user_org_ids() ids
          limit 1;
        end if;
      end if;

      if resolved is not null and btrim(resolved) <> '' then
        new.org_id := resolved;
      else
        new.org_id := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_prepare
  before insert or update on public.profiles
  for each row execute function public.prepare_entity_row();

create trigger organizations_prepare
  before insert or update on public.organizations
  for each row execute function public.prepare_entity_row();

create trigger workers_prepare
  before insert or update on public.workers
  for each row execute function public.prepare_entity_row();

create trigger shifts_prepare
  before insert or update on public.shifts
  for each row execute function public.prepare_entity_row();

create trigger workplace_settings_prepare
  before insert or update on public.workplace_settings
  for each row execute function public.prepare_entity_row();

create trigger contracts_prepare
  before insert or update on public.contracts
  for each row execute function public.prepare_entity_row();

create trigger tasks_prepare
  before insert or update on public.tasks
  for each row execute function public.prepare_entity_row();

create trigger recurring_tasks_prepare
  before insert or update on public.recurring_tasks
  for each row execute function public.prepare_entity_row();

create trigger holidays_prepare
  before insert or update on public.holidays
  for each row execute function public.prepare_entity_row();

create trigger stamps_prepare
  before insert or update on public.stamps
  for each row execute function public.prepare_entity_row();

create trigger availability_prepare
  before insert or update on public.availability
  for each row execute function public.prepare_entity_row();

create trigger shift_swaps_prepare
  before insert or update on public.shift_swaps
  for each row execute function public.prepare_entity_row();

create trigger dagsoppgjor_prepare
  before insert or update on public.dagsoppgjor
  for each row execute function public.prepare_entity_row();

create trigger loddtelling_prepare
  before insert or update on public.loddtelling
  for each row execute function public.prepare_entity_row();

create trigger monthly_results_prepare
  before insert or update on public.monthly_results
  for each row execute function public.prepare_entity_row();

create trigger staffing_budgets_prepare
  before insert or update on public.staffing_budgets
  for each row execute function public.prepare_entity_row();

-- Block role changes except by a super-admin or a manager acting on someone
-- else in their own organization.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  if public.is_manager()
     and old.id is distinct from auth.uid()::text
     and (
       exists (
         select 1
         from public.workers w
         where w.email is not null
           and lower(w.email) = lower(coalesce(new.email, ''))
           and w.org_id in (select public.user_org_ids())
       )
       or exists (
         select 1
         from public.organizations o
         where o.id in (select public.user_org_ids())
           and (
             o.admin_user_id = new.id
             or (
               o.admin_email is not null
               and lower(o.admin_email) = lower(coalesce(new.email, ''))
             )
           )
       )
     ) then
    return new;
  end if;

  raise exception 'role change not permitted' using errcode = '42501';
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Auth sync. New Supabase users become profiles. Invite metadata.role is kept
-- when it is one of the app roles.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'user');
begin
  if requested not in ('admin', 'sub_admin', 'butikksjef', 'user') then
    requested := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role, created_by)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    requested,
    new.id::text
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set email = new.email,
        full_name = coalesce(
          nullif(new.raw_user_meta_data->>'full_name', ''),
          nullif(new.raw_user_meta_data->>'name', ''),
          full_name
        )
    where id = new.id::text;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_auth_user_updated();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.workers enable row level security;
alter table public.shifts enable row level security;
alter table public.workplace_settings enable row level security;
alter table public.contracts enable row level security;
alter table public.tasks enable row level security;
alter table public.recurring_tasks enable row level security;
alter table public.holidays enable row level security;
alter table public.stamps enable row level security;
alter table public.availability enable row level security;
alter table public.shift_swaps enable row level security;
alter table public.dagsoppgjor enable row level security;
alter table public.loddtelling enable row level security;
alter table public.monthly_results enable row level security;
alter table public.staffing_budgets enable row level security;

-- Profiles: see yourself, your org, or everyone when super-admin.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()::text
    or public.is_super_admin()
    or lower(coalesce(email, '')) in (
      select lower(w.email)
      from public.workers w
      where w.email is not null
        and w.org_id in (select public.user_org_ids())
    )
    or id in (
      select o.admin_user_id
      from public.organizations o
      where o.admin_user_id is not null
        and o.id in (select public.user_org_ids())
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()::text
    or public.is_super_admin()
    or (
      public.is_manager()
      and (
        lower(coalesce(email, '')) in (
          select lower(w.email)
          from public.workers w
          where w.email is not null
            and w.org_id in (select public.user_org_ids())
        )
        or id in (
          select o.admin_user_id
          from public.organizations o
          where o.admin_user_id is not null
            and o.id in (select public.user_org_ids())
        )
      )
    )
  )
  with check (
    id = auth.uid()::text
    or public.is_super_admin()
    or (
      public.is_manager()
      and (
        lower(coalesce(email, '')) in (
          select lower(w.email)
          from public.workers w
          where w.email is not null
            and w.org_id in (select public.user_org_ids())
        )
        or id in (
          select o.admin_user_id
          from public.organizations o
          where o.admin_user_id is not null
            and o.id in (select public.user_org_ids())
        )
      )
    )
  );

-- Organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_super_admin() or public.in_org(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() = 'admin'
      and admin_user_id = auth.uid()::text
    )
  );

create policy organizations_update on public.organizations
  for update to authenticated
  using (
    public.is_super_admin()
    or admin_user_id = auth.uid()::text
    or (
      public.current_app_role() = 'admin'
      and admin_email is not null
      and lower(admin_email) = lower(coalesce((
        select p.email from public.profiles p where p.id = auth.uid()::text
      ), ''))
    )
  )
  with check (
    public.is_super_admin()
    or admin_user_id = auth.uid()::text
    or public.in_org(id)
  );

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.is_super_admin());

-- Workers: org members read; managers write. A worker can always read their row.
create policy workers_select on public.workers
  for select to authenticated
  using (
    public.is_super_admin()
    or public.in_org(org_id)
    or id in (select public.my_worker_ids())
  );

create policy workers_insert on public.workers
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy workers_update on public.workers
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy workers_delete on public.workers
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Shifts: org read, manager write. Swap approval updates shifts from the manager UI.
create policy shifts_select on public.shifts
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy shifts_insert on public.shifts
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy shifts_update on public.shifts
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy shifts_delete on public.shifts
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Workplace settings: workers need the geofence; managers edit.
create policy workplace_settings_select on public.workplace_settings
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy workplace_settings_insert on public.workplace_settings
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy workplace_settings_update on public.workplace_settings
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy workplace_settings_delete on public.workplace_settings
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Contracts: workers read their own. Status changes from workers go through
-- the update-contract-status edge function (service role) after an auth check.
create policy contracts_select on public.contracts
  for select to authenticated
  using (
    public.is_super_admin()
    or (public.is_manager() and public.in_org(org_id))
    or public.worker_matches(worker_id)
    or created_by = auth.uid()::text
  );

create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy contracts_update on public.contracts
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy contracts_delete on public.contracts
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Tasks: any org member can create and complete; managers and authors delete.
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_super_admin() or public.in_org(org_id));

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text)
  with check (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  );

-- Recurring tasks are a manager tool.
create policy recurring_tasks_select on public.recurring_tasks
  for select to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy recurring_tasks_insert on public.recurring_tasks
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy recurring_tasks_update on public.recurring_tasks
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy recurring_tasks_delete on public.recurring_tasks
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Holidays: everyone in the org reads (pay calc); managers write.
create policy holidays_select on public.holidays
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy holidays_insert on public.holidays
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy holidays_update on public.holidays
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy holidays_delete on public.holidays
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Stamps: the worker who owns the row, plus managers.
create policy stamps_select on public.stamps
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  );

create policy stamps_insert on public.stamps
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or (public.is_manager() and public.in_org(org_id))
  );

create policy stamps_update on public.stamps
  for update to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  )
  with check (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or (public.is_manager() and public.in_org(org_id))
  );

create policy stamps_delete on public.stamps
  for delete to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or (public.is_manager() and public.in_org(org_id))
  );

-- Availability: workers edit their own days; managers read the timesheet.
create policy availability_all on public.availability
  for all to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  )
  with check (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or (public.is_manager() and public.in_org(org_id))
  );

-- Shift swaps: org members can request and accept. Managers can decide.
create policy shift_swaps_select on public.shift_swaps
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy shift_swaps_insert on public.shift_swaps
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.worker_matches(requester_worker_id)
        or public.is_manager()
      )
    )
  );

create policy shift_swaps_update on public.shift_swaps
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.is_manager() and public.in_org(org_id))
    or created_by = auth.uid()::text
    or public.worker_matches(requester_worker_id)
    or public.worker_matches(target_worker_id)
    or (
      public.in_org(org_id)
      and (target_worker_id is null or btrim(target_worker_id) = '')
    )
  )
  with check (
    public.is_super_admin()
    or public.in_org(org_id)
  );

create policy shift_swaps_delete on public.shift_swaps
  for delete to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or public.worker_matches(requester_worker_id)
    or (public.is_manager() and public.in_org(org_id))
  );

-- Dagsoppgjør: author or manager.
create policy dagsoppgjor_select on public.dagsoppgjor
  for select to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  );

create policy dagsoppgjor_insert on public.dagsoppgjor
  for insert to authenticated
  with check (public.is_super_admin() or public.in_org(org_id));

create policy dagsoppgjor_update on public.dagsoppgjor
  for update to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  )
  with check (
    public.is_super_admin()
    or public.in_org(org_id)
  );

create policy dagsoppgjor_delete on public.dagsoppgjor
  for delete to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  );

-- Loddtelling: org members read and update counts; delete is manager or author.
create policy loddtelling_select on public.loddtelling
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy loddtelling_insert on public.loddtelling
  for insert to authenticated
  with check (public.is_super_admin() or public.in_org(org_id));

create policy loddtelling_update on public.loddtelling
  for update to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text)
  with check (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy loddtelling_delete on public.loddtelling
  for delete to authenticated
  using (
    public.is_super_admin()
    or created_by = auth.uid()::text
    or (public.is_manager() and public.in_org(org_id))
  );

-- Monthly results: managers, plus workers flagged can_see_resultat.
create policy monthly_results_select on public.monthly_results
  for select to authenticated
  using (public.can_see_monthly_result(org_id));

create policy monthly_results_insert on public.monthly_results
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy monthly_results_update on public.monthly_results
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy monthly_results_delete on public.monthly_results
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- Staffing budgets: org can read the plan; managers edit.
create policy staffing_budgets_select on public.staffing_budgets
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id) or created_by = auth.uid()::text);

create policy staffing_budgets_insert on public.staffing_budgets
  for insert to authenticated
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy staffing_budgets_update on public.staffing_budgets
  for update to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)))
  with check (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

create policy staffing_budgets_delete on public.staffing_budgets
  for delete to authenticated
  using (public.is_super_admin() or (public.is_manager() and public.in_org(org_id)));

-- ---------------------------------------------------------------------------
-- Grants. anon has no table access. authenticated is constrained by RLS.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.workers to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select, insert, update, delete on public.workplace_settings to authenticated;
grant select, insert, update, delete on public.contracts to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.recurring_tasks to authenticated;
grant select, insert, update, delete on public.holidays to authenticated;
grant select, insert, update, delete on public.stamps to authenticated;
grant select, insert, update, delete on public.availability to authenticated;
grant select, insert, update, delete on public.shift_swaps to authenticated;
grant select, insert, update, delete on public.dagsoppgjor to authenticated;
grant select, insert, update, delete on public.loddtelling to authenticated;
grant select, insert, update, delete on public.monthly_results to authenticated;
grant select, insert, update, delete on public.staffing_budgets to authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.user_org_ids() to authenticated;
grant execute on function public.in_org(text) to authenticated;
grant execute on function public.my_worker_ids() to authenticated;
grant execute on function public.worker_matches(text) to authenticated;
grant execute on function public.can_see_monthly_result(text) to authenticated;
