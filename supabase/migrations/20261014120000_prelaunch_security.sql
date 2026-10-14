-- Pre-launch security, GPS minimization, billing columns, and push outbox.
--
-- NOT APPLIED to the live database by this change. Review it, then run it
-- in the Supabase SQL editor or via the migration pipeline when ready.
--
-- Role changes, permissions, and (together with the wage guards) hourly rate
-- can be changed only by a super-admin, organization admin, or department
-- admin (sub_admin). A butikksjef cannot promote anyone, including themselves.
-- A butikksjef writes operational data only for teams on their own worker row.
-- Employees cannot edit or delete a clock-in after it is stored. The first
-- stamp-out is still allowed. Other changes go through stamp_corrections.
-- Submitted dagsoppgjør and loddtelling are locked. Only admin / sub_admin /
-- super-admin can edit them, and those edits are written to settlement_audit.
-- Rows are not visible across customer organizations.

-- ---------------------------------------------------------------------------
-- Effective role. Platform admin is never downgraded. Otherwise the highest
-- workers.role / team_roles value wins, matching the app.
-- ---------------------------------------------------------------------------

create or replace function public.role_rank(role text)
returns integer
language sql
immutable
as $$
  select case role
    when 'admin' then 4
    when 'sub_admin' then 3
    when 'butikksjef' then 2
    else 1
  end;
$$;

create or replace function public.effective_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  platform text;
  best text;
  worker_role text;
  team_role text;
  worker_rec record;
begin
  if public.is_super_admin() then
    return 'admin';
  end if;

  platform := public.current_app_role();
  if platform = 'admin' then
    return 'admin';
  end if;

  best := coalesce(platform, 'user');

  for worker_rec in
    select w.role, w.team_roles
    from public.workers w
    join public.profiles p on p.id = auth.uid()::text
    where w.email is not null
      and btrim(w.email) <> ''
      and lower(w.email) = lower(coalesce(p.email, ''))
  loop
    worker_role := worker_rec.role;
    if public.role_rank(worker_role) > public.role_rank(best) then
      best := worker_role;
    end if;
    for team_role in
      select value
      from jsonb_each_text(coalesce(worker_rec.team_roles, '{}'::jsonb))
    loop
      if public.role_rank(team_role) > public.role_rank(best) then
        best := team_role;
      end if;
    end loop;
  end loop;

  return best;
end;
$$;

create or replace function public.my_team_keys()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(distinct team_key)
      from (
        select unnest(coalesce(w.teams, array['team1']::text[])) as team_key
        from public.workers w
        join public.profiles p on p.id = auth.uid()::text
        where w.email is not null
          and btrim(w.email) <> ''
          and lower(w.email) = lower(coalesce(p.email, ''))
      ) teams
    ),
    '{}'::text[]
  );
$$;

create or replace function public.can_assign_roles()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or public.effective_role() in ('admin', 'sub_admin');
$$;

