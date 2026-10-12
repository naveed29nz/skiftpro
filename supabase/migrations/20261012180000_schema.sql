-- SkiftPro phase 1: Base44 entities as Postgres tables.
-- Ids are text so exported Base44 ids can be imported unchanged.
-- Built-in Base44 audit columns are preserved: id, created_date, updated_date, created_by.
-- This migration does not connect to or modify a remote database by itself.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (Base44 User). id matches auth.users.id::text.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id text primary key default gen_random_uuid()::text,
  email text,
  full_name text,
  role text not null default 'user',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint profiles_role_check check (role in ('admin', 'sub_admin', 'butikksjef', 'user'))
);

comment on table public.profiles is
  'App user profile. role=admin with no organization link is the platform super-admin.';

create index profiles_email_lower_idx on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  org_number text,
  customer_number text,
  contact_name text,
  contact_email text,
  contact_phone text,
  admin_user_id text,
  admin_email text,
  status text not null default 'active',
  plan text not null default 'basic',
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint organizations_status_check check (status in ('active', 'inactive', 'trial')),
  constraint organizations_plan_check check (plan in ('basic', 'pro', 'enterprise', 'ultimate'))
);

create index organizations_admin_user_idx on public.organizations (admin_user_id);
create index organizations_admin_email_lower_idx on public.organizations (lower(admin_email));

-- ---------------------------------------------------------------------------
-- Workers
-- ---------------------------------------------------------------------------

create table public.workers (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  name text not null,
  email text,
  phone text,
  hourly_rate double precision not null default 0,
  position text,
  status text not null default 'active',
  color text,
  teams text[] not null default array['team1']::text[],
  role text not null default 'user',
  team_roles jsonb not null default '{}'::jsonb,
  employment_type text not null default 'timelønn',
  employment_percentage double precision not null default 100,
  disabled_extras text[] not null default '{}'::text[],
  can_see_resultat boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint workers_status_check check (status in ('active', 'inactive')),
  constraint workers_role_check check (role in ('admin', 'sub_admin', 'butikksjef', 'user')),
  constraint workers_employment_type_check check (employment_type in ('timelønn', 'fastlønn'))
);

create index workers_org_idx on public.workers (org_id);
create index workers_email_lower_idx on public.workers (lower(email));

-- ---------------------------------------------------------------------------
-- Shifts
-- worker_id is text because unassigned shifts use the sentinel 'ledig'.
-- ---------------------------------------------------------------------------

create table public.shifts (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  worker_id text not null,
  worker_name text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  break_minutes double precision not null default 0,
  notes text,
  shift_label text,
  status text not null default 'scheduled',
  team text,
  published boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint shifts_status_check check (status in ('scheduled', 'completed', 'cancelled')),
  constraint shifts_label_check check (
    shift_label is null or shift_label in ('morning', 'evening', 'middle', 'sick', '')
  )
);

create index shifts_org_date_idx on public.shifts (org_id, date);
create index shifts_worker_date_idx on public.shifts (worker_id, date);

-- ---------------------------------------------------------------------------
-- Workplace settings (one row per organization in normal use)
-- ---------------------------------------------------------------------------

create table public.workplace_settings (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  workplace_name text default 'Main Workplace',
  latitude double precision,
  longitude double precision,
  radius_meters double precision default 100,
  full_time_hours_per_week double precision default 37.5,
  active_teams_count double precision default 1,
  team1_name text default 'Team 1',
  team2_name text default 'Team 2',
  team3_name text default 'Team 3',
  team4_name text default 'Team 4',
  team5_name text default 'Team 5',
  team6_name text default 'Team 6',
  team7_name text default 'Team 7',
  team8_name text default 'Team 8',
  team9_name text default 'Team 9',
  team10_name text default 'Team 10',
  team1_sunday_extra_type text default 'none',
  team1_sunday_extra_amount double precision default 0,
  team1_holiday_extra_type text default 'none',
  team1_holiday_extra_amount double precision default 0,
  team2_sunday_extra_type text default 'none',
  team2_sunday_extra_amount double precision default 0,
  team2_holiday_extra_type text default 'none',
  team2_holiday_extra_amount double precision default 0,
  team3_sunday_extra_type text default 'none',
  team3_sunday_extra_amount double precision default 0,
  team3_holiday_extra_type text default 'none',
  team3_holiday_extra_amount double precision default 0,
  team4_sunday_extra_type text default 'none',
  team4_sunday_extra_amount double precision default 0,
  team4_holiday_extra_type text default 'none',
  team4_holiday_extra_amount double precision default 0,
  team5_sunday_extra_type text default 'none',
  team5_sunday_extra_amount double precision default 0,
  team5_holiday_extra_type text default 'none',
  team5_holiday_extra_amount double precision default 0,
  team6_sunday_extra_type text default 'none',
  team6_sunday_extra_amount double precision default 0,
  team6_holiday_extra_type text default 'none',
  team6_holiday_extra_amount double precision default 0,
  team7_sunday_extra_type text default 'none',
  team7_sunday_extra_amount double precision default 0,
  team7_holiday_extra_type text default 'none',
  team7_holiday_extra_amount double precision default 0,
  team8_sunday_extra_type text default 'none',
  team8_sunday_extra_amount double precision default 0,
  team8_holiday_extra_type text default 'none',
  team8_holiday_extra_amount double precision default 0,
  team9_sunday_extra_type text default 'none',
  team9_sunday_extra_amount double precision default 0,
  team9_holiday_extra_type text default 'none',
  team9_holiday_extra_amount double precision default 0,
  team10_sunday_extra_type text default 'none',
  team10_sunday_extra_amount double precision default 0,
  team10_holiday_extra_type text default 'none',
  team10_holiday_extra_amount double precision default 0,
  team1_latitude double precision,
  team1_longitude double precision,
  team1_radius_meters double precision,
  team2_latitude double precision,
  team2_longitude double precision,
  team2_radius_meters double precision,
  team3_latitude double precision,
  team3_longitude double precision,
  team3_radius_meters double precision,
  team4_latitude double precision,
  team4_longitude double precision,
  team4_radius_meters double precision,
  team5_latitude double precision,
  team5_longitude double precision,
  team5_radius_meters double precision,
  team6_latitude double precision,
  team6_longitude double precision,
  team6_radius_meters double precision,
  team7_latitude double precision,
  team7_longitude double precision,
  team7_radius_meters double precision,
  team8_latitude double precision,
  team8_longitude double precision,
  team8_radius_meters double precision,
  team9_latitude double precision,
  team9_longitude double precision,
  team9_radius_meters double precision,
  team10_latitude double precision,
  team10_longitude double precision,
  team10_radius_meters double precision,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);

