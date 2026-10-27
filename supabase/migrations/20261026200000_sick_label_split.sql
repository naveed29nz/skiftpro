-- Egenmelding (sick_self) and sykmelding (sick_doctor).
-- Legacy shift_label 'sick' stays valid so existing rows need no rewrite.
-- NOT APPLIED to the live database by this change. Run it in the Supabase SQL
-- editor or via the migration pipeline before the new labels are saved.

alter table public.shifts drop constraint if exists shifts_label_check;
alter table public.shifts add constraint shifts_label_check check (
  shift_label is null or shift_label in (
    'morning', 'evening', 'middle', 'sick', 'sick_self', 'sick_doctor', 'ferie', ''
  )
);

-- Absence notifications for the two new sick labels. Legacy sick stays
-- "Fravær registrert". This does not send email.
create or replace function public.notify_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  title text;
  body text;
begin
  if tg_op = 'UPDATE'
     and new.worker_id is not distinct from old.worker_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.shift_label is not distinct from old.shift_label
     and new.status is not distinct from old.status
     and new.all_day is not distinct from old.all_day then
    return new;
  end if;

  if new.shift_label in ('sick', 'sick_self', 'sick_doctor', 'ferie')
     and (tg_op = 'INSERT' or old.shift_label is distinct from new.shift_label) then
    kind := 'absence';
    title := case new.shift_label
      when 'ferie' then 'Ferie registrert'
      when 'sick_self' then 'Egenmelding registrert'
      when 'sick_doctor' then 'Sykmelding registrert'
      else 'Fravær registrert'
    end;
  elsif tg_op = 'INSERT' then
    kind := 'shift';
    title := 'Ny vakt';
  else
    kind := 'shift';
    title := 'Vakt endret';
  end if;

  body := case
    when new.all_day then new.date::text || ' hele dagen'
    else new.date::text || ' ' || new.start_time || '–' || new.end_time
  end;

  perform public.enqueue_notification(
    public.profile_id_for_worker(new.worker_id),
    new.org_id,
    kind,
    title,
    body
  );
  return new;
end;
$$;
