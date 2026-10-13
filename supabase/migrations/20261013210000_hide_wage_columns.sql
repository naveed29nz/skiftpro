-- Hide wage rates and wage-rule columns from butikksjef and employees.
--
-- NOT APPLIED to the live database by this change. Review it, then run it
-- in the Supabase SQL editor or via the migration pipeline when ready.
--
-- Who may read wages: super-admin, organization admin (profiles.role admin),
-- and department admin (profiles.role or workers.role / team_roles sub_admin).
-- Butikksjef and employees keep every other column, including hours.
--
-- Column privileges are per database role, so SELECT on hourly_rate is revoked
-- from authenticated for everyone. Admins read the hidden columns through the
-- security-definer RPCs below. service_role is unchanged (edge functions and
-- the overtime job still read the real rates).
--
-- Tables stay tables. Renaming them to views would recurse through
-- my_worker_ids(), user_org_ids(), and check_overtime_for_shift().

-- ---------------------------------------------------------------------------
-- Who may read wage columns. Mirrors the app's effective role: a platform
-- admin is never downgraded; otherwise workers.role or team_roles can elevate
-- a department admin whose profile role is still "user".
-- ---------------------------------------------------------------------------

create or replace function public.can_read_wages()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or public.current_app_role() in ('admin', 'sub_admin')
    or exists (
      select 1
      from public.workers w
      join public.profiles p on p.id = auth.uid()::text
      where w.email is not null
        and btrim(w.email) <> ''
        and lower(w.email) = lower(coalesce(p.email, ''))
        and (
          w.role in ('admin', 'sub_admin')
          or exists (
            select 1
            from jsonb_each_text(coalesce(w.team_roles, '{}'::jsonb)) as t(k, v)
            where t.v in ('admin', 'sub_admin')
              and (
                w.teams is null
                or cardinality(w.teams) = 0
                or t.k = any (w.teams)
              )
          )
        )
    );
$$;

revoke all on function public.can_read_wages() from public;
grant execute on function public.can_read_wages() to authenticated;

-- ---------------------------------------------------------------------------
-- Writes. A butikksjef saving settings or a worker form must not zero a rate
-- they can no longer see, and must not invent a new one.
-- auth.uid() is null for service_role, so imports and the overtime job keep
-- the values they write. A contract insert from a non-wage user copies the
-- worker's stored rate instead of the payload.
-- ---------------------------------------------------------------------------

create or replace function public.guard_worker_wage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.can_read_wages() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hourly_rate := 0;
  else
    new.hourly_rate := old.hourly_rate;
  end if;
  return new;
end;
$$;

create or replace function public.guard_contract_wage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stored double precision;
begin
  if auth.uid() is null or public.can_read_wages() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.hourly_rate := old.hourly_rate;
    return new;
  end if;
  select w.hourly_rate into stored
  from public.workers w
  where w.id = new.worker_id;
  new.hourly_rate := coalesce(stored, 0);
  return new;
end;
$$;

create or replace function public.guard_holiday_wage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.can_read_wages() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pay_multiplier := 1;
    new.extra_type := 'none';
    new.extra_amount := 0;
  else
    new.pay_multiplier := old.pay_multiplier;
    new.extra_type := old.extra_type;
    new.extra_amount := old.extra_amount;
  end if;
  return new;
end;
$$;

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
    foreach suffix in array array['sunday_extra_type', 'sunday_extra_amount', 'holiday_extra_type', 'holiday_extra_amount'] loop
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

-- Name sorts after *_prepare so created_by is already stamped.
create trigger workers_wage_guard
  before insert or update on public.workers
  for each row execute function public.guard_worker_wage();

create trigger contracts_wage_guard
  before insert or update on public.contracts
  for each row execute function public.guard_contract_wage();

create trigger holidays_wage_guard
  before insert or update on public.holidays
  for each row execute function public.guard_holiday_wage();

create trigger workplace_settings_wage_guard
  before insert or update on public.workplace_settings
  for each row execute function public.guard_workplace_wages();

revoke all on function public.guard_worker_wage() from public;
revoke all on function public.guard_contract_wage() from public;
revoke all on function public.guard_holiday_wage() from public;
revoke all on function public.guard_workplace_wages() from public;

-- ---------------------------------------------------------------------------
-- Column select. UPDATE stays granted so a settings save still writes the
-- non-wage columns; the triggers above put the wage columns back.
-- ---------------------------------------------------------------------------

revoke select (hourly_rate) on public.workers from authenticated, anon, public;
revoke select (hourly_rate) on public.contracts from authenticated, anon, public;
revoke select (pay_multiplier, extra_type, extra_amount) on public.holidays from authenticated, anon, public;

do $$
declare
  i int;
  suffix text;