create or replace function public.can_manage_team(target_org text, target_team text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or (
        public.in_org(target_org)
        and (
          public.effective_role() in ('admin', 'sub_admin')
          or (
            public.effective_role() = 'butikksjef'
            and target_team is not null
            and btrim(target_team) <> ''
            and target_team = any (public.my_team_keys())
          )
        )
      );
$$;

create or replace function public.can_manage_worker(target_worker text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers w
    where w.id = target_worker
      and (
        public.is_super_admin()
        or (
          public.in_org(w.org_id)
          and public.effective_role() in ('admin', 'sub_admin')
        )
        or (
          public.in_org(w.org_id)
          and public.effective_role() = 'butikksjef'
          and coalesce(w.teams, array['team1']::text[]) && public.my_team_keys()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile and worker privilege guards.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;

  if coalesce(current_setting('skiftpro.allow_role_change', true), '') = '1' then
    return new;
  end if;

  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.id = auth.uid()::text then
    raise exception 'role change not permitted' using errcode = '42501';
  end if;

  if public.effective_role() = 'sub_admin' and new.role = 'admin' then
    raise exception 'role change not permitted' using errcode = '42501';
  end if;

  if public.can_assign_roles()
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

create or replace function public.guard_worker_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  self_edit boolean;
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  self_edit := public.worker_matches(coalesce(new.id, old.id));

  if tg_op = 'INSERT' then
    if public.can_assign_roles() and not self_edit then
      if public.effective_role() = 'sub_admin' and new.role = 'admin' then
        raise exception 'role change not permitted' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.role is distinct from 'user'
       or coalesce(new.team_roles, '{}'::jsonb) <> '{}'::jsonb
       or coalesce(new.can_see_resultat, false) then
      raise exception 'role change not permitted' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is not distinct from old.role
     and coalesce(new.team_roles, '{}'::jsonb) is not distinct from coalesce(old.team_roles, '{}'::jsonb)
     and coalesce(new.can_see_resultat, false) is not distinct from coalesce(old.can_see_resultat, false)
     and new.hourly_rate is not distinct from old.hourly_rate then
    return new;
  end if;

  if self_edit or not public.can_assign_roles() then
    raise exception 'role change not permitted' using errcode = '42501';
  end if;

  if public.effective_role() = 'sub_admin' and new.role = 'admin' then
    raise exception 'role change not permitted' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists workers_privilege_guard on public.workers;
create trigger workers_privilege_guard
  before insert or update on public.workers
  for each row execute function public.guard_worker_privileges();

-- Butikksjef may update GPS and name for their own teams only.
create or replace function public.guard_workplace_team_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scoped public.workplace_settings;
  keys text[];
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if auth.uid() is null
     or public.is_super_admin()
     or public.effective_role() in ('admin', 'sub_admin') then
    return new;
  end if;
  if public.effective_role() <> 'butikksjef' or not public.in_org(old.org_id) then
    raise exception 'workplace change not permitted' using errcode = '42501';
  end if;

  scoped := old;
  keys := public.my_team_keys();
  if 'team1' = any (keys) then
    scoped.team1_name := new.team1_name;
    scoped.team1_latitude := new.team1_latitude;
    scoped.team1_longitude := new.team1_longitude;
    scoped.team1_radius_meters := new.team1_radius_meters;
  end if;
  if 'team2' = any (keys) then
    scoped.team2_name := new.team2_name;
    scoped.team2_latitude := new.team2_latitude;
    scoped.team2_longitude := new.team2_longitude;
    scoped.team2_radius_meters := new.team2_radius_meters;
  end if;
  if 'team3' = any (keys) then
    scoped.team3_name := new.team3_name;
    scoped.team3_latitude := new.team3_latitude;
    scoped.team3_longitude := new.team3_longitude;
    scoped.team3_radius_meters := new.team3_radius_meters;
  end if;
  if 'team4' = any (keys) then
    scoped.team4_name := new.team4_name;
    scoped.team4_latitude := new.team4_latitude;
    scoped.team4_longitude := new.team4_longitude;
    scoped.team4_radius_meters := new.team4_radius_meters;
  end if;
  if 'team5' = any (keys) then
    scoped.team5_name := new.team5_name;
    scoped.team5_latitude := new.team5_latitude;
    scoped.team5_longitude := new.team5_longitude;
    scoped.team5_radius_meters := new.team5_radius_meters;
  end if;
  if 'team6' = any (keys) then
    scoped.team6_name := new.team6_name;
    scoped.team6_latitude := new.team6_latitude;
    scoped.team6_longitude := new.team6_longitude;
    scoped.team6_radius_meters := new.team6_radius_meters;
  end if;
  if 'team7' = any (keys) then
    scoped.team7_name := new.team7_name;
    scoped.team7_latitude := new.team7_latitude;
    scoped.team7_longitude := new.team7_longitude;
    scoped.team7_radius_meters := new.team7_radius_meters;
  end if;
  if 'team8' = any (keys) then
    scoped.team8_name := new.team8_name;
    scoped.team8_latitude := new.team8_latitude;
    scoped.team8_longitude := new.team8_longitude;
    scoped.team8_radius_meters := new.team8_radius_meters;
  end if;
  if 'team9' = any (keys) then
    scoped.team9_name := new.team9_name;
    scoped.team9_latitude := new.team9_latitude;
    scoped.team9_longitude := new.team9_longitude;
    scoped.team9_radius_meters := new.team9_radius_meters;
  end if;
  if 'team10' = any (keys) then
    scoped.team10_name := new.team10_name;
    scoped.team10_latitude := new.team10_latitude;
    scoped.team10_longitude := new.team10_longitude;
    scoped.team10_radius_meters := new.team10_radius_meters;
  end if;
  return scoped;
end;
$$;

drop trigger if exists workplace_settings_team_scope on public.workplace_settings;
create trigger workplace_settings_team_scope
  before update on public.workplace_settings
  for each row execute function public.guard_workplace_team_scope();

-- ---------------------------------------------------------------------------
-- Consent and billing columns. Stripe ids are written by the webhook
-- (service role). The app starts a local 30-day trial at signup.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists store_quantity integer;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'user');
  self_serve boolean := coalesce(new.raw_user_meta_data->>'signup', '') = 'self_serve';
  terms boolean := coalesce(new.raw_user_meta_data->>'terms_accepted', '') in ('true', '1');
begin
  -- Self-serve stays a normal user until start_organization() links an org
  -- and promotes them. An unlinked admin would otherwise look like super-admin.
  if self_serve then
    requested := 'user';
  elsif requested not in ('admin', 'sub_admin', 'butikksjef', 'user') then
    requested := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role, created_by, terms_accepted_at)
  values (
    new.id::text,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    requested,
    new.id::text,
    case when terms then now() else null end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team column and lock flags for settlements.
-- ---------------------------------------------------------------------------

alter table public.dagsoppgjor
  add column if not exists team text,
  add column if not exists locked boolean not null default false,
  add column if not exists submitted_at timestamptz;

alter table public.loddtelling
  add column if not exists team text,
  add column if not exists status text not null default 'utkast',
  add column if not exists locked boolean not null default false,
  add column if not exists submitted_at timestamptz;

alter table public.loddtelling drop constraint if exists loddtelling_status_check;
alter table public.loddtelling
  add constraint loddtelling_status_check check (status in ('utkast', 'innsendt'));

update public.dagsoppgjor
set team = butikk
where team is null
  and butikk ~ '^team([1-9]|10)$';

update public.loddtelling
set team = butikk
where team is null
  and butikk ~ '^team([1-9]|10)$';

update public.dagsoppgjor
set locked = true,
    submitted_at = coalesce(submitted_at, updated_date, now())
where status is distinct from 'Registrert'
  and locked is not true;

create table if not exists public.settlement_audit (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  entity text not null,
  entity_id text not null,
  action text not null,
  actor text,
  before jsonb,
  after jsonb,
  created_date timestamptz not null default now()
);

create index if not exists settlement_audit_entity_idx
  on public.settlement_audit (entity, entity_id, created_date);

create or replace function public.guard_dagsoppgjor_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_locked boolean;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'Registrert' or coalesce(new.locked, false) then
      new.locked := true;
      new.submitted_at := coalesce(new.submitted_at, now());
    end if;
    return new;
  end if;

  was_locked := coalesce(old.locked, false) or old.status is distinct from 'Registrert';

  if was_locked and auth.uid() is not null and not public.can_assign_roles() then
    raise exception 'Innsendt dagsoppgjør er låst' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if was_locked and auth.uid() is not null then
      insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before)
      values (old.org_id, 'dagsoppgjor', old.id, 'admin_delete', auth.uid()::text, to_jsonb(old));
    end if;
    return old;
  end if;

  if not was_locked and (new.status is distinct from 'Registrert' or coalesce(new.locked, false)) then
    new.locked := true;
    new.submitted_at := coalesce(new.submitted_at, now());
    insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before, after)
    values (new.org_id, 'dagsoppgjor', new.id, 'submitted', auth.uid()::text, to_jsonb(old), to_jsonb(new));
  elsif was_locked and auth.uid() is not null then
    insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before, after)
    values (new.org_id, 'dagsoppgjor', new.id, 'admin_edit', auth.uid()::text, to_jsonb(old), to_jsonb(new));
  end if;

  return new;
