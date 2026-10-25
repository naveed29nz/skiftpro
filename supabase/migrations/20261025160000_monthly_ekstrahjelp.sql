-- Monthly ekstrahjelp / merarbeid evaluation.
-- NOT APPLIED to the live database by this change. Review, then run it
-- in the Supabase SQL editor or via the migration pipeline when ready.
--
-- Default period is the calendar month. An organization can switch back to
-- week in employer_settings.ekstrahjelp_periode. Existing weekly drafts are
-- left as they are. New drafts are never sent to the employee.

alter table public.workers
  alter column employment_percentage drop not null;

comment on column public.workers.employment_percentage is
  'Null for stilling Ekstrahjelp (tilkalling), which has no stillingsprosent.';

alter table public.employer_settings
  add column if not exists ekstrahjelp_periode text not null default 'maned';

alter table public.employer_settings
  drop constraint if exists employer_settings_ekstrahjelp_periode_check;

alter table public.employer_settings
  add constraint employer_settings_ekstrahjelp_periode_check
  check (ekstrahjelp_periode in ('uke', 'maned'));

comment on column public.employer_settings.ekstrahjelp_periode is
  'uke keeps the per-week draft. maned (default) writes one draft for the calendar month when the month total exceeds contracted hours. Drafts are never sent automatically.';

comment on column public.employer_settings.send_tilleggsavtaler_automatisk is
  'Ignored for automatic merarbeid and bilag. Those drafts are not sent. An admin sends them from the archive.';

drop function if exists public.upsert_hour_supplement(text, text, date, date, double precision, integer, integer, double precision);