create index workplace_settings_org_idx on public.workplace_settings (org_id);

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------

create table public.contracts (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  worker_id text not null,
  worker_name text not null,
  contract_type text not null default 'ekstrahjelp',
  status text not null default 'utkast',
  org_name text,
  worker_position text,
  hourly_rate double precision,
  employment_percentage double precision,
  weekly_hours double precision,
  overtime_hours double precision default 0,
  full_time_hours_per_week double precision default 37.5,
  start_date date,
  end_date date,
  week_number integer,
  year integer,
  reason text default 'sesong',
  notice_period_months double precision default 1,
  pdf_url text,
  approved_by_worker_id text,
  approved_at timestamptz,
  generated_automatically boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint contracts_type_check check (contract_type in ('fast', 'ekstrahjelp')),
  constraint contracts_status_check check (status in ('utkast', 'sendt', 'godkjent', 'avvist')),
  constraint contracts_reason_check check (
    reason is null or reason in ('vikar', 'sesong', 'ferieavvikling')
  )
);

create index contracts_org_idx on public.contracts (org_id);
create index contracts_worker_week_idx on public.contracts (worker_id, year, week_number);

-- ---------------------------------------------------------------------------
-- Tasks and recurring tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  title text not null,
  description text,
  assigned_worker_id text,
  assigned_worker_ids text[] not null default '{}'::text[],
  assigned_worker_name text,
  assigned_worker_names text[] not null default '{}'::text[],
  team text,
  due_date date,
  priority text not null default 'normal',
  status text not null default 'open',
  completed_by_id text,
  completed_at timestamptz,
  image_url text,
  completion_image_url text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint tasks_priority_check check (priority in ('low', 'normal', 'high')),
  constraint tasks_status_check check (status in ('open', 'completed'))
);

create index tasks_org_idx on public.tasks (org_id);
create index tasks_due_idx on public.tasks (org_id, due_date, title);

create table public.recurring_tasks (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  title text not null,
  description text,
  team text,
  assigned_worker_ids text[] not null default '{}'::text[],
  assigned_worker_names text[] not null default '{}'::text[],
  priority text not null default 'normal',
  recurrence text not null default 'weekly',
  day_of_week integer,
  is_active boolean not null default true,
  image_url text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint recurring_tasks_priority_check check (priority in ('low', 'normal', 'high')),
  constraint recurring_tasks_recurrence_check check (recurrence in ('daily', 'weekly', 'biweekly', 'monthly')),
  constraint recurring_tasks_dow_check check (day_of_week is null or day_of_week between 0 and 6)
);

create index recurring_tasks_org_idx on public.recurring_tasks (org_id);

-- ---------------------------------------------------------------------------
-- Holidays, stamps, availability, shift swaps
-- ---------------------------------------------------------------------------

create table public.holidays (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  name text not null,
  date date not null,
  pay_multiplier double precision not null default 2.0,
  extra_type text not null default 'none',
  extra_amount double precision not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint holidays_extra_type_check check (extra_type in ('none', 'percentage', 'fixed_per_shift', 'fixed_per_day'))
);

create index holidays_org_date_idx on public.holidays (org_id, date);