end;
$$;

drop trigger if exists dagsoppgjor_lock_guard on public.dagsoppgjor;
create trigger dagsoppgjor_lock_guard
  before insert or update or delete on public.dagsoppgjor
  for each row execute function public.guard_dagsoppgjor_lock();

create or replace function public.guard_loddtelling_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_locked boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'innsendt' or coalesce(new.locked, false) then
      new.locked := true;
      new.status := 'innsendt';
      new.submitted_at := coalesce(new.submitted_at, now());
    else
      new.status := coalesce(new.status, 'utkast');
    end if;
    return new;
  end if;

  was_locked := coalesce(old.locked, false) or old.status = 'innsendt';

  if was_locked and auth.uid() is not null and not public.can_assign_roles() then
    raise exception 'Innsendt loddtelling er låst' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if was_locked and auth.uid() is not null then
      insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before)
      values (old.org_id, 'loddtelling', old.id, 'admin_delete', auth.uid()::text, to_jsonb(old));
    end if;
    return old;
  end if;

  if not was_locked and (new.status = 'innsendt' or coalesce(new.locked, false)) then
    new.locked := true;
    new.status := 'innsendt';
    new.submitted_at := coalesce(new.submitted_at, now());
    insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before, after)
    values (new.org_id, 'loddtelling', new.id, 'submitted', auth.uid()::text, to_jsonb(old), to_jsonb(new));
  elsif was_locked and auth.uid() is not null then
    insert into public.settlement_audit (org_id, entity, entity_id, action, actor, before, after)
    values (new.org_id, 'loddtelling', new.id, 'admin_edit', auth.uid()::text, to_jsonb(old), to_jsonb(new));
  end if;

  return new;
end;
$$;

drop trigger if exists loddtelling_lock_guard on public.loddtelling;
create trigger loddtelling_lock_guard
  before insert or update or delete on public.loddtelling
  for each row execute function public.guard_loddtelling_lock();

-- ---------------------------------------------------------------------------
-- Stamps: server geofence, coarse coordinates, no direct employee edits.
-- ---------------------------------------------------------------------------

