-- Round 1 payroll: break rules, night supplement, ferie, period locks, hour approval.
-- NOT APPLIED to the live database by this change. Run it in the Supabase SQL
-- editor or via the migration pipeline before the new screens are used.
--
-- New workplace_settings columns that are not wage amounts are granted to
-- authenticated and anon. Night supplement type and amount stay hidden, the
-- same way Sunday and holiday amounts do, and are read through the wage RPCs.
-- Automatic break and night supplement are off for every store until an
-- administrator turns them on. No store, including N.417, is seeded.
-- Existing shifts keep their stored break (break_manual defaults to true on
-- rows that already exist, and to false on rows inserted after this migration).

alter table public.shifts drop constraint if exists shifts_label_check;
alter table public.shifts add constraint shifts_label_check check (
  shift_label is null or shift_label in ('morning', 'evening', 'middle', 'sick', 'ferie', '')
);

alter table public.shifts
  add column if not exists all_day boolean not null default false,
  add column if not exists break_manual boolean not null default true,
  add column if not exists hours_approved boolean not null default false,
  add column if not exists hours_approved_at timestamptz,
  add column if not exists hours_approved_by text;

alter table public.shifts alter column break_manual set default false;

comment on column public.shifts.all_day is
  'Syk or ferie covering a full day without clock times. Hours are the workplace full-time day.';
comment on column public.shifts.break_manual is
  'When true, break_minutes is an override. When false, the team break rule decides the unpaid break.';
comment on column public.shifts.hours_approved is
  'Set by an administrator when the hours on this shift are approved for payroll.';

alter table public.workplace_settings
  add column if not exists team1_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team1_auto_break boolean not null default false,
  add column if not exists team1_night_from text not null default '21:00',
  add column if not exists team1_night_to text not null default '06:00',
  add column if not exists team1_night_enabled boolean not null default false,
  add column if not exists team1_night_extra_type text not null default 'none',
  add column if not exists team1_night_extra_amount double precision not null default 50,
  add column if not exists team2_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team2_auto_break boolean not null default false,
  add column if not exists team2_night_from text not null default '21:00',
  add column if not exists team2_night_to text not null default '06:00',
  add column if not exists team2_night_enabled boolean not null default false,
  add column if not exists team2_night_extra_type text not null default 'none',
  add column if not exists team2_night_extra_amount double precision not null default 50,
  add column if not exists team3_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team3_auto_break boolean not null default false,
  add column if not exists team3_night_from text not null default '21:00',
  add column if not exists team3_night_to text not null default '06:00',
  add column if not exists team3_night_enabled boolean not null default false,
  add column if not exists team3_night_extra_type text not null default 'none',
  add column if not exists team3_night_extra_amount double precision not null default 50,
  add column if not exists team4_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team4_auto_break boolean not null default false,
  add column if not exists team4_night_from text not null default '21:00',
  add column if not exists team4_night_to text not null default '06:00',
  add column if not exists team4_night_enabled boolean not null default false,
  add column if not exists team4_night_extra_type text not null default 'none',
  add column if not exists team4_night_extra_amount double precision not null default 50,
  add column if not exists team5_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team5_auto_break boolean not null default false,
  add column if not exists team5_night_from text not null default '21:00',
  add column if not exists team5_night_to text not null default '06:00',
  add column if not exists team5_night_enabled boolean not null default false,
  add column if not exists team5_night_extra_type text not null default 'none',
  add column if not exists team5_night_extra_amount double precision not null default 50,
  add column if not exists team6_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team6_auto_break boolean not null default false,
  add column if not exists team6_night_from text not null default '21:00',
  add column if not exists team6_night_to text not null default '06:00',
  add column if not exists team6_night_enabled boolean not null default false,
  add column if not exists team6_night_extra_type text not null default 'none',
  add column if not exists team6_night_extra_amount double precision not null default 50,
  add column if not exists team7_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team7_auto_break boolean not null default false,
  add column if not exists team7_night_from text not null default '21:00',
  add column if not exists team7_night_to text not null default '06:00',
  add column if not exists team7_night_enabled boolean not null default false,
  add column if not exists team7_night_extra_type text not null default 'none',
  add column if not exists team7_night_extra_amount double precision not null default 50,
  add column if not exists team8_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team8_auto_break boolean not null default false,
  add column if not exists team8_night_from text not null default '21:00',
  add column if not exists team8_night_to text not null default '06:00',
  add column if not exists team8_night_enabled boolean not null default false,
  add column if not exists team8_night_extra_type text not null default 'none',
  add column if not exists team8_night_extra_amount double precision not null default 50,
  add column if not exists team9_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team9_auto_break boolean not null default false,
  add column if not exists team9_night_from text not null default '21:00',
  add column if not exists team9_night_to text not null default '06:00',
  add column if not exists team9_night_enabled boolean not null default false,
  add column if not exists team9_night_extra_type text not null default 'none',
  add column if not exists team9_night_extra_amount double precision not null default 50,
  add column if not exists team10_break_rules jsonb not null default '[]'::jsonb,
  add column if not exists team10_auto_break boolean not null default false,
  add column if not exists team10_night_from text not null default '21:00',
  add column if not exists team10_night_to text not null default '06:00',
  add column if not exists team10_night_enabled boolean not null default false,
  add column if not exists team10_night_extra_type text not null default 'none',
  add column if not exists team10_night_extra_amount double precision not null default 50,
  add column if not exists payroll_export_columns jsonb;

