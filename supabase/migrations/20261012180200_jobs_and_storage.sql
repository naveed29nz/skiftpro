-- Daily recurring-task job (pg_cron, 04:00 UTC — same schedule as the Base44
-- workflow "Generer faste oppgaver daglig") and the shift overtime trigger
-- (Base44 workflow "Overtid Kontrakt Generering" on Shift create/update).
-- Edge functions call the same SQL so the rules live in one place.
-- Also creates the public uploads bucket used by task images.

-- ---------------------------------------------------------------------------
-- Shift length and overtime contracts
-- ---------------------------------------------------------------------------

create or replace function public.shift_hours(
  start_time text,
  end_time text,
  break_minutes double precision
)
returns double precision
language plpgsql
immutable
as $$
declare
  sh integer;
  sm integer;
  eh integer;
  em integer;
begin
  sh := split_part(coalesce(nullif(start_time, ''), '00:00'), ':', 1)::integer;
  sm := split_part(coalesce(nullif(start_time, ''), '00:00'), ':', 2)::integer;
  eh := split_part(coalesce(nullif(end_time, ''), '00:00'), ':', 1)::integer;
  em := split_part(coalesce(nullif(end_time, ''), '00:00'), ':', 2)::integer;
  return greatest(0, ((eh * 60 + em) - (sh * 60 + sm) - coalesce(break_minutes, 0)) / 60.0);
exception
  when others then
    return 0;
end;
$$;

create or replace function public.check_overtime_for_shift(
  p_worker_id text,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.workers%rowtype;
  week_start date;
  week_end date;
  week_num integer;
  yr integer;
  total_hours double precision := 0;
  full_time double precision := 37.5;
  emp_pct double precision;
  contracted double precision;
  overtime double precision;
  v_org_id text;
  v_org_name text := 'Arbeidsgiver';
  existing public.contracts%rowtype;
  new_id text;
  sh record;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or p_worker_id = 'ledig' or p_date is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no shift data');
  end if;

  select * into w from public.workers where id = p_worker_id;
  if not found or w.status is distinct from 'active' then
    return jsonb_build_object('status', 'skipped', 'reason', 'worker not found or inactive');
  end if;

  emp_pct := coalesce(w.employment_percentage, 100);
  if emp_pct >= 100 then
    return jsonb_build_object('status', 'skipped', 'reason', 'worker already 100%+');
  end if;

  -- Monday-Sunday week in the shift's calendar date (Norwegian stores).
  week_start := p_date - (extract(isodow from p_date)::integer - 1);
  week_end := week_start + 6;
  week_num := to_char(p_date, 'IW')::integer;
  yr := extract(year from p_date)::integer;

  for sh in
    select s.start_time, s.end_time, s.break_minutes
    from public.shifts s
    where s.worker_id = p_worker_id
      and s.date >= week_start
      and s.date <= week_end
      and s.status is distinct from 'cancelled'
  loop
    total_hours := total_hours + public.shift_hours(sh.start_time, sh.end_time, sh.break_minutes);
  end loop;

  select ws.full_time_hours_per_week
    into full_time
  from public.workplace_settings ws
  where ws.org_id = w.org_id
  order by ws.created_date
  limit 1;
  full_time := coalesce(full_time, 37.5);

  contracted := full_time * (emp_pct / 100.0);
  overtime := total_hours - contracted;

  if overtime <= 0 then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no overtime',
      'totalHours', total_hours,
      'contractedHours', contracted
    );
  end if;

  v_org_id := nullif(btrim(coalesce(w.org_id, '')), '');
  if v_org_id is not null then
    select o.name into v_org_name from public.organizations o where o.id = v_org_id;
    v_org_name := coalesce(v_org_name, 'Arbeidsgiver');
  else
    select o.id, o.name into v_org_id, v_org_name
    from public.organizations o
    order by o.created_date
    limit 1;
    v_org_name := coalesce(v_org_name, 'Arbeidsgiver');
  end if;

  select * into existing
  from public.contracts c
  where c.worker_id = p_worker_id
    and c.week_number = week_num
    and c.year = yr
    and c.contract_type = 'ekstrahjelp'
    and c.status in ('utkast', 'sendt', 'godkjent')
  order by c.created_date desc
  limit 1;

  if found then
    update public.contracts
      set weekly_hours = total_hours,
          overtime_hours = round(overtime::numeric, 2)::double precision,
          end_date = week_end
      where id = existing.id;
    return jsonb_build_object(
      'status', 'updated',
      'contractId', existing.id,
      'totalHours', total_hours,
      'overtimeHours', overtime
    );
  end if;

  new_id := gen_random_uuid()::text;
  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    worker_position, hourly_rate, employment_percentage, weekly_hours, overtime_hours,
    full_time_hours_per_week, start_date, end_date, week_number, year, reason,
    notice_period_months, generated_automatically, created_by
  ) values (
    new_id, v_org_id, p_worker_id, w.name, 'ekstrahjelp', 'utkast', v_org_name,
    coalesce(nullif(w.position, ''), 'Selger'), coalesce(w.hourly_rate, 0), emp_pct,
    total_hours, round(overtime::numeric, 2)::double precision,
    full_time, week_start, week_end, week_num, yr, 'sesong',
    1, true, 'system'
  );

  return jsonb_build_object(
    'status', 'created',
    'contractId', new_id,
    'totalHours', total_hours,
    'overtimeHours', overtime
  );