create or replace function public.haversine_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else 6371000 * 2 * atan2(
      sqrt(
        pow(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
      ),
      sqrt(greatest(0, 1 - (
        pow(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
      )))
    )
  end;
$$;

create or replace function public.guard_stamp_geofence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  worker_org text;
  worker_team text;
  site_lat double precision;
  site_lng double precision;
  site_radius double precision;
  check_lat double precision;
  check_lng double precision;
  dist double precision;
  manager_edit boolean;
begin
  if new.stamp_in_lat is not null then
    new.stamp_in_lat := round(new.stamp_in_lat::numeric, 3)::double precision;
  end if;
  if new.stamp_in_lng is not null then
    new.stamp_in_lng := round(new.stamp_in_lng::numeric, 3)::double precision;
  end if;
  if new.stamp_out_lat is not null then
    new.stamp_out_lat := round(new.stamp_out_lat::numeric, 3)::double precision;
  end if;
  if new.stamp_out_lng is not null then
    new.stamp_out_lng := round(new.stamp_out_lng::numeric, 3)::double precision;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  manager_edit := public.can_manage_worker(new.worker_id)
    and not (public.worker_matches(new.worker_id) and not public.can_assign_roles());

  if manager_edit or public.can_assign_roles() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.stamp_in_lat is not distinct from old.stamp_in_lat
     and new.stamp_in_lng is not distinct from old.stamp_in_lng
     and new.stamp_out is null then
    return new;
  end if;

  if tg_op = 'INSERT' or old.stamp_in is null then
    check_lat := new.stamp_in_lat;
    check_lng := new.stamp_in_lng;
  elsif old.stamp_out is null and new.stamp_out is not null then
    check_lat := new.stamp_out_lat;
    check_lng := new.stamp_out_lng;
  else
    return new;
  end if;

  if check_lat is null or check_lng is null then
    raise exception 'Posisjon mangler for stempling' using errcode = '42501';
  end if;

  select w.org_id, coalesce(w.teams[1], 'team1')
    into worker_org, worker_team
  from public.workers w
  where w.id = new.worker_id;

  select
    coalesce(
      case worker_team
        when 'team1' then ws.team1_latitude
        when 'team2' then ws.team2_latitude
        when 'team3' then ws.team3_latitude
        when 'team4' then ws.team4_latitude
        when 'team5' then ws.team5_latitude
        when 'team6' then ws.team6_latitude
        when 'team7' then ws.team7_latitude
        when 'team8' then ws.team8_latitude
        when 'team9' then ws.team9_latitude
        when 'team10' then ws.team10_latitude
      end,
      ws.latitude
    ),
    coalesce(
      case worker_team
        when 'team1' then ws.team1_longitude
        when 'team2' then ws.team2_longitude
        when 'team3' then ws.team3_longitude
        when 'team4' then ws.team4_longitude
        when 'team5' then ws.team5_longitude
        when 'team6' then ws.team6_longitude
        when 'team7' then ws.team7_longitude
        when 'team8' then ws.team8_longitude
        when 'team9' then ws.team9_longitude
        when 'team10' then ws.team10_longitude
      end,
      ws.longitude
    ),
    coalesce(
      case worker_team
        when 'team1' then ws.team1_radius_meters
        when 'team2' then ws.team2_radius_meters
        when 'team3' then ws.team3_radius_meters
        when 'team4' then ws.team4_radius_meters
        when 'team5' then ws.team5_radius_meters
        when 'team6' then ws.team6_radius_meters
        when 'team7' then ws.team7_radius_meters
        when 'team8' then ws.team8_radius_meters
        when 'team9' then ws.team9_radius_meters
        when 'team10' then ws.team10_radius_meters
      end,
      ws.radius_meters,
      100
    )
    into site_lat, site_lng, site_radius
  from public.workplace_settings ws
  where ws.org_id = coalesce(new.org_id, worker_org)
  order by ws.created_date
  limit 1;

  if site_lat is null or site_lng is null then
    raise exception 'Arbeidsstedet mangler posisjon' using errcode = '42501';
  end if;

  dist := public.haversine_meters(check_lat, check_lng, site_lat, site_lng);
  new.distance_meters := round(dist);
  new.is_within_range := dist <= coalesce(site_radius, 100);
  if not new.is_within_range then
    raise exception 'Utenfor geofence' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.guard_stamp_worker_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if public.worker_matches(old.worker_id) and not public.can_assign_roles() then
      raise exception 'Stempling kan ikke slettes direkte' using errcode = '42501';
    end if;
    if public.can_manage_worker(old.worker_id) or public.can_assign_roles() or public.is_super_admin() then
      return old;
    end if;
    raise exception 'Stempling kan ikke slettes direkte' using errcode = '42501';
  end if;

  if public.worker_matches(new.worker_id) and not public.can_assign_roles() then
    if tg_op = 'INSERT' then
      return new;
    end if;
    if old.stamp_out is null
       and new.stamp_out is not null
       and new.stamp_in is not distinct from old.stamp_in
       and new.stamp_in_lat is not distinct from old.stamp_in_lat
       and new.stamp_in_lng is not distinct from old.stamp_in_lng
       and new.worker_id is not distinct from old.worker_id
       and new.date is not distinct from old.date
       and new.org_id is not distinct from old.org_id then
      return new;
    end if;
    raise exception 'Stempling kan ikke endres direkte. Send en korrigeringsforespørsel.' using errcode = '42501';
  end if;

  if public.is_super_admin()
     or public.can_manage_worker(new.worker_id)
     or (public.can_assign_roles() and public.in_org(new.org_id)) then
    return new;
  end if;

  raise exception 'Stempling kan ikke endres direkte' using errcode = '42501';
end;
$$;

drop trigger if exists stamps_q_geofence on public.stamps;
create trigger stamps_q_geofence
  before insert or update on public.stamps
  for each row execute function public.guard_stamp_geofence();

drop trigger if exists stamps_z_worker_edit on public.stamps;
create trigger stamps_z_worker_edit
  before insert or update or delete on public.stamps
  for each row execute function public.guard_stamp_worker_edit();

create or replace function public.purge_stamp_locations(retention interval default interval '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  update public.stamps
  set stamp_in_lat = null,
      stamp_in_lng = null,
      stamp_out_lat = null,
      stamp_out_lng = null
  where created_date < now() - retention
    and (
      stamp_in_lat is not null
      or stamp_in_lng is not null
      or stamp_out_lat is not null
      or stamp_out_lng is not null
    );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.purge_stamp_locations(interval) is
  'Nulls stamp coordinates older than 90 days. Keeps distance_meters and is_within_range.';

create table if not exists public.stamp_corrections (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  stamp_id text not null,
  worker_id text not null,
  stamp_in timestamptz,
  stamp_out timestamptz,
  reason text,
  status text not null default 'pending',
  decided_by text,
  decided_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint stamp_corrections_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists stamp_corrections_org_idx on public.stamp_corrections (org_id, status);

drop trigger if exists stamp_corrections_prepare on public.stamp_corrections;
create trigger stamp_corrections_prepare
  before insert or update on public.stamp_corrections
  for each row execute function public.prepare_entity_row();

create or replace function public.decide_stamp_correction(p_id text, p_approve boolean)
returns public.stamp_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.stamp_corrections;
begin
  select * into rec from public.stamp_corrections where id = p_id;
  if not found then
    raise exception 'Finner ikke forespørselen' using errcode = '42501';
  end if;
  if rec.status <> 'pending' then
    raise exception 'Forespørselen er allerede behandlet' using errcode = '42501';
  end if;
  if public.worker_matches(rec.worker_id) and not public.can_assign_roles() then
    raise exception 'Ikke tillatt' using errcode = '42501';
  end if;
  if not (
    public.is_super_admin()
    or public.can_manage_worker(rec.worker_id)
    or (public.can_assign_roles() and public.in_org(rec.org_id))
  ) then
    raise exception 'Ikke tillatt' using errcode = '42501';
  end if;

  if p_approve then
    update public.stamps
    set stamp_in = coalesce(rec.stamp_in, stamp_in),
        stamp_out = coalesce(rec.stamp_out, stamp_out)
    where id = rec.stamp_id;
    update public.stamp_corrections
    set status = 'approved',
        decided_by = auth.uid()::text,
        decided_at = now()
    where id = p_id
    returning * into rec;
  else
    update public.stamp_corrections
    set status = 'rejected',
        decided_by = auth.uid()::text,
        decided_at = now()
    where id = p_id
    returning * into rec;
  end if;

  return rec;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push subscriptions and notification outbox.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  user_id text not null,
  endpoint text not null,
  p256dh text,
  auth text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  unique (user_id, endpoint)
);

drop trigger if exists push_subscriptions_prepare on public.push_subscriptions;
create trigger push_subscriptions_prepare
  before insert or update on public.push_subscriptions
  for each row execute function public.prepare_entity_row();

create table if not exists public.notification_outbox (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  user_id text,
  kind text not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  created_date timestamptz not null default now()
);

create index if not exists notification_outbox_unsent_idx
  on public.notification_outbox (created_date)
  where sent_at is null;

create or replace function public.profile_id_for_worker(target_worker text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  join public.workers w on w.id = target_worker
  where p.email is not null
    and w.email is not null
    and lower(p.email) = lower(w.email)
  limit 1;
$$;

create or replace function public.enqueue_notification(
  target_user text,
  target_org text,
  target_kind text,
  target_title text,
  target_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user is null or btrim(target_user) = '' then
    return;
  end if;
  insert into public.notification_outbox (org_id, user_id, kind, title, body)
  values (target_org, target_user, target_kind, target_title, target_body);
end;
$$;

create or replace function public.notify_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  title text;
begin
  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.shift_label is not distinct from old.shift_label
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.shift_label = 'sick'
     and (tg_op = 'INSERT' or old.shift_label is distinct from 'sick') then
    kind := 'absence';
    title := 'Fravær registrert';
  elsif tg_op = 'INSERT' then
    kind := 'shift';
    title := 'Ny vakt';
  else
    kind := 'shift';
    title := 'Vakt endret';
  end if;

  perform public.enqueue_notification(
    public.profile_id_for_worker(new.worker_id),
    new.org_id,
    kind,
    title,
    new.date::text || ' ' || new.start_time || '–' || new.end_time
  );
  return new;
end;
$$;

drop trigger if exists shifts_notify on public.shifts;
create trigger shifts_notify
  after insert or update on public.shifts
  for each row execute function public.notify_shift_change();

create or replace function public.notify_swap_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('accepted', 'approved', 'rejected') then
    return new;
  end if;
  title := case new.status
    when 'accepted' then 'Vaktbytte godtatt'
    when 'approved' then 'Vaktbytte godkjent'
    else 'Vaktbytte avslått'
  end;
  perform public.enqueue_notification(
    public.profile_id_for_worker(new.requester_worker_id),
    new.org_id,
    'swap',
    title,
    coalesce(new.requester_shift_date::text, '')
  );
  perform public.enqueue_notification(
    public.profile_id_for_worker(new.target_worker_id),
    new.org_id,
    'swap',
    title,
    coalesce(new.target_shift_date::text, '')
  );
  return new;
end;
$$;

drop trigger if exists shift_swaps_notify on public.shift_swaps;
create trigger shift_swaps_notify
  after insert or update on public.shift_swaps
  for each row execute function public.notify_swap_change();

create or replace function public.enqueue_clock_in_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  shift_rec record;
  target_user text;
  minutes_until integer;
begin
  for shift_rec in
    select s.*
    from public.shifts s
    where s.date = current_date
      and s.status = 'scheduled'
      and s.worker_id <> 'ledig'
      and not exists (
        select 1
        from public.stamps st
        where st.worker_id = s.worker_id
          and st.date = s.date
          and st.stamp_in is not null
      )
  loop
    begin
      minutes_until :=
        (split_part(shift_rec.start_time, ':', 1)::integer * 60
         + split_part(shift_rec.start_time, ':', 2)::integer)
        - (extract(hour from now())::integer * 60 + extract(minute from now())::integer);
    exception when others then
      minutes_until := null;
    end;
    if minutes_until is null or minutes_until < 0 or minutes_until > 30 then
      continue;
    end if;
    target_user := public.profile_id_for_worker(shift_rec.worker_id);
    if target_user is null then
      continue;
    end if;
    if exists (
      select 1
      from public.notification_outbox n
      where n.user_id = target_user
        and n.kind = 'clock_in'
        and n.created_date::date = current_date
        and n.body like shift_rec.id || '%'
    ) then
      continue;
    end if;
    perform public.enqueue_notification(
      target_user,
      shift_rec.org_id,
      'clock_in',
      'Husk å stemple inn',
      shift_rec.id || ' starter ' || shift_rec.start_time
    );
    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;

-- Schedule retention and reminders when pg_cron exists. Do not fail the
-- migration if the extension is unavailable. Sending still needs the
-- dispatch-notifications edge function on a schedule.
do $$
declare
  existing bigint;
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron was not created (%). Schedule purge_stamp_locations and enqueue_clock_in_reminders manually.', sqlerrm;
    return;
  end;

  if exists (
    select 1
    from pg_namespace n
    join pg_class c on c.relnamespace = n.oid
    where n.nspname = 'cron' and c.relname = 'job'
  ) then
    select j.jobid into existing from cron.job j where j.jobname = 'purge-stamp-locations' limit 1;
    if existing is not null then
      perform cron.unschedule(existing);
    end if;
    perform cron.schedule(
      'purge-stamp-locations',
      '15 3 * * *',
      'select public.purge_stamp_locations()'
    );
    existing := null;
    select j.jobid into existing from cron.job j where j.jobname = 'clock-in-reminders' limit 1;
    if existing is not null then
      perform cron.unschedule(existing);
    end if;
    perform cron.schedule(
      'clock-in-reminders',
      '*/15 * * * *',
      'select public.enqueue_clock_in_reminders()'
    );
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped (%).', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies. Drop the previous org-wide manager writes and created_by leaks.
-- ---------------------------------------------------------------------------

alter table public.stamp_corrections enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.settlement_audit enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()::text
    or public.is_super_admin()
    or (
      public.can_assign_roles()
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
      public.can_assign_roles()
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

drop policy if exists workers_insert on public.workers;
drop policy if exists workers_update on public.workers;
drop policy if exists workers_delete on public.workers;
create policy workers_insert on public.workers
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin')
    )
    or (
      public.in_org(org_id)
      and public.effective_role() = 'butikksjef'
      and coalesce(teams, array['team1']::text[]) && public.my_team_keys()
    )
  );
create policy workers_update on public.workers
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin')
    )
    or (
      public.in_org(org_id)
      and public.effective_role() = 'butikksjef'
      and coalesce(teams, array['team1']::text[]) && public.my_team_keys()
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin')
    )
    or (
      public.in_org(org_id)
      and public.effective_role() = 'butikksjef'
      and coalesce(teams, array['team1']::text[]) && public.my_team_keys()
    )
  );
create policy workers_delete on public.workers
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin')
    )
    or (
      public.in_org(org_id)
      and public.effective_role() = 'butikksjef'
      and not public.worker_matches(id)
      and coalesce(teams, array['team1']::text[]) && public.my_team_keys()
    )
  );