comment on column public.workplace_settings.team1_break_rules is
  'JSON list of {after_minutes, break_minutes}. The unpaid break is the highest rule the gross shift length exceeds.';
comment on column public.workplace_settings.team1_night_from is
  'Local start of the night supplement window. Default 21:00. The window may cross midnight.';
comment on column public.workplace_settings.payroll_export_columns is
  'Optional list of payroll export column keys. Null uses the built-in column set.';

comment on column public.workplace_settings.team1_auto_break is
  'When false, break rules are ignored. Manual break_minutes on a shift still apply.';
comment on column public.workplace_settings.team1_night_enabled is
  'When false, night hours and the night supplement are zero for this department.';

-- Night percent is a wage column. Butikksjef and employees must not write it.
create or replace function public.guard_workplace_wages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  suffix text;
  col text;
  old_row jsonb;
begin
  if auth.uid() is null or public.can_read_wages() then
    return new;
  end if;
  old_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  for i in 1..10 loop
    foreach suffix in array array[
      'sunday_extra_type', 'sunday_extra_amount',
      'holiday_extra_type', 'holiday_extra_amount',
      'night_extra_type', 'night_extra_amount'
    ] loop
      col := format('team%s_%s', i, suffix);
      if tg_op = 'INSERT' then
        if right(suffix, 5) = '_type' then
          new := jsonb_populate_record(new, jsonb_build_object(col, 'none'));
        else
          new := jsonb_populate_record(new, jsonb_build_object(col, 0));
        end if;
      else
        new := jsonb_populate_record(new, jsonb_build_object(col, old_row -> col));
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

revoke all on function public.guard_workplace_wages() from public;

drop function if exists public.workplace_wage_rules();