end;
$$;

create or replace function public.trg_shift_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.worker_id is null
     or btrim(new.worker_id) = ''
     or new.worker_id = 'ledig'
     or new.date is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and coalesce(new.break_minutes, 0) = coalesce(old.break_minutes, 0)
     and new.status is not distinct from old.status then
    return new;
  end if;

  begin
    perform public.check_overtime_for_shift(new.worker_id, new.date);
  exception
    when others then
      raise warning 'overtime contract trigger failed for shift %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create trigger shifts_overtime_contract
  after insert or update on public.shifts
  for each row execute function public.trg_shift_overtime();

-- ---------------------------------------------------------------------------
-- Recurring tasks. "Today" is Europe/Oslo so a 04:00 UTC run matches the
-- Norwegian calendar date. Logic matches base44/functions/generateRecurringTasks.
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_tasks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rt public.recurring_tasks%rowtype;
  today date := (now() at time zone 'Europe/Oslo')::date;
  dow integer := extract(dow from today)::integer;
  year_start date := date_trunc('year', today)::date;
  week_number integer;
  should_create boolean;
  existing_count integer;
  created integer := 0;
  assigned_id text;
  assigned_name text;
begin
  for rt in
    select * from public.recurring_tasks where is_active is true
  loop
    should_create := false;

    if rt.recurrence = 'daily' then
      should_create := true;
    elsif rt.recurrence = 'weekly' then
      should_create := rt.day_of_week = dow;
    elsif rt.recurrence = 'biweekly' then
      week_number := floor((today - year_start) / 7.0)::integer;
      should_create := rt.day_of_week = dow and week_number % 2 = 0;
    elsif rt.recurrence = 'monthly' then
      should_create := extract(day from today)::integer = 1;
    end if;

    if not should_create then
      continue;
    end if;

    select count(*) into existing_count
    from public.tasks t
    where t.title = rt.title
      and t.due_date = today
      and coalesce(t.org_id, '') = coalesce(rt.org_id, '');

    if existing_count > 0 then
      continue;
    end if;

    if rt.assigned_worker_ids @> array['all']::text[] then
      assigned_id := 'all';
    else
      assigned_id := coalesce(rt.assigned_worker_ids[1], '');
    end if;
    assigned_name := coalesce(rt.assigned_worker_names[1], '');

    insert into public.tasks (
      org_id, title, description, team,
      assigned_worker_id, assigned_worker_name,
      assigned_worker_ids, assigned_worker_names,
      priority, due_date, status, image_url, created_by
    ) values (
      nullif(rt.org_id, ''),
      rt.title,
      coalesce(rt.description, ''),
      coalesce(rt.team, ''),
      assigned_id,
      assigned_name,
      coalesce(rt.assigned_worker_ids, '{}'::text[]),
      coalesce(rt.assigned_worker_names, '{}'::text[]),
      coalesce(rt.priority, 'normal'),
      today,
      'open',
      coalesce(rt.image_url, ''),
      'system'
    );

    created := created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', created, 'date', today);
end;
$$;

revoke all on function public.generate_recurring_tasks() from public, anon, authenticated;
revoke all on function public.check_overtime_for_shift(text, date) from public, anon, authenticated;
grant execute on function public.generate_recurring_tasks() to service_role;
grant execute on function public.check_overtime_for_shift(text, date) to service_role;

-- Schedule the daily job when pg_cron is available. Enabling the extension is
-- a dashboard toggle on some projects; the notice tells you to run the
-- statement in MIGRATION.md if this block cannot schedule the job.
do $cron$
declare
  existing bigint;
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception
    when others then
      raise notice 'pg_cron extension was not created (%). Enable it, then schedule the job from MIGRATION.md.', sqlerrm;
  end;

  begin
    if exists (
      select 1
      from pg_namespace n
      join pg_class c on c.relnamespace = n.oid
      where n.nspname = 'cron' and c.relname = 'job'
    ) then
      for existing in
        select j.jobid
        from cron.job j
        where j.jobname = 'generate-recurring-tasks-daily'
      loop
        perform cron.unschedule(existing);
      end loop;

      perform cron.schedule(
        'generate-recurring-tasks-daily',
        '0 4 * * *',
        'select public.generate_recurring_tasks()'
      );
    else
      raise notice 'pg_cron is installed without a cron.job catalog. Schedule manually; see MIGRATION.md.';
    end if;
  exception
    when others then
      raise notice 'Could not schedule generate-recurring-tasks-daily (%). See MIGRATION.md.', sqlerrm;
  end;
end
$cron$;

-- ---------------------------------------------------------------------------
-- Storage: task and completion images. Objects are stored under the
-- uploader's auth id. The bucket is public so existing <img src={file_url}>
-- tags keep working. Writes are limited to the caller's own folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = excluded.public;

create policy uploads_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'uploads');

create policy uploads_auth_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy uploads_auth_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy uploads_auth_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
