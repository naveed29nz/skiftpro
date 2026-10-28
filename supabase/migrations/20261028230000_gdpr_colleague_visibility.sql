-- GDPR: ordinary employees may no longer read colleagues' absence (health) data,
-- shift notes, contact details or employment terms.
-- Full rows: the employee themself, org managers (admin, sub_admin, butikksjef) and super admins.
-- Colleagues: shifts_visible / workers_visible expose only planning columns.

create or replace function public.is_org_manager(org text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or (public.in_org(org) and public.effective_role() in ('admin', 'sub_admin', 'butikksjef'));
$$;
revoke all on function public.is_org_manager(text) from public, anon;
grant execute on function public.is_org_manager(text) to authenticated;

-- Emails of workers in the caller's orgs (used by profiles_select, which used to
-- read workers directly and would otherwise be narrowed by the new workers policy).
create or replace function public.org_member_emails()
returns setof text language sql stable security definer set search_path = public as $$
  select lower(w.email) from public.workers w
  where w.email is not null and w.org_id in (select public.user_org_ids());
$$;
revoke all on function public.org_member_emails() from public, anon;
grant execute on function public.org_member_emails() to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (auth.uid())::text
  or public.is_super_admin()
  or lower(coalesce(email, '')) in (select public.org_member_emails())
  or id in (select o.admin_user_id from public.organizations o
            where o.admin_user_id is not null and o.id in (select public.user_org_ids()))
);

-- Base tables: own rows or manager only.
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated using (
  public.is_super_admin() or public.worker_matches(worker_id) or public.is_org_manager(org_id)
);

drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers for select to authenticated using (
  public.is_super_admin() or id in (select public.my_worker_ids()) or public.is_org_manager(org_id)
);

-- Colleague-safe views (owner rights; filtering is done inside the view).
create or replace view public.shifts_visible as
with me as materialized (
  select public.is_super_admin() as sa,
         public.effective_role() in ('admin', 'sub_admin', 'butikksjef') as mgr,
         array(select public.user_org_ids()) as orgs,
         array(select public.my_worker_ids()) as wids
)
select s.id, s.org_id, s.worker_id, s.worker_name, s.date, s.start_time, s.end_time,
       s.break_minutes,
       case when full_access then s.notes end as notes,
       s.shift_label, s.status, s.team, s.published, s.created_date, s.updated_date,
       case when full_access then s.created_by end as created_by,
       s.all_day, s.break_manual, s.hours_approved,
       case when full_access then s.hours_approved_at end as hours_approved_at,
       case when full_access then s.hours_approved_by end as hours_approved_by
from public.shifts s
cross join me
cross join lateral (select (me.sa or s.worker_id = any (me.wids) or (me.mgr and s.org_id = any (me.orgs))) as full_access) fa
where (me.sa or s.org_id = any (me.orgs))
  -- absence shifts are health data: colleagues just don't see them
  and (fa.full_access or coalesce(s.shift_label, '') not in ('sick', 'sick_self', 'sick_doctor'));

create or replace view public.workers_visible as
with me as materialized (
  select public.is_super_admin() as sa,
         public.effective_role() in ('admin', 'sub_admin', 'butikksjef') as mgr,
         array(select public.user_org_ids()) as orgs,
         array(select public.my_worker_ids()) as wids
)
select w.id, w.org_id, w.name,
       case when f then w.email end as email,
       case when f then w.phone end as phone,
       w.position, w.status, w.color, w.teams, w.role, w.team_roles,
       case when f then w.employment_type end as employment_type,
       case when f then w.employment_percentage end as employment_percentage,
       case when f then w.disabled_extras end as disabled_extras,
       case when f then w.can_see_resultat end as can_see_resultat,
       w.created_date, w.updated_date,
       case when f then w.created_by end as created_by,
       case when f then w.address end as address,
       case when f then w.ansettelsestype end as ansettelsestype,
       case when f then w.tiltredelsesdato end as tiltredelsesdato,
       case when f then w.opphorsdato end as opphorsdato,
       case when f then w.timer_per_uke end as timer_per_uke,
       case when f then w.timer_per_dag end as timer_per_dag,
       case when f then w.arbeidsoppgaver end as arbeidsoppgaver,
       case when f then w.provetid_mnd end as provetid_mnd,
       case when f then w.break_after_hours end as break_after_hours,
       case when f then w.break_length_minutes end as break_length_minutes
from public.workers w
cross join me
cross join lateral (select (me.sa or w.id = any (me.wids) or (me.mgr and w.org_id = any (me.orgs))) as f) fa
where me.sa or w.org_id = any (me.orgs) or w.id = any (me.wids);

revoke all on public.shifts_visible, public.workers_visible from public, anon;
grant select on public.shifts_visible, public.workers_visible to authenticated;

-- Leftover anon table grants (RLS already blocks anon; signed-out pages use edge functions).
do $$
declare t text;
begin
  for t in select table_name from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon' group by table_name
  loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