create function public.workplace_wage_rules()
returns table (
  id text,
  team1_sunday_extra_type text,
  team1_sunday_extra_amount double precision,
  team1_holiday_extra_type text,
  team1_holiday_extra_amount double precision,
  team1_night_extra_type text,
  team1_night_extra_amount double precision,
  team2_sunday_extra_type text,
  team2_sunday_extra_amount double precision,
  team2_holiday_extra_type text,
  team2_holiday_extra_amount double precision,
  team2_night_extra_type text,
  team2_night_extra_amount double precision,
  team3_sunday_extra_type text,
  team3_sunday_extra_amount double precision,
  team3_holiday_extra_type text,
  team3_holiday_extra_amount double precision,
  team3_night_extra_type text,
  team3_night_extra_amount double precision,
  team4_sunday_extra_type text,
  team4_sunday_extra_amount double precision,
  team4_holiday_extra_type text,
  team4_holiday_extra_amount double precision,
  team4_night_extra_type text,
  team4_night_extra_amount double precision,
  team5_sunday_extra_type text,
  team5_sunday_extra_amount double precision,
  team5_holiday_extra_type text,
  team5_holiday_extra_amount double precision,
  team5_night_extra_type text,
  team5_night_extra_amount double precision,
  team6_sunday_extra_type text,
  team6_sunday_extra_amount double precision,
  team6_holiday_extra_type text,
  team6_holiday_extra_amount double precision,
  team6_night_extra_type text,
  team6_night_extra_amount double precision,
  team7_sunday_extra_type text,
  team7_sunday_extra_amount double precision,
  team7_holiday_extra_type text,
  team7_holiday_extra_amount double precision,
  team7_night_extra_type text,
  team7_night_extra_amount double precision,
  team8_sunday_extra_type text,
  team8_sunday_extra_amount double precision,
  team8_holiday_extra_type text,
  team8_holiday_extra_amount double precision,
  team8_night_extra_type text,
  team8_night_extra_amount double precision,
  team9_sunday_extra_type text,
  team9_sunday_extra_amount double precision,
  team9_holiday_extra_type text,
  team9_holiday_extra_amount double precision,
  team9_night_extra_type text,
  team9_night_extra_amount double precision,
  team10_sunday_extra_type text,
  team10_sunday_extra_amount double precision,
  team10_holiday_extra_type text,
  team10_holiday_extra_amount double precision,
  team10_night_extra_type text,
  team10_night_extra_amount double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.team1_sunday_extra_type,
    w.team1_sunday_extra_amount,
    w.team1_holiday_extra_type,
    w.team1_holiday_extra_amount,
    w.team1_night_extra_type,
    w.team1_night_extra_amount,
    w.team2_sunday_extra_type,
    w.team2_sunday_extra_amount,
    w.team2_holiday_extra_type,
    w.team2_holiday_extra_amount,
    w.team2_night_extra_type,
    w.team2_night_extra_amount,
    w.team3_sunday_extra_type,
    w.team3_sunday_extra_amount,
    w.team3_holiday_extra_type,
    w.team3_holiday_extra_amount,
    w.team3_night_extra_type,
    w.team3_night_extra_amount,
    w.team4_sunday_extra_type,
    w.team4_sunday_extra_amount,
    w.team4_holiday_extra_type,
    w.team4_holiday_extra_amount,
    w.team4_night_extra_type,
    w.team4_night_extra_amount,
    w.team5_sunday_extra_type,
    w.team5_sunday_extra_amount,
    w.team5_holiday_extra_type,
    w.team5_holiday_extra_amount,
    w.team5_night_extra_type,
    w.team5_night_extra_amount,
    w.team6_sunday_extra_type,
    w.team6_sunday_extra_amount,
    w.team6_holiday_extra_type,
    w.team6_holiday_extra_amount,
    w.team6_night_extra_type,
    w.team6_night_extra_amount,
    w.team7_sunday_extra_type,
    w.team7_sunday_extra_amount,
    w.team7_holiday_extra_type,
    w.team7_holiday_extra_amount,
    w.team7_night_extra_type,
    w.team7_night_extra_amount,
    w.team8_sunday_extra_type,
    w.team8_sunday_extra_amount,
    w.team8_holiday_extra_type,
    w.team8_holiday_extra_amount,
    w.team8_night_extra_type,
    w.team8_night_extra_amount,
    w.team9_sunday_extra_type,
    w.team9_sunday_extra_amount,
    w.team9_holiday_extra_type,
    w.team9_holiday_extra_amount,
    w.team9_night_extra_type,
    w.team9_night_extra_amount,
    w.team10_sunday_extra_type,
    w.team10_sunday_extra_amount,
    w.team10_holiday_extra_type,
    w.team10_holiday_extra_amount,
    w.team10_night_extra_type,
    w.team10_night_extra_amount
  from public.workplace_settings w
  where public.can_read_wages()
    and (public.is_super_admin() or public.in_org(w.org_id));
$$;

revoke all on function public.workplace_wage_rules() from public;
grant execute on function public.workplace_wage_rules() to authenticated;

create or replace function public.my_wage_info()
returns table (
  kind text,
  id text,
  worker_id text,
  hourly_rate double precision,
  pay_multiplier double precision,
  extra_type text,
  extra_amount double precision,
  workplace_extras jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'worker'::text,
    w.id,
    w.id,
    w.hourly_rate,
    null::double precision,
    null::text,
    null::double precision,
    null::jsonb
  from public.workers w
  where w.id in (select public.my_worker_ids())
  union all
  select
    'contract'::text,
    c.id,
    c.worker_id,
    c.hourly_rate,
    null::double precision,
    null::text,
    null::double precision,
    null::jsonb
  from public.contracts c
  where public.worker_matches(c.worker_id)
  union all
  select
    'holiday'::text,
    h.id,
    null::text,
    null::double precision,
    h.pay_multiplier,
    h.extra_type,
    h.extra_amount,
    null::jsonb
  from public.holidays h
  where h.org_id in (
    select w.org_id
    from public.workers w
    where w.id in (select public.my_worker_ids())
      and w.org_id is not null
      and btrim(w.org_id) <> ''
  )
  union all
  select
    'workplace'::text,
    s.id,
    null::text,
    null::double precision,
    null::double precision,
    null::text,
    null::double precision,
    jsonb_build_object(
      'team1_sunday_extra_type', s.team1_sunday_extra_type,
      'team1_sunday_extra_amount', s.team1_sunday_extra_amount,
      'team1_holiday_extra_type', s.team1_holiday_extra_type,
      'team1_holiday_extra_amount', s.team1_holiday_extra_amount,
      'team1_night_extra_type', s.team1_night_extra_type,
      'team1_night_extra_amount', s.team1_night_extra_amount,
      'team2_sunday_extra_type', s.team2_sunday_extra_type,
      'team2_sunday_extra_amount', s.team2_sunday_extra_amount,
      'team2_holiday_extra_type', s.team2_holiday_extra_type,
      'team2_holiday_extra_amount', s.team2_holiday_extra_amount,
      'team2_night_extra_type', s.team2_night_extra_type,
      'team2_night_extra_amount', s.team2_night_extra_amount,
      'team3_sunday_extra_type', s.team3_sunday_extra_type,
      'team3_sunday_extra_amount', s.team3_sunday_extra_amount,
      'team3_holiday_extra_type', s.team3_holiday_extra_type,
      'team3_holiday_extra_amount', s.team3_holiday_extra_amount,
      'team3_night_extra_type', s.team3_night_extra_type,
      'team3_night_extra_amount', s.team3_night_extra_amount,
      'team4_sunday_extra_type', s.team4_sunday_extra_type,
      'team4_sunday_extra_amount', s.team4_sunday_extra_amount,
      'team4_holiday_extra_type', s.team4_holiday_extra_type,
      'team4_holiday_extra_amount', s.team4_holiday_extra_amount,
      'team4_night_extra_type', s.team4_night_extra_type,
      'team4_night_extra_amount', s.team4_night_extra_amount,
      'team5_sunday_extra_type', s.team5_sunday_extra_type,
      'team5_sunday_extra_amount', s.team5_sunday_extra_amount,
      'team5_holiday_extra_type', s.team5_holiday_extra_type,
      'team5_holiday_extra_amount', s.team5_holiday_extra_amount,
      'team5_night_extra_type', s.team5_night_extra_type,
      'team5_night_extra_amount', s.team5_night_extra_amount
    ) || jsonb_build_object(
      'team6_sunday_extra_type', s.team6_sunday_extra_type,
      'team6_sunday_extra_amount', s.team6_sunday_extra_amount,
      'team6_holiday_extra_type', s.team6_holiday_extra_type,
      'team6_holiday_extra_amount', s.team6_holiday_extra_amount,
      'team6_night_extra_type', s.team6_night_extra_type,
      'team6_night_extra_amount', s.team6_night_extra_amount,
      'team7_sunday_extra_type', s.team7_sunday_extra_type,
      'team7_sunday_extra_amount', s.team7_sunday_extra_amount,
      'team7_holiday_extra_type', s.team7_holiday_extra_type,
      'team7_holiday_extra_amount', s.team7_holiday_extra_amount,
      'team7_night_extra_type', s.team7_night_extra_type,
      'team7_night_extra_amount', s.team7_night_extra_amount,
      'team8_sunday_extra_type', s.team8_sunday_extra_type,
      'team8_sunday_extra_amount', s.team8_sunday_extra_amount,
      'team8_holiday_extra_type', s.team8_holiday_extra_type,
      'team8_holiday_extra_amount', s.team8_holiday_extra_amount,
      'team8_night_extra_type', s.team8_night_extra_type,
      'team8_night_extra_amount', s.team8_night_extra_amount,
      'team9_sunday_extra_type', s.team9_sunday_extra_type,
      'team9_sunday_extra_amount', s.team9_sunday_extra_amount,
      'team9_holiday_extra_type', s.team9_holiday_extra_type,
      'team9_holiday_extra_amount', s.team9_holiday_extra_amount,
      'team9_night_extra_type', s.team9_night_extra_type,
      'team9_night_extra_amount', s.team9_night_extra_amount,
      'team10_sunday_extra_type', s.team10_sunday_extra_type,
      'team10_sunday_extra_amount', s.team10_sunday_extra_amount,
      'team10_holiday_extra_type', s.team10_holiday_extra_type,
      'team10_holiday_extra_amount', s.team10_holiday_extra_amount,
      'team10_night_extra_type', s.team10_night_extra_type,
      'team10_night_extra_amount', s.team10_night_extra_amount
    )
  from public.workplace_settings s
  where s.org_id in (
    select w.org_id
    from public.workers w
    where w.id in (select public.my_worker_ids())
      and w.org_id is not null
      and btrim(w.org_id) <> ''
  );
$$;

revoke all on function public.my_wage_info() from public;
grant execute on function public.my_wage_info() to authenticated;

-- Readable hour rules and the night window. Wage amounts stay revoked.
grant select (payroll_export_columns, team1_break_rules, team1_auto_break, team1_night_enabled, team1_night_from, team1_night_to, team2_break_rules, team2_auto_break, team2_night_enabled, team2_night_from, team2_night_to, team3_break_rules, team3_auto_break, team3_night_enabled, team3_night_from, team3_night_to, team4_break_rules, team4_auto_break, team4_night_enabled, team4_night_from, team4_night_to, team5_break_rules, team5_auto_break, team5_night_enabled, team5_night_from, team5_night_to, team6_break_rules, team6_auto_break, team6_night_enabled, team6_night_from, team6_night_to, team7_break_rules, team7_auto_break, team7_night_enabled, team7_night_from, team7_night_to, team8_break_rules, team8_auto_break, team8_night_enabled, team8_night_from, team8_night_to, team9_break_rules, team9_auto_break, team9_night_enabled, team9_night_from, team9_night_to, team10_break_rules, team10_auto_break, team10_night_enabled, team10_night_from, team10_night_to) on public.workplace_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Locked payroll periods. A trigger blocks every shift write, including the
-- table owner, until an administrator unlocks the period.
-- ---------------------------------------------------------------------------

create table public.payroll_period_locks (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  start_date date not null,
  end_date date not null,
  note text,
  locked_by text,
  locked_at timestamptz not null default now(),
  unlocked_by text,
  unlocked_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint payroll_period_locks_range check (end_date >= start_date)
);

create index payroll_period_locks_active_idx
  on public.payroll_period_locks (org_id, start_date, end_date)
  where unlocked_at is null;

comment on table public.payroll_period_locks is
  'Active when unlocked_at is null. Shifts on dates inside an active lock cannot be inserted, updated or deleted.';

create trigger payroll_period_locks_prepare
  before insert or update on public.payroll_period_locks
  for each row execute function public.prepare_entity_row();

create or replace function public.payroll_period_is_locked(target_org text, target_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payroll_period_locks l
    where l.org_id = target_org
      and l.unlocked_at is null
      and target_date between l.start_date and l.end_date
  );
$$;

revoke all on function public.payroll_period_is_locked(text, date) from public;

create or replace function public.guard_payroll_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.payroll_period_is_locked(old.org_id, old.date) then
      raise exception 'Lønnsperioden er låst' using errcode = '42501';
    end if;
    return old;
  end if;

  if public.payroll_period_is_locked(new.org_id, new.date)
     or (tg_op = 'UPDATE' and public.payroll_period_is_locked(old.org_id, old.date)) then
    raise exception 'Lønnsperioden er låst' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_payroll_period_lock() from public;

-- Name sorts after shifts_prepare so org_id is already filled in.
drop trigger if exists shifts_zz_payroll_lock on public.shifts;
create trigger shifts_zz_payroll_lock
  before insert or update or delete on public.shifts
  for each row execute function public.guard_payroll_period_lock();

create or replace function public.guard_shift_hour_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.hours_approved, false) and public.effective_role() not in ('admin', 'sub_admin') and auth.uid() is not null then
      raise exception 'Bare administrator kan godkjenne timer' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.hours_approved is not distinct from old.hours_approved
     and new.hours_approved_at is not distinct from old.hours_approved_at
     and new.hours_approved_by is not distinct from old.hours_approved_by then
    return new;
  end if;
  if auth.uid() is null or public.effective_role() in ('admin', 'sub_admin') then
    return new;
  end if;
  raise exception 'Bare administrator kan godkjenne timer' using errcode = '42501';
end;
$$;

revoke all on function public.guard_shift_hour_approval() from public;

drop trigger if exists shifts_hour_approval_guard on public.shifts;
create trigger shifts_hour_approval_guard
  before insert or update on public.shifts
  for each row execute function public.guard_shift_hour_approval();

create or replace function public.guard_payroll_lock_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1
      from public.payroll_period_locks l
      where l.org_id = new.org_id
        and l.unlocked_at is null
        and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'Perioden overlapper en låst periode' using errcode = '42501';
    end if;
    new.locked_by := coalesce(auth.uid()::text, new.locked_by);
    new.locked_at := now();
    new.unlocked_at := null;
    new.unlocked_by := null;
    return new;
  end if;

  new.org_id := old.org_id;
  new.start_date := old.start_date;
  new.end_date := old.end_date;
  new.locked_by := old.locked_by;
  new.locked_at := old.locked_at;
  if new.unlocked_at is not null and old.unlocked_at is null then
    new.unlocked_by := coalesce(auth.uid()::text, new.unlocked_by);
    new.unlocked_at := now();
  else
    new.unlocked_at := old.unlocked_at;
    new.unlocked_by := old.unlocked_by;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_payroll_lock_row() from public;

-- Name sorts after payroll_period_locks_prepare.
drop trigger if exists payroll_period_locks_zz_guard on public.payroll_period_locks;
create trigger payroll_period_locks_zz_guard
  before insert or update on public.payroll_period_locks
  for each row execute function public.guard_payroll_lock_row();

alter table public.payroll_period_locks enable row level security;

create policy payroll_period_locks_select on public.payroll_period_locks
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy payroll_period_locks_insert on public.payroll_period_locks
  for insert to authenticated
  with check (
    public.in_org(org_id)
    and public.effective_role() = 'admin'
  );

create policy payroll_period_locks_update on public.payroll_period_locks
  for update to authenticated
  using (
    public.in_org(org_id)
    and public.effective_role() = 'admin'
  )
  with check (
    public.in_org(org_id)
    and public.effective_role() = 'admin'
  );

create policy payroll_period_locks_delete on public.payroll_period_locks
  for delete to authenticated
  using (
    public.in_org(org_id)
    and public.effective_role() = 'admin'
  );

grant select, insert, update, delete on public.payroll_period_locks to authenticated;

-- Ferie is an absence, same notification path as sick. This does not send email.
create or replace function public.notify_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  title text;
  body text;
begin
  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.shift_label is not distinct from old.shift_label
     and new.status is not distinct from old.status
     and new.all_day is not distinct from old.all_day then
    return new;
  end if;

  if new.shift_label in ('sick', 'ferie')
     and (tg_op = 'INSERT' or old.shift_label is distinct from new.shift_label) then
    kind := 'absence';
    title := case when new.shift_label = 'ferie' then 'Ferie registrert' else 'Fravær registrert' end;
  elsif tg_op = 'INSERT' then
    kind := 'shift';
    title := 'Ny vakt';
  else
    kind := 'shift';
    title := 'Vakt endret';
  end if;

  body := case
    when new.all_day then new.date::text || ' hele dagen'
    else new.date::text || ' ' || new.start_time || '–' || new.end_time
  end;

  perform public.enqueue_notification(
    public.profile_id_for_worker(new.worker_id),
    new.org_id,
    kind,
    title,
    body
  );
  return new;
end;
$$;