create table public.stamps (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  worker_id text not null,
  worker_name text not null,
  date date not null,
  stamp_in timestamptz,
  stamp_out timestamptz,
  stamp_in_lat double precision,
  stamp_in_lng double precision,
  stamp_out_lat double precision,
  stamp_out_lng double precision,
  is_within_range boolean not null default false,
  distance_meters double precision,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);

create index stamps_org_date_idx on public.stamps (org_id, date);
create index stamps_worker_date_idx on public.stamps (worker_id, date);

create table public.availability (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  worker_id text not null,
  worker_name text,
  date date not null,
  status text not null default 'unavailable',
  note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint availability_status_check check (status in ('available', 'unavailable'))
);

create index availability_org_date_idx on public.availability (org_id, date);
create index availability_worker_date_idx on public.availability (worker_id, date);

create table public.shift_swaps (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  requester_worker_id text not null,
  requester_worker_name text,
  requester_shift_id text not null,
  requester_shift_date date,
  requester_shift_start text,
  requester_shift_end text,
  target_worker_id text,
  target_worker_name text,
  target_shift_id text,
  target_shift_date date,
  target_shift_start text,
  target_shift_end text,
  status text not null default 'pending',
  notes text,
  team text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint shift_swaps_status_check check (status in ('pending', 'accepted', 'approved', 'rejected'))
);

create index shift_swaps_org_idx on public.shift_swaps (org_id);

-- ---------------------------------------------------------------------------
-- Dagsoppgjør, loddtelling, monthly results, staffing budgets
-- ---------------------------------------------------------------------------

create table public.dagsoppgjor (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  butikk text not null,
  butikk_nr text,
  dato date not null,
  month integer,
  year integer,
  pose_nummer text not null,
  skannet_pose_nummer text,
  ansatt_navn text not null,
  ansatt_id text,
  seddel_1000_antall double precision default 0,
  seddel_1000_sum double precision default 0,
  seddel_500_antall double precision default 0,
  seddel_500_sum double precision default 0,
  seddel_200_antall double precision default 0,
  seddel_200_sum double precision default 0,
  seddel_100_antall double precision default 0,
  seddel_100_sum double precision default 0,
  seddel_50_antall double precision default 0,
  seddel_50_sum double precision default 0,
  mynt_antall double precision default 0,
  mynt_sum double precision default 0,
  kontantsalg_kasse double precision default 0,
  droppet_belop double precision default 0,
  kontrollert_belop double precision default 0,
  bank_mottatt_belop double precision default 0,
  differanse_mot_kontroll double precision default 0,
  differanse_mot_bank double precision default 0,
  total_dagsdifferanse double precision default 0,
  kommentar text,
  status text not null default 'Registrert',
  updated_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint dagsoppgjor_status_check check (status in ('Registrert', 'Kontrollert', 'Bankført', 'Avvik'))
);

create index dagsoppgjor_org_dato_idx on public.dagsoppgjor (org_id, dato);

create table public.loddtelling (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  butikk text not null,
  uke_nummer integer not null,
  year integer not null,
  loddtype text not null,
  loddtype_label text,
  man_inng double precision default 0,
  man_akt double precision default 0,
  man_salg double precision default 0,
  tir_inng double precision default 0,
  tir_akt double precision default 0,
  tir_salg double precision default 0,
  ons_inng double precision default 0,
  ons_akt double precision default 0,
  ons_salg double precision default 0,
  tor_inng double precision default 0,
  tor_akt double precision default 0,
  tor_salg double precision default 0,
  fre_inng double precision default 0,
  fre_akt double precision default 0,
  fre_salg double precision default 0,
  lor_inng double precision default 0,
  lor_akt double precision default 0,
  lor_salg double precision default 0,
  son_inng double precision default 0,
  son_akt double precision default 0,
  son_salg double precision default 0,
  slutt_fysisk double precision default 0,
  differanse double precision default 0,
  kommentar text,
  updated_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);

create index loddtelling_org_uke_idx on public.loddtelling (org_id, year, uke_nummer);

create table public.monthly_results (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  year integer not null,
  month integer not null,
  team text not null default 'all',
  db1 double precision default 0,
  svinn double precision default 0,
  svinn_pct double precision default 0,
  vareavskrivning double precision default 0,
  vareavskrivning_pct double precision default 0,
  franchiseavgift double precision default 0,
  franchiseavgift_pct double precision default 0,
  driftskostnader double precision default 0,
  driftskostnader_pct double precision default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint monthly_results_month_check check (month between 1 and 12)
);

create index monthly_results_org_idx on public.monthly_results (org_id, year, month);

create table public.staffing_budgets (
  id text primary key default gen_random_uuid()::text,
  org_id text,
  team text not null,
  week_override integer,
  year_override integer,
  hour integer not null,
  mon double precision not null default 0,
  tue double precision not null default 0,
  wed double precision not null default 0,
  thu double precision not null default 0,
  fri double precision not null default 0,
  sat double precision not null default 0,
  sun double precision not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint staffing_budgets_hour_check check (hour between 0 and 23)
);

create index staffing_budgets_org_idx on public.staffing_budgets (org_id, team);