drop policy if exists shifts_insert on public.shifts;
drop policy if exists shifts_update on public.shifts;
drop policy if exists shifts_delete on public.shifts;
create policy shifts_insert on public.shifts
  for insert to authenticated
  with check (public.can_manage_team(org_id, team));
create policy shifts_update on public.shifts
  for update to authenticated
  using (public.can_manage_team(org_id, team))
  with check (public.can_manage_team(org_id, team));
create policy shifts_delete on public.shifts
  for delete to authenticated
  using (public.can_manage_team(org_id, team));

drop policy if exists workplace_settings_insert on public.workplace_settings;
drop policy if exists workplace_settings_update on public.workplace_settings;
drop policy if exists workplace_settings_delete on public.workplace_settings;
create policy workplace_settings_insert on public.workplace_settings
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy workplace_settings_update on public.workplace_settings
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin', 'butikksjef')
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin', 'butikksjef')
    )
  );
create policy workplace_settings_delete on public.workplace_settings
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );

drop policy if exists contracts_select on public.contracts;
drop policy if exists contracts_insert on public.contracts;
drop policy if exists contracts_update on public.contracts;
drop policy if exists contracts_delete on public.contracts;
create policy contracts_select on public.contracts
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (
    public.is_super_admin()
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy contracts_update on public.contracts
  for update to authenticated
  using (
    public.is_super_admin()
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  )
  with check (
    public.is_super_admin()
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy contracts_delete on public.contracts
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or (public.can_manage_worker(worker_id) and not public.worker_matches(worker_id))
  );

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
    or public.in_org(org_id)
  );
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_super_admin() or public.in_org(org_id))
  with check (public.is_super_admin() or public.in_org(org_id));
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
  );

