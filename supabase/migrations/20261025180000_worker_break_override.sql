-- Optional personal break rule on the employee.
-- When both columns are set, they replace the department auto-break rules
-- (workplace_settings.teamN_auto_break and teamN_break_rules) for that employee.
-- Null leaves the department rule in place. Existing shifts are not rewritten.
-- A shift with break_manual still uses its own break_minutes.
-- NOT APPLIED to production by this change.

alter table public.workers
  add column if not exists break_after_hours double precision,
  add column if not exists break_length_minutes integer;

alter table public.workers drop constraint if exists workers_break_override_check;
alter table public.workers
  add constraint workers_break_override_check check (
    (break_after_hours is null and break_length_minutes is null)
    or (
      break_after_hours is not null
      and break_length_minutes is not null
      and break_after_hours > 0
      and break_length_minutes >= 0
    )
  );

comment on column public.workers.break_after_hours is
  'Hours the shift must exceed before the personal unpaid break applies. Null keeps the department rule.';
comment on column public.workers.break_length_minutes is
  'Unpaid break in minutes for the personal rule. Set together with break_after_hours. 0 turns automatic break off for this employee.';

grant select (break_after_hours, break_length_minutes) on table public.workers to authenticated, anon;
