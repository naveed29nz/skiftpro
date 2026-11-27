-- A butikksjef may publish draft shifts for stores on their worker row.
-- shifts.team already grants that through can_manage_team. A draft with no
-- team belongs to them when the assigned employee works in one of those
-- stores, so publishing it is not rejected for a blank team.
-- Another store's shifts stay blocked. Wage columns are not granted here.
-- Not applied to the hosted database by the change that added this file.

create or replace function public.shift_in_managed_store(target_org text, target_team text, target_worker text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_team(target_org, target_team)
    or (
      public.in_org(target_org)
      and public.effective_role() = 'butikksjef'
      and nullif(btrim(coalesce(target_team, '')), '') is null
      and exists (
        select 1
        from public.workers w
        where w.id = target_worker
          and coalesce(w.teams, array['team1']::text[]) && public.my_team_keys()
      )
    );
$$;

revoke all on function public.shift_in_managed_store(text, text, text) from public, anon;
grant execute on function public.shift_in_managed_store(text, text, text) to authenticated;

drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts
  for update to authenticated
  using (public.shift_in_managed_store(org_id, team, worker_id))
  with check (public.shift_in_managed_store(org_id, team, worker_id));