drop policy if exists recurring_tasks_select on public.recurring_tasks;
drop policy if exists recurring_tasks_insert on public.recurring_tasks;
drop policy if exists recurring_tasks_update on public.recurring_tasks;
drop policy if exists recurring_tasks_delete on public.recurring_tasks;
create policy recurring_tasks_select on public.recurring_tasks
  for select to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin', 'butikksjef'))
  );
create policy recurring_tasks_insert on public.recurring_tasks
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
  );
create policy recurring_tasks_update on public.recurring_tasks
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
  )
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
  );
create policy recurring_tasks_delete on public.recurring_tasks
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
  );

drop policy if exists holidays_insert on public.holidays;
drop policy if exists holidays_update on public.holidays;
drop policy if exists holidays_delete on public.holidays;
create policy holidays_insert on public.holidays
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy holidays_update on public.holidays
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  )
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy holidays_delete on public.holidays
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );

drop policy if exists stamps_select on public.stamps;
drop policy if exists stamps_insert on public.stamps;
drop policy if exists stamps_update on public.stamps;
drop policy if exists stamps_delete on public.stamps;
create policy stamps_select on public.stamps
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy stamps_insert on public.stamps
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  );
create policy stamps_update on public.stamps
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  )
  with check (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  );
create policy stamps_delete on public.stamps
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.can_manage_worker(worker_id)
      and not public.worker_matches(worker_id)
    )
    or (public.can_assign_roles() and public.in_org(org_id))
  );

