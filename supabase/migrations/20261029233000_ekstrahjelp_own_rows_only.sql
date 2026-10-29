-- Ekstrahjelp (ansettelsestype 'tilkalling') ser kun egne vakter og egen
-- ansattrad. Gjelder bare brukere uten lederrolle der ALLE egne
-- ansattrader er tilkalling. Vanlige ansatte og ledere er uendret.
create or replace function public.is_ekstrahjelp_only()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not public.is_super_admin()
     and coalesce(public.effective_role(), 'user') not in ('admin', 'sub_admin', 'butikksjef')
     and exists (select 1 from public.workers w where w.id in (select public.my_worker_ids()))
     and not exists (
       select 1 from public.workers w
        where w.id in (select public.my_worker_ids())
          and coalesce(w.ansettelsestype, '') <> 'tilkalling'
     );
$$;
revoke all on function public.is_ekstrahjelp_only() from public, anon;
grant execute on function public.is_ekstrahjelp_only() to authenticated;

create or replace view public.shifts_visible as
WITH me AS MATERIALIZED (
         SELECT is_super_admin() AS sa,
            (effective_role() = ANY (ARRAY['admin'::text, 'sub_admin'::text, 'butikksjef'::text])) AS mgr,
            ARRAY( SELECT user_org_ids() AS user_org_ids) AS orgs,
            ARRAY( SELECT my_worker_ids() AS my_worker_ids) AS wids,
            is_ekstrahjelp_only() AS ek
        )
 SELECT s.id,
    s.org_id,
    s.worker_id,
    s.worker_name,
    s.date,
    s.start_time,
    s.end_time,
    s.break_minutes,
        CASE
            WHEN fa.full_access THEN s.notes
            ELSE NULL::text
        END AS notes,
    s.shift_label,
    s.status,
    s.team,
    s.published,
    s.created_date,
    s.updated_date,
        CASE
            WHEN fa.full_access THEN s.created_by
            ELSE NULL::text
        END AS created_by,
    s.all_day,
    s.break_manual,
    s.hours_approved,
        CASE
            WHEN fa.full_access THEN s.hours_approved_at
            ELSE NULL::timestamp with time zone
        END AS hours_approved_at,
        CASE
            WHEN fa.full_access THEN s.hours_approved_by
            ELSE NULL::text
        END AS hours_approved_by
   FROM ((shifts s
     CROSS JOIN me)
     CROSS JOIN LATERAL ( SELECT (me.sa OR (s.worker_id = ANY (me.wids)) OR (me.mgr AND (s.org_id = ANY (me.orgs)))) AS full_access) fa)
  WHERE (((me.sa OR (s.org_id = ANY (me.orgs))) AND (fa.full_access OR (COALESCE(s.shift_label, ''::text) <> ALL (ARRAY['sick'::text, 'sick_self'::text, 'sick_doctor'::text]))))) AND ((NOT me.ek) OR fa.full_access);

create or replace view public.workers_visible as
WITH me AS MATERIALIZED (
         SELECT is_super_admin() AS sa,
            (effective_role() = ANY (ARRAY['admin'::text, 'sub_admin'::text, 'butikksjef'::text])) AS mgr,
            ARRAY( SELECT user_org_ids() AS user_org_ids) AS orgs,
            ARRAY( SELECT my_worker_ids() AS my_worker_ids) AS wids,
            is_ekstrahjelp_only() AS ek
        )
 SELECT w.id,
    w.org_id,
    w.name,
        CASE
            WHEN fa.f THEN w.email
            ELSE NULL::text
        END AS email,
        CASE
            WHEN fa.f THEN w.phone
            ELSE NULL::text
        END AS phone,
    w."position",
    w.status,
    w.color,
    w.teams,
    w.role,
    w.team_roles,
        CASE
            WHEN fa.f THEN w.employment_type
            ELSE NULL::text
        END AS employment_type,
        CASE
            WHEN fa.f THEN w.employment_percentage
            ELSE NULL::double precision
        END AS employment_percentage,
        CASE
            WHEN fa.f THEN w.disabled_extras
            ELSE NULL::text[]
        END AS disabled_extras,
        CASE
            WHEN fa.f THEN w.can_see_resultat
            ELSE NULL::boolean
        END AS can_see_resultat,
    w.created_date,
    w.updated_date,
        CASE
            WHEN fa.f THEN w.created_by
            ELSE NULL::text
        END AS created_by,
        CASE
            WHEN fa.f THEN w.address
            ELSE NULL::text
        END AS address,
        CASE
            WHEN fa.f THEN w.ansettelsestype
            ELSE NULL::text
        END AS ansettelsestype,
        CASE
            WHEN fa.f THEN w.tiltredelsesdato
            ELSE NULL::date
        END AS tiltredelsesdato,
        CASE
            WHEN fa.f THEN w.opphorsdato
            ELSE NULL::date
        END AS opphorsdato,
        CASE
            WHEN fa.f THEN w.timer_per_uke
            ELSE NULL::double precision
        END AS timer_per_uke,
        CASE
            WHEN fa.f THEN w.timer_per_dag
            ELSE NULL::double precision
        END AS timer_per_dag,
        CASE
            WHEN fa.f THEN w.arbeidsoppgaver
            ELSE NULL::text
        END AS arbeidsoppgaver,
        CASE
            WHEN fa.f THEN w.provetid_mnd
            ELSE NULL::integer
        END AS provetid_mnd,
        CASE
            WHEN fa.f THEN w.break_after_hours
            ELSE NULL::double precision
        END AS break_after_hours,
        CASE
            WHEN fa.f THEN w.break_length_minutes
            ELSE NULL::integer
        END AS break_length_minutes
   FROM ((workers w
     CROSS JOIN me)
     CROSS JOIN LATERAL ( SELECT (me.sa OR (w.id = ANY (me.wids)) OR (me.mgr AND (w.org_id = ANY (me.orgs)))) AS f) fa)
  WHERE ((me.sa OR (w.org_id = ANY (me.orgs)) OR (w.id = ANY (me.wids)))) AND ((NOT me.ek) OR fa.f);

notify pgrst, 'reload schema';
