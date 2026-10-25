-- Extra hours are evaluated per calendar month by default.
-- employer_settings.ekstratimer_periode is 'maaned' or 'uke'.
-- Existing contracts are not deleted or rewritten by this migration.
-- A monthly agreement is stored as utkast and is not sent to the employee.

alter table public.employer_settings
  add column if not exists ekstratimer_periode text not null default 'maaned';

alter table public.employer_settings
  drop constraint if exists employer_settings_ekstratimer_periode_check;

alter table public.employer_settings
  add constraint employer_settings_ekstratimer_periode_check
  check (ekstratimer_periode in ('uke', 'maaned'));

comment on column public.employer_settings.ekstratimer_periode is
  'uke evaluates each week. maaned (default) compares the whole calendar month and creates one draft only when the month exceeds contracted hours.';

-- New signature: weeks are fractional (days in the month / 7), monthly calls
-- pass p_allow_send false and p_exact_period true. The previous integer
-- signature stays until check_overtime_for_shift points at this one.
drop function if exists public.upsert_hour_supplement(
  text, text, date, date, double precision, integer, double precision, double precision, boolean, boolean
);

create function public.upsert_hour_supplement(
  p_worker_id text,
  p_kind text,
  p_start date,
  p_end date,
  p_hours double precision,
  p_days integer,
  p_weeks double precision,
  p_contracted_weekly double precision,
  p_allow_send boolean default true,
  p_exact_period boolean default false
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
  new_status text;
  content_hash text;
  avg_day double precision;
  avg_week double precision;
  agreed double precision;
  extra_hours double precision;
  template_key text;
begin
  select * into w from public.workers where id = p_worker_id;
  if not found then
    return null;
  end if;
  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  template_key := case when p_kind = 'bilag' then 'bilag' else 'merarbeid' end;
  select * into tpl
  from public.contract_templates t
  where t.key = template_key and t.org_id is null and t.is_active
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
  agreed := coalesce(p_contracted_weekly, 0) * greatest(p_weeks, 1);
  extra_hours := greatest(p_hours - agreed, 0);

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

  select * into existing
  from public.contracts c
  where c.worker_id = p_worker_id
    and c.contract_type in ('merarbeid', 'bilag', 'ekstrahjelp')
    and c.generated_automatically
    and c.status in ('utkast', 'sendt', 'apnet')
    and case
      when p_exact_period then
        c.start_date = p_start
        and c.end_date = p_end
        and coalesce(c.metadata ->> 'periode', '') = 'maaned'
      else
        coalesce(c.metadata ->> 'periode', '') is distinct from 'maaned'
        and daterange(c.start_date, c.end_date, '[]') && daterange(p_start, p_end, '[]')
    end
  order by c.created_date
  limit 1;

  if found then
    if existing.body_snapshot is not distinct from body
       and existing.start_date is not distinct from p_start
       and existing.end_date is not distinct from p_end
       and existing.weekly_hours is not distinct from round(avg_week::numeric, 2)::double precision then
      return existing.id;
    end if;
    update public.contracts
      set contract_type = p_kind,
          template_key = template_key,
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
          metadata = case
            when p_exact_period then coalesce(metadata, '{}'::jsonb) || '{"periode":"maaned"}'::jsonb
            else metadata
          end
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

  new_status := case
    when coalesce(p_allow_send, true) and coalesce(settings.send_tilleggsavtaler_automatisk, false) then 'sendt'
    else 'utkast'
  end;
  new_id := gen_random_uuid()::text;
  insert into public.contracts (
    id, org_id, worker_id, worker_name, contract_type, status, org_name,
    worker_position, hourly_rate, employment_percentage, weekly_hours, overtime_hours,
    full_time_hours_per_week, start_date, end_date, week_number, year, reason,
    template_key, template_version, body_snapshot, field_values, metadata,
    contract_kind, parent_contract_id, content_sha256, signing_provider,
    sent_at, expires_at, generated_automatically, created_by
  ) values (
    new_id, w.org_id, w.id, w.name, p_kind, new_status, fields ->> 'selskap',
    fields ->> 'stilling', w.hourly_rate, w.employment_percentage,
    round(avg_week::numeric, 2)::double precision,
    round(extra_hours::numeric, 2)::double precision,
    coalesce(settings.alminnelig_ukentlig_arbeidstid, 37.5),
    p_start, p_end, to_char(p_start, 'IW')::integer, extract(isoyear from p_start)::integer,
    case when p_kind = 'bilag' then coalesce(settings.tilkalling_grunnlag, 'vikar') else 'sesong' end,
    template_key, tpl.version, body, fields,
    case when p_exact_period then '{"periode":"maaned"}'::jsonb else '{}'::jsonb end,
    p_kind, parent_id, content_hash, 'simple_otp',
    case when new_status = 'sendt' then now() else null end,
    case when new_status = 'sendt' then now() + make_interval(days => coalesce(settings.signering_frist_dager, 14)) else null end,
    true, 'system'
  );
  perform public.log_contract_event(new_id, w.org_id, 'opprettet', null, 'system', null, null, '{}'::jsonb, content_hash);
  if new_status = 'sendt' then
    perform public.log_contract_event(new_id, w.org_id, 'sendt', null, 'system', null, null, '{}'::jsonb, content_hash);
    perform public.enqueue_notification(
      public.profile_id_for_worker(w.id), w.org_id, 'contract_sent',
      'Avtale til signering',
      'Du har en avtale for perioden ' || to_char(p_start, 'DD.MM.YYYY') || '–' || to_char(p_end, 'DD.MM.YYYY') || ' som venter på signering.'
    );
  end if;
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
  kind text;
  period_choice text;
  month_start date;
  month_end date;
  month_weeks double precision;
  month_hours double precision;
  month_days integer;
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

  select * into settings from public.employer_settings where org_id = w.org_id limit 1;
  select * into ws from public.workplace_settings where org_id = w.org_id order by created_date limit 1;
  full_time := coalesce(settings.alminnelig_ukentlig_arbeidstid, ws.full_time_hours_per_week, 37.5);
  if w.timer_per_uke is not null then
    contracted := w.timer_per_uke;
  else
    contracted := full_time * (coalesce(w.employment_percentage, 100) / 100.0);
  end if;

  if w.ansettelsestype = 'tilkalling' then
    kind := 'bilag';
    contracted := 0;
    if not exists (
      select 1 from public.contracts c
      where c.worker_id = w.id and c.template_key = 'tilkalling_ramme' and c.status = 'signert'
    ) then
      return jsonb_build_object('status', 'skipped', 'reason', 'rammeavtale ikke signert');
    end if;
  else
    kind := 'merarbeid';
    if contracted + 0.01 >= full_time then
      return jsonb_build_object('status', 'skipped', 'reason', 'worker already full time');
    end if;
  end if;

  period_choice := lower(btrim(coalesce(settings.ekstratimer_periode, 'maaned')));
  if period_choice is distinct from 'uke' then
    month_start := date_trunc('month', p_date)::date;
    month_end := (month_start + interval '1 month' - interval '1 day')::date;
    month_weeks := ((month_end - month_start) + 1)::double precision / 7.0;

    select coalesce(sum(public.shift_hours(s.start_time, s.end_time, s.break_minutes)), 0),
           count(distinct s.date)::integer
      into month_hours, month_days
    from public.shifts s
    where s.worker_id = p_worker_id
      and s.date >= month_start
      and s.date <= month_end
      and s.status is distinct from 'cancelled';

    if (kind = 'bilag' and month_hours > 0)
       or (kind <> 'bilag' and month_hours > contracted * month_weeks + 0.01) then
      supplement_id := public.upsert_hour_supplement(
        p_worker_id, kind, month_start, month_end, month_hours, month_days,
        month_weeks, contracted, false, true
      );
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
        and c.start_date = month_start
        and c.end_date = month_end
        and coalesce(c.metadata ->> 'periode', '') = 'maaned'
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
      'count', updated,
      'period', 'maaned'
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
      'exceeds', case when kind = 'bilag' then week_hours > 0 else week_hours > contracted + 0.01 end
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
          supplement_id := public.upsert_hour_supplement(
            p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks::double precision, contracted, true, false
          );
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
      supplement_id := public.upsert_hour_supplement(
        p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks::double precision, contracted, true, false
      );
      if supplement_id is not null then
        touched := touched || supplement_id;
      end if;
      grp_start := null;
    end if;
  end loop;
  if grp_start is not null then
    supplement_id := public.upsert_hour_supplement(
      p_worker_id, kind, grp_start, grp_end, grp_hours, grp_days, grp_weeks::double precision, contracted, true, false
    );
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
      and coalesce(c.metadata ->> 'periode', '') is distinct from 'maaned'
      and daterange(c.start_date, c.end_date, '[]') && daterange(window_start, window_end, '[]')
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
    'count', updated,
    'period', 'uke'
  );
end;
$$;

drop function if exists public.upsert_hour_supplement(
  text, text, date, date, double precision, integer, integer, double precision
);

revoke all on function public.upsert_hour_supplement(
  text, text, date, date, double precision, integer, double precision, double precision, boolean, boolean
) from public;