drop policy if exists availability_all on public.availability;
create policy availability_select on public.availability
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or public.can_manage_worker(worker_id)
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );
create policy availability_insert on public.availability
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  );
create policy availability_update on public.availability
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  )
  with check (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  );
create policy availability_delete on public.availability
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.worker_matches(worker_id) and public.in_org(org_id))
    or public.can_manage_worker(worker_id)
  );

drop policy if exists shift_swaps_select on public.shift_swaps;
drop policy if exists shift_swaps_insert on public.shift_swaps;
drop policy if exists shift_swaps_update on public.shift_swaps;
drop policy if exists shift_swaps_delete on public.shift_swaps;
create policy shift_swaps_select on public.shift_swaps
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));
create policy shift_swaps_insert on public.shift_swaps
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.worker_matches(requester_worker_id)
        or public.can_manage_team(org_id, team)
      )
    )
  );
create policy shift_swaps_update on public.shift_swaps
  for update to authenticated
  using (
    public.is_super_admin()
    or public.in_org(org_id)
  )
  with check (
    public.is_super_admin()
    or public.in_org(org_id)
  );
create policy shift_swaps_delete on public.shift_swaps
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.worker_matches(requester_worker_id) and public.in_org(org_id))
    or public.can_manage_team(org_id, team)
  );

drop policy if exists dagsoppgjor_select on public.dagsoppgjor;
drop policy if exists dagsoppgjor_insert on public.dagsoppgjor;
drop policy if exists dagsoppgjor_update on public.dagsoppgjor;
drop policy if exists dagsoppgjor_delete on public.dagsoppgjor;
create policy dagsoppgjor_select on public.dagsoppgjor
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));
create policy dagsoppgjor_insert on public.dagsoppgjor
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  );
create policy dagsoppgjor_update on public.dagsoppgjor
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  );
create policy dagsoppgjor_delete on public.dagsoppgjor
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.can_assign_roles() and public.in_org(org_id))
    or (
      public.in_org(org_id)
      and not coalesce(locked, false)
      and status = 'Registrert'
      and coalesce(team, butikk) = any (public.my_team_keys())
    )
  );

