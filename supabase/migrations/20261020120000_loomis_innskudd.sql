-- Loomis bag deposits (innskudd).
-- NOT APPLIED to the live database by this change. Review it, then run it
-- in the Supabase SQL editor or via the migration pipeline when ready.
--
-- Employees register a cash bag (posenummer = Loomis bilagsnr). Admins import
-- the Loomis kundeportal export into loomis_deposits, upserted by innskuddnr.
-- A bag is matched when a deposit in the same org has the same bilagsnr.
-- Employees can update or delete only their own row, and only before that match.
-- Admin and sub_admin can still correct a matched row. Rows stay inside the org.

alter table public.workplace_settings
  add column if not exists team1_loomis_kundenr text,
  add column if not exists team2_loomis_kundenr text,
  add column if not exists team3_loomis_kundenr text,
  add column if not exists team4_loomis_kundenr text,
  add column if not exists team5_loomis_kundenr text,
  add column if not exists team6_loomis_kundenr text,
  add column if not exists team7_loomis_kundenr text,
  add column if not exists team8_loomis_kundenr text,
  add column if not exists team9_loomis_kundenr text,
  add column if not exists team10_loomis_kundenr text;

comment on column public.workplace_settings.team1_loomis_kundenr is
  'Loomis kundenummer for avdelingen. Kobler kundeportal-eksporten til butikken.';

-- Fill the known Narvesen mapping where the store name matches and the field is empty.
do $$
declare
  i integer;
  nr_col text;
  name_col text;
  known jsonb := '{"N.417":"20052971","N.500":"20048196","N.586":"20057557","N.897":"20057456"}'::jsonb;
begin
  for i in 1..10 loop
    nr_col := format('team%s_loomis_kundenr', i);
    name_col := format('team%s_name', i);
    execute format(
      'update public.workplace_settings ws
       set %I = m.nr
       from (select key as store_name, value as nr from jsonb_each_text($1)) m
       where coalesce(ws.%I, '''') = ''''
         and ws.%I = m.store_name',
      nr_col, nr_col, name_col
    ) using known;
  end loop;
end $$;

create table public.loomis_innskudd (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  team text not null,
  butikk text,
  dato date not null,
  registrert_navn text not null,
  ansatt_id text,
  posenummer text not null,
  seddel_1000_antall integer not null default 0,
  seddel_500_antall integer not null default 0,
  seddel_200_antall integer not null default 0,
  seddel_100_antall integer not null default 0,
  mynt_belop numeric(14,2) not null default 0,
  antall_sedler integer not null default 0,
  belop numeric(14,2) not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint loomis_innskudd_pose_check check (posenummer ~ '^[0-9]{9}$'),
  constraint loomis_innskudd_counts_check check (
    seddel_1000_antall >= 0
    and seddel_500_antall >= 0
    and seddel_200_antall >= 0
    and seddel_100_antall >= 0
    and mynt_belop >= 0
    and antall_sedler >= 0
    and belop >= 0
  ),
  constraint loomis_innskudd_pose_org_unique unique (org_id, posenummer)
);

create index loomis_innskudd_org_dato_idx on public.loomis_innskudd (org_id, dato);

create table public.loomis_deposits (
  id text primary key default gen_random_uuid()::text,
  org_id text not null,
  innskuddnr text not null,
  batchnr text,
  referanse text,
  kundenr text,
  registrert text,
  telledato date,
  bokforingsdato date,
  total numeric(14,2),
  bilagsnr text,
  status text,
  team text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  constraint loomis_deposits_status_check check (
    status is null or status in ('Synkronisert', 'Bokført')
  ),
  constraint loomis_deposits_innskudd_org_unique unique (org_id, innskuddnr)
);

create index loomis_deposits_org_bilag_idx on public.loomis_deposits (org_id, bilagsnr);
create index loomis_deposits_org_kunde_idx on public.loomis_deposits (org_id, kundenr);

comment on table public.loomis_deposits is
  'Loomis kundeportal export. Synkronisert = mottatt, ikke talt. Bokført = talt. Match mot butikk på bilagsnr = posenummer.';

create or replace function public.loomis_pose_matched(target_org text, pose text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.loomis_deposits d
    where d.org_id = target_org
      and pose is not null
      and btrim(pose) <> ''
      and d.bilagsnr is not null
      and btrim(d.bilagsnr) = btrim(pose)
  );
$$;

create trigger loomis_innskudd_prepare
  before insert or update on public.loomis_innskudd
  for each row execute function public.prepare_entity_row();

create trigger loomis_deposits_prepare
  before insert or update on public.loomis_deposits
  for each row execute function public.prepare_entity_row();

-- Named so it sorts after loomis_innskudd_prepare (same-event triggers
-- run in name order) and sees the org_id that prepare just filled in.
create or replace function public.guard_loomis_innskudd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' then
    new.antall_sedler :=
      new.seddel_1000_antall + new.seddel_500_antall + new.seddel_200_antall + new.seddel_100_antall;
    new.belop :=
      new.seddel_1000_antall * 1000
      + new.seddel_500_antall * 500
      + new.seddel_200_antall * 200
      + new.seddel_100_antall * 100
      + new.mynt_belop;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if auth.uid() is not null
     and not public.can_assign_roles()
     and (
       public.loomis_pose_matched(old.org_id, old.posenummer)
       or (
         tg_op = 'UPDATE'
         and public.loomis_pose_matched(coalesce(new.org_id, old.org_id), new.posenummer)
       )
     ) then
    raise exception 'Posen er matchet mot Loomis og kan ikke endres' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger loomis_innskudd_z_guard
  before insert or update or delete on public.loomis_innskudd
  for each row execute function public.guard_loomis_innskudd();

alter table public.loomis_innskudd enable row level security;
alter table public.loomis_deposits enable row level security;

create policy loomis_innskudd_select on public.loomis_innskudd
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy loomis_innskudd_insert on public.loomis_innskudd
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or team = any (public.my_team_keys())
      )
    )
  );

