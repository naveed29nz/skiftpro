-- Column-level REVOKE does not remove a table-level GRANT SELECT.
-- The live database needed this follow-up after 20261013210000_hide_wage_columns.sql:
-- drop SELECT on the whole table, then grant SELECT only on the non-wage columns.
--
-- NOT APPLIED by this change. It is already on the live database. This file
-- records that step so a fresh database matches production. Re-running it is safe:
-- REVOKE SELECT and GRANT SELECT (columns) are idempotent.

-- ---------------------------------------------------------------------------
-- workers. Wage column: hourly_rate
-- ---------------------------------------------------------------------------

revoke select on table public.workers from authenticated, anon;

grant select (
  id,
  org_id,
  name,
  email,
  phone,
  position,
  status,
  color,
  teams,
  role,
  team_roles,
  employment_type,
  employment_percentage,
  disabled_extras,
  can_see_resultat,
  created_date,
  updated_date,
  created_by
) on table public.workers to authenticated, anon;

-- ---------------------------------------------------------------------------
-- contracts. Wage column: hourly_rate
-- ---------------------------------------------------------------------------

revoke select on table public.contracts from authenticated, anon;

grant select (
  id,
  org_id,
  worker_id,
  worker_name,
  contract_type,
  status,
  org_name,
  worker_position,
  employment_percentage,
  weekly_hours,
  overtime_hours,
  full_time_hours_per_week,
  start_date,
  end_date,
  week_number,
  year,
  reason,
  notice_period_months,
  pdf_url,
  approved_by_worker_id,
  approved_at,
  generated_automatically,
  created_date,
  updated_date,
  created_by
) on table public.contracts to authenticated, anon;

-- ---------------------------------------------------------------------------
-- holidays. Wage columns: pay_multiplier, extra_type, extra_amount
-- ---------------------------------------------------------------------------

revoke select on table public.holidays from authenticated, anon;

grant select (
  id,
  org_id,
  name,
  date,
  created_date,
  updated_date,
  created_by
) on table public.holidays to authenticated, anon;

-- ---------------------------------------------------------------------------
-- workplace_settings. Wage columns: teamN_sunday_extra_type,
-- teamN_sunday_extra_amount, teamN_holiday_extra_type, teamN_holiday_extra_amount
-- ---------------------------------------------------------------------------

revoke select on table public.workplace_settings from authenticated, anon;

grant select (
  id,
  org_id,
  workplace_name,
  latitude,
  longitude,
  radius_meters,
  full_time_hours_per_week,
  active_teams_count,
  team1_name,
  team2_name,
  team3_name,
  team4_name,
  team5_name,
  team6_name,
  team7_name,
  team8_name,
  team9_name,
  team10_name,
  team1_latitude,
  team1_longitude,
  team1_radius_meters,
  team2_latitude,
  team2_longitude,
  team2_radius_meters,
  team3_latitude,
  team3_longitude,
  team3_radius_meters,
  team4_latitude,
  team4_longitude,
  team4_radius_meters,
  team5_latitude,
  team5_longitude,
  team5_radius_meters,
  team6_latitude,
  team6_longitude,
  team6_radius_meters,
  team7_latitude,
  team7_longitude,
  team7_radius_meters,
  team8_latitude,
  team8_longitude,
  team8_radius_meters,
  team9_latitude,
  team9_longitude,
  team9_radius_meters,
  team10_latitude,
  team10_longitude,
  team10_radius_meters,
  created_date,
  updated_date,
  created_by
) on table public.workplace_settings to authenticated, anon;