begin
  for i in 1..10 loop
    foreach suffix in array array['sunday_extra_type', 'sunday_extra_amount', 'holiday_extra_type', 'holiday_extra_amount'] loop
      execute format(
        'revoke select (team%s_%s) on public.workplace_settings from authenticated, anon, public',
        i, suffix
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Admin reads. Empty when the caller cannot read wages. The row filter
-- repeats the existing select policy so an admin of one org does not receive
-- another org's rates. The function owner bypasses the column revoke.
-- ---------------------------------------------------------------------------

create or replace function public.worker_hourly_rates()
returns table (id text, hourly_rate double precision)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.hourly_rate
  from public.workers w
  where public.can_read_wages()
    and (
      public.is_super_admin()
      or public.in_org(w.org_id)
      or w.id in (select public.my_worker_ids())
    );
$$;

create or replace function public.contract_hourly_rates()
returns table (id text, hourly_rate double precision)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.hourly_rate
  from public.contracts c
  where public.can_read_wages()
    and (
      public.is_super_admin()
      or (public.is_manager() and public.in_org(c.org_id))
      or public.worker_matches(c.worker_id)
      or c.created_by = auth.uid()::text
    );
$$;

create or replace function public.holiday_wage_rules()
returns table (
  id text,
  pay_multiplier double precision,
  extra_type text,
  extra_amount double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.pay_multiplier, h.extra_type, h.extra_amount
  from public.holidays h
  where public.can_read_wages()
    and (public.is_super_admin() or public.in_org(h.org_id));
$$;

create or replace function public.workplace_wage_rules()
returns table (
  id text,
  team1_sunday_extra_type text,
  team1_sunday_extra_amount double precision,
  team1_holiday_extra_type text,
  team1_holiday_extra_amount double precision,
  team2_sunday_extra_type text,
  team2_sunday_extra_amount double precision,
  team2_holiday_extra_type text,
  team2_holiday_extra_amount double precision,
  team3_sunday_extra_type text,
  team3_sunday_extra_amount double precision,
  team3_holiday_extra_type text,
  team3_holiday_extra_amount double precision,
  team4_sunday_extra_type text,
  team4_sunday_extra_amount double precision,
  team4_holiday_extra_type text,
  team4_holiday_extra_amount double precision,
  team5_sunday_extra_type text,
  team5_sunday_extra_amount double precision,
  team5_holiday_extra_type text,
  team5_holiday_extra_amount double precision,
  team6_sunday_extra_type text,
  team6_sunday_extra_amount double precision,
  team6_holiday_extra_type text,
  team6_holiday_extra_amount double precision,
  team7_sunday_extra_type text,
  team7_sunday_extra_amount double precision,
  team7_holiday_extra_type text,
  team7_holiday_extra_amount double precision,
  team8_sunday_extra_type text,
  team8_sunday_extra_amount double precision,
  team8_holiday_extra_type text,
  team8_holiday_extra_amount double precision,
  team9_sunday_extra_type text,
  team9_sunday_extra_amount double precision,
  team9_holiday_extra_type text,
  team9_holiday_extra_amount double precision,
  team10_sunday_extra_type text,
  team10_sunday_extra_amount double precision,
  team10_holiday_extra_type text,
  team10_holiday_extra_amount double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.team1_sunday_extra_type, w.team1_sunday_extra_amount, w.team1_holiday_extra_type, w.team1_holiday_extra_amount,
    w.team2_sunday_extra_type, w.team2_sunday_extra_amount, w.team2_holiday_extra_type, w.team2_holiday_extra_amount,
    w.team3_sunday_extra_type, w.team3_sunday_extra_amount, w.team3_holiday_extra_type, w.team3_holiday_extra_amount,
    w.team4_sunday_extra_type, w.team4_sunday_extra_amount, w.team4_holiday_extra_type, w.team4_holiday_extra_amount,
    w.team5_sunday_extra_type, w.team5_sunday_extra_amount, w.team5_holiday_extra_type, w.team5_holiday_extra_amount,
    w.team6_sunday_extra_type, w.team6_sunday_extra_amount, w.team6_holiday_extra_type, w.team6_holiday_extra_amount,
    w.team7_sunday_extra_type, w.team7_sunday_extra_amount, w.team7_holiday_extra_type, w.team7_holiday_extra_amount,
    w.team8_sunday_extra_type, w.team8_sunday_extra_amount, w.team8_holiday_extra_type, w.team8_holiday_extra_amount,
    w.team9_sunday_extra_type, w.team9_sunday_extra_amount, w.team9_holiday_extra_type, w.team9_holiday_extra_amount,
    w.team10_sunday_extra_type, w.team10_sunday_extra_amount, w.team10_holiday_extra_type, w.team10_holiday_extra_amount
  from public.workplace_settings w
  where public.can_read_wages()
    and (public.is_super_admin() or public.in_org(w.org_id));
$$;

revoke all on function public.worker_hourly_rates() from public;
revoke all on function public.contract_hourly_rates() from public;
revoke all on function public.holiday_wage_rules() from public;
revoke all on function public.workplace_wage_rules() from public;

grant execute on function public.worker_hourly_rates() to authenticated;
grant execute on function public.contract_hourly_rates() to authenticated;
grant execute on function public.holiday_wage_rules() to authenticated;
grant execute on function public.workplace_wage_rules() to authenticated;