drop policy if exists loddtelling_select on public.loddtelling;
drop policy if exists loddtelling_insert on public.loddtelling;
drop policy if exists loddtelling_update on public.loddtelling;
drop policy if exists loddtelling_delete on public.loddtelling;
create policy loddtelling_select on public.loddtelling
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));
create policy loddtelling_insert on public.loddtelling
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  );
create policy loddtelling_update on public.loddtelling
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or coalesce(team, butikk) = any (public.my_team_keys())
      )
    )
  );
create policy loddtelling_delete on public.loddtelling
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.can_assign_roles() and public.in_org(org_id))
    or (
      public.in_org(org_id)
      and not coalesce(locked, false)
      and status = 'utkast'
      and coalesce(team, butikk) = any (public.my_team_keys())
    )
  );

drop policy if exists monthly_results_insert on public.monthly_results;
drop policy if exists monthly_results_update on public.monthly_results;
drop policy if exists monthly_results_delete on public.monthly_results;
create policy monthly_results_insert on public.monthly_results
  for insert to authenticated
  with check (public.can_manage_team(org_id, case when team = 'all' then null else team end) or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin')));
create policy monthly_results_update on public.monthly_results
  for update to authenticated
  using (public.can_manage_team(org_id, case when team = 'all' then null else team end) or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin')))
  with check (public.can_manage_team(org_id, case when team = 'all' then null else team end) or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin')));
create policy monthly_results_delete on public.monthly_results
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
  );

drop policy if exists staffing_budgets_select on public.staffing_budgets;
drop policy if exists staffing_budgets_insert on public.staffing_budgets;
drop policy if exists staffing_budgets_update on public.staffing_budgets;
drop policy if exists staffing_budgets_delete on public.staffing_budgets;
create policy staffing_budgets_select on public.staffing_budgets
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));
create policy staffing_budgets_insert on public.staffing_budgets
  for insert to authenticated
  with check (public.can_manage_team(org_id, team));
create policy staffing_budgets_update on public.staffing_budgets
  for update to authenticated
  using (public.can_manage_team(org_id, team))
  with check (public.can_manage_team(org_id, team));
create policy staffing_budgets_delete on public.staffing_budgets
  for delete to authenticated
  using (public.can_manage_team(org_id, team));

create policy stamp_corrections_select on public.stamp_corrections
  for select to authenticated
  using (
    public.is_super_admin()
    or public.worker_matches(worker_id)
    or public.can_manage_worker(worker_id)
    or (public.can_assign_roles() and public.in_org(org_id))
  );
create policy stamp_corrections_insert on public.stamp_corrections
  for insert to authenticated
  with check (
    status = 'pending'
    and public.worker_matches(worker_id)
    and public.in_org(org_id)
  );

create policy push_subscriptions_all on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()::text or public.is_super_admin())
  with check (user_id = auth.uid()::text or public.is_super_admin());

create policy settlement_audit_select on public.settlement_audit
  for select to authenticated
  using (
    public.is_super_admin()
    or (public.can_assign_roles() and public.in_org(org_id))
  );

create policy notification_outbox_select on public.notification_outbox
  for select to authenticated
  using (user_id = auth.uid()::text or public.is_super_admin());

grant select, insert, update, delete on public.stamp_corrections to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.settlement_audit to authenticated;
grant select on public.notification_outbox to authenticated;

grant execute on function public.effective_role() to authenticated;
grant execute on function public.my_team_keys() to authenticated;
grant execute on function public.can_assign_roles() to authenticated;
grant execute on function public.can_manage_team(text, text) to authenticated;
grant execute on function public.can_manage_worker(text) to authenticated;
grant execute on function public.decide_stamp_correction(text, boolean) to authenticated;
grant execute on function public.purge_stamp_locations(interval) to service_role;
grant execute on function public.enqueue_clock_in_reminders() to service_role;

-- Self-serve signup creates the caller's organization and first store, then
-- promotes that profile to organization admin. The caller is a normal user
-- until this runs, so they are not treated as a platform super-admin.
create or replace function public.start_organization(
  p_name text,
  p_org_number text,
  p_phone text,
  p_store_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  created public.organizations;
  store_name text;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
  end if;

  select * into actor from public.profiles where id = auth.uid()::text;
  if actor.terms_accepted_at is null then
    raise exception 'Samtykke mangler' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_org_ids()) then
    raise exception 'Du tilhører allerede en organisasjon' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Organisasjonsnavn mangler' using errcode = '42501';
  end if;

  store_name := coalesce(nullif(btrim(p_store_name), ''), btrim(p_name));

  insert into public.organizations (
    name, org_number, contact_phone, contact_email, admin_user_id, admin_email,
    status, plan, trial_ends_at, store_quantity
  )
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_org_number, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    actor.email,
    actor.id,
    actor.email,
    'trial',
    'basic',
    now() + interval '30 days',
    1
  )
  returning * into created;

  perform set_config('skiftpro.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = actor.id;

  insert into public.workplace_settings (org_id, workplace_name, team1_name, active_teams_count)
  values (created.id, store_name, store_name, 1);

  return created;
end;
$$;

revoke all on function public.start_organization(text, text, text, text) from public;
grant execute on function public.start_organization(text, text, text, text) to authenticated;
