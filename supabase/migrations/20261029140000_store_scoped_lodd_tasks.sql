-- Loddtelling and tasks are visible per store (department).
-- Ordinary employees see rows for the departments in workers.teams (all of
-- them if they work in several stores); tasks assigned to them personally are
-- always visible. Org managers (admin, sub_admin, butikksjef) and super admin
-- keep their current access. recurring_tasks is already manager-only.

create or replace function public.task_visible(t_org text, t_team text, t_ids text[], t_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_manager(t_org)
      or (
        public.in_org(t_org)
        and (
          coalesce(nullif(btrim(t_team), ''), 'team1') = any (public.my_team_keys())
          or exists (
            select 1 from public.my_worker_ids() m(id)
            where m.id = any (coalesce(t_ids, '{}'::text[])) or m.id = t_id
          )
        )
      );
$$;
revoke all on function public.task_visible(text, text, text[], text) from public, anon;
grant execute on function public.task_visible(text, text, text[], text) to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.task_visible(org_id, team, assigned_worker_ids, assigned_worker_id));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.task_visible(org_id, team, assigned_worker_ids, assigned_worker_id))
  with check (public.task_visible(org_id, team, assigned_worker_ids, assigned_worker_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.in_org(org_id) and public.effective_role() in ('admin', 'sub_admin'))
    or public.can_manage_team(org_id, team)
    or (public.in_org(org_id) and coalesce(nullif(btrim(team), ''), 'team1') = any (public.my_team_keys()))
  );

drop policy if exists loddtelling_select on public.loddtelling;
create policy loddtelling_select on public.loddtelling for select to authenticated
  using (
    public.is_org_manager(org_id)
    or (public.in_org(org_id) and coalesce(team, butikk) = any (public.my_team_keys()))
  );
-- loddtelling insert/update/delete were already limited to the employee's own
-- departments (my_team_keys) for non-admins; unchanged.

notify pgrst, 'reload schema';