create policy loomis_innskudd_update on public.loomis_innskudd
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
      and team = any (public.my_team_keys())
      and not public.loomis_pose_matched(org_id, posenummer)
    )
    or (
      public.in_org(org_id)
      and not public.loomis_pose_matched(org_id, posenummer)
      and (
        created_by = auth.uid()::text
        or ansatt_id in (select public.my_worker_ids())
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and (
        public.effective_role() in ('admin', 'sub_admin')
        or team = any (public.my_team_keys())
      )
    )
  );

create policy loomis_innskudd_delete on public.loomis_innskudd
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin')
    )
    or (
      public.in_org(org_id)
      and not public.loomis_pose_matched(org_id, posenummer)
      and (
        (
          public.effective_role() = 'butikksjef'
          and team = any (public.my_team_keys())
        )
        or created_by = auth.uid()::text
        or ansatt_id in (select public.my_worker_ids())
      )
    )
  );

create policy loomis_deposits_select on public.loomis_deposits
  for select to authenticated
  using (public.is_super_admin() or public.in_org(org_id));

create policy loomis_deposits_insert on public.loomis_deposits
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.in_org(org_id)
      and public.effective_role() in ('admin', 'sub_admin', 'butikksjef')
    )
  );

create policy loomis_deposits_update on public.loomis_deposits
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

create policy loomis_deposits_delete on public.loomis_deposits
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.can_assign_roles() and public.in_org(org_id))
  );

grant select, insert, update, delete on public.loomis_innskudd to authenticated;
grant select, insert, update, delete on public.loomis_deposits to authenticated;
grant execute on function public.loomis_pose_matched(text, text) to authenticated;
grant execute on function public.guard_loomis_innskudd() to authenticated;
