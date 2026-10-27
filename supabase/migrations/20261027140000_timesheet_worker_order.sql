-- Manual employee order in Timelister, one list per organization and store.
-- 'all' is the Alle team view. team1–team10 are the stores.
-- Org members can read. Admins, sub-admins and a butikksjef for that store can write.
-- Not applied to the hosted database by the change that added this file.

create table public.timesheet_worker_orders (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  team_key text not null,
  worker_ids text[] not null default '{}',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint timesheet_worker_orders_team_key check (
    team_key = 'all' or team_key ~ '^team([1-9]|10)$'
  ),
  constraint timesheet_worker_orders_org_team unique (org_id, team_key)
);

comment on table public.timesheet_worker_orders is
  'Shared Timelister row order. worker_ids is the manual order for one store. People missing from the list are shown at the bottom.';

create trigger timesheet_worker_orders_prepare
  before insert or update on public.timesheet_worker_orders
  for each row execute function public.prepare_entity_row();

alter table public.timesheet_worker_orders enable row level security;

create policy timesheet_worker_orders_select on public.timesheet_worker_orders
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy timesheet_worker_orders_insert on public.timesheet_worker_orders
  for insert to authenticated
  with check (public.can_manage_team(org_id, team_key));

create policy timesheet_worker_orders_update on public.timesheet_worker_orders
  for update to authenticated
  using (public.can_manage_team(org_id, team_key))
  with check (public.can_manage_team(org_id, team_key));

create policy timesheet_worker_orders_delete on public.timesheet_worker_orders
  for delete to authenticated
  using (public.can_manage_team(org_id, team_key));

grant select, insert, update, delete on public.timesheet_worker_orders to authenticated;
