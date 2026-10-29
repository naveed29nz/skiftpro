-- Legacy availability rows without org_id are invisible in the org-scoped
-- vaktplan (managers filter by org_id). Backfill from the worker's org.
update public.availability a
   set org_id = w.org_id
  from public.workers w
 where w.id = a.worker_id
   and (a.org_id is null or btrim(a.org_id) = '')
   and w.org_id is not null;