create or replace function public.upsert_hour_supplement(
  p_worker_id text,
  p_kind text,
  p_start date,
  p_end date,
  p_hours double precision,
  p_days integer,
  p_weeks double precision,
  p_contracted_weekly double precision,
  p_exact boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w public.workers%rowtype;
  existing public.contracts%rowtype;
  settings public.employer_settings%rowtype;
  tpl public.contract_templates%rowtype;
  parent_id text;
  parent_signed timestamptz;
  fields jsonb;
  extra jsonb;
  body text;
  new_id text;
  content_hash text;
  avg_day double precision;
  avg_week double precision;
  agreed double precision;
  extra_hours double precision;
  v_template_key text;
  periode text;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return null;
  end if;
  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  v_template_key := case when p_kind = 'bilag' then 'bilag' else 'merarbeid' end;
  select * into tpl
  from public.contract_templates t
  where t.key = v_template_key and t.org_id is null and t.is_active
  order by t.version desc
  limit 1;

  if p_kind = 'bilag' then
    select c.id, coalesce(c.employee_signed_at, c.employer_signed_at, c.approved_at)
      into parent_id, parent_signed
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.template_key = 'tilkalling_ramme'
      and c.status = 'signert'
    order by c.created_date desc
    limit 1;
    if parent_id is null then
      return null;
    end if;
  else
    select c.id into parent_id
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_kind = 'hoved'
      and c.status = 'signert'
    order by c.created_date desc
    limit 1;
  end if;

  avg_week := case when p_weeks > 0 then p_hours / p_weeks else p_hours end;
  avg_day := case when coalesce(p_days, 0) > 0 then p_hours / p_days else p_hours end;
  agreed := coalesce(p_contracted_weekly, 0) * case when p_weeks > 0 then p_weeks else 1 end;
  extra_hours := greatest(p_hours - agreed, 0);
  periode := case when p_exact then 'maned' else 'uke' end;

  extra := jsonb_build_object(
    'periode_fra', to_char(p_start, 'DD.MM.YYYY'),
    'periode_til', to_char(p_end, 'DD.MM.YYYY'),
    'tiltredelsesdato', to_char(p_start, 'DD.MM.YYYY'),
    'opphorsdato', to_char(p_end, 'DD.MM.YYYY'),
    'timer_i_perioden', public.format_no_number(p_hours::numeric),
    'avtalte_timer', public.format_no_number(agreed::numeric),
    'merarbeid_timer', public.format_no_number(extra_hours::numeric),
    'timer_per_uke', public.format_no_number(avg_week::numeric),
    'timer_per_dag', public.format_no_number(avg_day::numeric),
    'har_hovedavtale', parent_id is not null and p_kind <> 'bilag',
    'hovedavtale_dato', coalesce(to_char(parent_signed, 'DD.MM.YYYY'), ''),
    'har_rammeavtale', parent_id is not null and p_kind = 'bilag',
    'rammeavtale_dato', coalesce(to_char(parent_signed, 'DD.MM.YYYY'), '')
  );
  fields := public.contract_field_values(p_worker_id, extra);
  if tpl.id is not null then
    body := public.render_mustache(tpl.body_markdown, fields);
  else
    body := 'Avtale om ' || p_kind || ' fra ' || to_char(p_start, 'DD.MM.YYYY') || ' til ' || to_char(p_end, 'DD.MM.YYYY');
  end if;
  content_hash := encode(digest(convert_to(body, 'UTF8'), 'sha256'), 'hex');

  if p_exact then
    select * into existing
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
      and c.generated_automatically
      and c.status in ('utkast', 'sendt', 'apnet')
      and c.start_date = p_start
      and c.end_date = p_end
      and c.metadata ->> 'periode' = 'maned'
    order by c.created_date
    limit 1;
  else
    select * into existing
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
      and c.generated_automatically
      and c.status in ('utkast', 'sendt', 'apnet')
      and daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')
      and coalesce(c.metadata ->> 'periode', 'uke') is distinct from 'maned'
    order by c.created_date
    limit 1;
  end if;

  if found then
    if existing.body_snapshot is not distinct from body
       and existing.start_date is not distinct from p_start
       and existing.end_date is not distinct from p_end
       and existing.weekly_hours is not distinct from round(avg_week::numeric, 2)::double precision then
      return existing.id;
    end if;
    update public.contracts
      set contract_type = p_kind,
          template_key = v_template_key,
          template_version = tpl.version,
          body_snapshot = body,
          field_values = fields,
          content_sha256 = content_hash,
          start_date = p_start,
          end_date = p_end,
          weekly_hours = round(avg_week::numeric, 2)::double precision,
          overtime_hours = round(extra_hours::numeric, 2)::double precision,
          week_number = to_char(p_start, 'IW')::integer,
          year = extract(isoyear from p_start)::integer,
          parent_contract_id = parent_id,
          hourly_rate = w.hourly_rate,
          contract_kind = p_kind,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('periode', periode)
      where id = existing.id;
    return existing.id;
  end if;

  if exists (
    select 1 from public.contracts c
    where c.worker_id = p_worker_id
      and c.contract_type = p_kind
      and c.status in ('signert_ansatt', 'signert')
      and c.start_date = p_start
      and c.end_date = p_end
  ) then
    return null;
  end if;

  -- Automatic drafts stay drafts. send_tilleggsavtaler_automatisk is not used.
  new_id := gen_random_uuid()::text;
  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    worker_position, hourly_rate, employment_percentage, weekly_hours, overtime_hours,
    full_time_hours_per_week, start_date, end_date, week_number, year, reason,
    template_key, template_version, body_snapshot, field_values, metadata,
    contract_kind, parent_contract_id, content_sha256, signing_provider,
    sent_at, expires_at, generated_automatically, created_by
  ) values (
    new_id, w.org_id, w.id, w.name, p_kind, 'utkast', fields ->> 'selskap',
    fields ->> 'stilling', w.hourly_rate, w.employment_percentage,
    round(avg_week::numeric, 2)::double precision,
    round(extra_hours::numeric, 2)::double precision,
    coalesce(settings.alminnelig_ukentlig_arbeidstid, 37.5),
    p_start, p_end, to_char(p_start, 'IW')::integer, extract(isoyear from p_start)::integer,
    case when p_kind = 'bilag' then coalesce(settings.tilkalling_grunnlag, 'vikar') else 'sesong' end,
    v_template_key, tpl.version, body, fields,
    jsonb_build_object('periode', periode),
    p_kind, parent_id, content_hash, 'simple_otp',
    null, null,
    true, 'system'
  );
  perform public.log_contract_event(new_id, w.org_id, 'opprettet', null, 'system', null, null, '{}'::jsonb, content_hash);
  return new_id;
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
  settings public.employer_settings%rowtype;
  ws public.workplace_settings%rowtype;
  full_time double precision;
  contracted double precision;
  periode text;
  month_start date;
  month_end date;
  month_days integer;
  month_weeks double precision;
  month_hours double precision;
  worked_days integer;
  kind text;
  window_start date;
  window_end date;
  cursor_week date;
  week_hours double precision;
  week_days integer;
  weeks jsonb := '[]'::jsonb;
  rec record;
  grp_start date;
  grp_end date;
  grp_hours double precision;
  grp_days integer;
  grp_weeks integer;
  prev date;
  touched text[] := '{}';
  supplement_id text;
  open_row record;
  updated integer := 0;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' or p_worker_id = 'ledig' or p_date is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no shift data');
  end if;
  select * into w from public.workers where id = p_worker_id;
  if not found or w.status is distinct from 'active' then
    return jsonb_build_object('status', 'skipped', 'reason', 'worker not found or inactive');
  end if;
  if w.ansettelsestype = 'butikksjef_ledende' then
    return jsonb_build_object('status', 'skipped', 'reason', 'ledende stilling');
  end if;
  -- Ekstrahjelp has no stillingsprosent (PR #32) and is not compared.
  if w.ansettelsestype = 'tilkalling' then
    return jsonb_build_object('status', 'skipped', 'reason', 'ekstrahjelp har ingen stillingsprosent');
  end if;

  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  full_time := coalesce(settings.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  if w.timer_per_uke is not null then
    contracted := w.timer_per_uke;
  else
    contracted := full_time * (coalesce(w.employment_percentage, 100) / 100.0);
  end if;

  kind := 'merarbeid';
  if contracted + 0.01 >= full_time then
    return jsonb_build_object('status', 'skipped', 'reason', 'worker already full time');
  end if;

  periode := coalesce(nullif(btrim(settings.ekstrahjelp_periode), ''), 'maned');
  if periode <> 'uke' then
    month_start := date_trunc('month', p_date)::date;
    month_end := (month_start + interval '1 month' - interval '1 day')::date;
    month_days := (month_end - month_start) + 1;
    month_weeks := month_days / 7.0;

    select coalesce(sum(public.shift_hours(s.start_time, s.end_time, s.break_minutes)), 0),
           count(distinct s.date)::integer
      into month_hours, worked_days
    from public.shifts s
    where s.worker_id = p_worker_id
      and s.date >= month_start
      and s.date <= month_end
      and s.status is distinct from 'cancelled';

    if month_hours <= contracted * month_weeks + 0.01 then
      for open_row in
        select c.id, c.org_id, c.content_sha256
        from public.contracts c
        where c.worker_id = p_worker_id
          and c.generated_automatically
          and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
          and c.status in ('utkast', 'sendt', 'apnet')
          and c.metadata ->> 'periode' = 'maned'
          and c.start_date = month_start
          and c.end_date = month_end
      loop
        update public.contracts set status = 'trukket' where id = open_row.id;
        perform public.log_contract_event(open_row.id, open_row.org_id, 'trukket', null, 'system', null, null, '{}'::jsonb, open_row.content_sha256);
      end loop;
      return jsonb_build_object(
        'status', 'skipped',
        'reason', 'no overtime',
        'period', 'maned',
        'totalHours', month_hours,
        'contractedHours', contracted * month_weeks
      );
    end if;

    supplement_id := public.upsert_hour_supplement(
      p_worker_id, kind, month_start, month_end,
      month_hours, worked_days, month_weeks, contracted, true
    );
    return jsonb_build_object(
      'status', case when supplement_id is null then 'skipped' else 'updated' end,
      'period', 'maned',
      'contractId', supplement_id,
      'totalHours', month_hours,
      'contractedHours', contracted * month_weeks,
      'overtimeHours', month_hours - (contracted * month_weeks)
    );
  end if;

  window_start := (p_date - (extract(isodow from p_date)::integer - 1)) - 182;
  window_end := (p_date - (extract(isodow from p_date)::integer - 1)) + 182;
  cursor_week := window_start;
  while cursor_week <= window_end loop
    select coalesce(sum(public.shift_hours(s.start_time, s.end_time, s.break_minutes)), 0),
           count(distinct s.date)::integer
      into week_hours, week_days
    from public.shifts s
    where s.worker_id = p_worker_id
      and s.date >= cursor_week
      and s.date < cursor_week + 7
      and s.status is distinct from 'cancelled';
    weeks := weeks || jsonb_build_array(jsonb_build_object(
      'week_start', cursor_week,
      'week_end', cursor_week + 6,
      'hours', week_hours,
      'days', week_days,
      'exceeds', week_hours > contracted + 0.01
    ));
    cursor_week := cursor_week + 7;
  end loop;

  grp_start := null;
  for rec in
    select (value ->> 'week_start')::date as week_start,
           (value ->> 'week_end')::date as week_end,
           (value ->> 'hours')::double precision as hours,
           (value ->> 'days')::integer as days,
           (value ->> 'exceeds')::boolean as exceeds
    from jsonb_array_elements(weeks)
    order by 1
  loop
    if rec.exceeds then
      if grp_start is null or rec.week_start > prev + 7 then
        if grp_start is not null then
          supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted, false);
          if supplement_id is not null then
            touched := touched || supplement_id;
          end if;
        end if;
        grp_start := rec.week_start;
        grp_hours := 0;
        grp_days := 0;
        grp_weeks := 0;
      end if;
      grp_end := rec.week_end;
      grp_hours := grp_hours + rec.hours;
      grp_days := grp_days + rec.days;
      grp_weeks := grp_weeks + 1;
      prev := rec.week_start;
    elsif grp_start is not null then
      supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted, false);
      if supplement_id is not null then
        touched := touched || supplement_id;
      end if;
      grp_start := null;
    end if;
  end loop;
  if grp_start is not null then
    supplement_id := public.upsert_hour_supplement(p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks, contracted, false);
    if supplement_id is not null then
      touched := touched || supplement_id;
    end if;
  end if;

  for open_row in
    select c.id, c.org_id, c.content_sha256
    from public.contracts c
    where c.worker_id = p_worker_id
      and c.generated_automatically
      and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
      and c.status in ('utkast', 'sendt', 'apnet')
      and daterange(c.start_date, c.end_date, '[]') && daterange(window_start, window_end, '[]')
      and coalesce(c.metadata ->> 'periode', 'uke') is distinct from 'maned'
      and not (c.id = any (touched))
  loop
    update public.contracts set status = 'trukket' where id = open_row.id;
    perform public.log_contract_event(open_row.id, open_row.org_id, 'trukket', null, 'system', null, null, '{}'::jsonb, open_row.content_sha256);
  end loop;

  updated := coalesce(array_length(touched, 1), 0);
  return jsonb_build_object(
    'status', case when updated > 0 then 'updated' else 'skipped' end,
    'contractIds', to_jsonb(touched),
    'kind', kind,
    'period', 'uke',
    'count', updated
  );
end;
$$;

revoke all on function public.upsert_hour_supplement(text, text, date, date, double precision, integer, double precision, double precision, boolean) from public, anon, authenticated;
revoke all on function public.check_overtime_for_shift(text, date) from public, anon, authenticated;
grant execute on function public.check_overtime_for_shift(text, date) to service_role;
