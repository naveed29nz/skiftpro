# SkiftPro: Base44 to Supabase

Phase 1 replaces the Base44 client, database, and backend functions with Supabase (project `iobsolszrmigdmdydfbe`, region `eu-central-1`) and prepares the Vite app for Vercel. The live database was **not** changed by this work. There is no service-role key in the repo. You apply the migrations and deploy the functions yourself.

## What landed in the repo

- `supabase/migrations/` — tables for every Base44 entity, with `id`, `created_date`, `updated_date`, and `created_by`. Row Level Security isolates rows by organization and follows the roles the app already uses.
- `src/api/base44Client.js` — same calls the pages already make (`entities.*.list/filter/get/create/update/delete`, `bulkCreate`, `bulkUpdate`, `updateMany`, `auth.me`, `auth.logout`, `users.inviteUser`, `functions.invoke`, `integrations.Core.UploadFile`), implemented with Supabase.
- `supabase/functions/` — the four Base44 functions, plus `invite-user`.
- A `pg_cron` job and a shift trigger for the two Base44 workflows.
- `vercel.json` SPA rewrite. The `@base44/vite-plugin` dependency is gone, so `npm run build` does not talk to Base44.
- `scripts/import-base44.mjs` — export from Base44 and import into Supabase.

`User` is `public.profiles`. The profile id is `auth.users.id` as text. Other entity ids stay text so a Base44 id can be inserted unchanged.

## Roles

| App idea | How it is stored |
| --- | --- |
| Worker | `profiles.role = 'user'` |
| Butikksjef / sub-admin | `profiles.role` of `butikksjef` or `sub_admin` |
| Organization admin | `profiles.role = 'admin'` and the user is `organizations.admin_user_id` or `admin_email` |
| Super-admin | `profiles.role = 'admin'` and the user is **not** linked to any organization |

That matches the current UI: a platform admin with no organization sees every customer; linking them to an organization (or matching `admin_email`) scopes them to that customer. Impersonation remains a browser filter (`localStorage.impersonate_org_id`). The database still treats that person as a super-admin, and the screens filter to the chosen organization.

Managers (`admin`, `sub_admin`, `butikksjef`) write shifts, workers, settings, contracts, and budgets in their organization. Workers read that organization and can stamp, set availability, complete tasks, file a dagsoppgjør, and respond to shift swaps. Contract approve/reject from a worker goes through the `update-contract-status` function, which checks the caller and then writes with the service role.

## 1. Apply the database migrations

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this repository:

```bash
supabase login
supabase link --project-ref iobsolszrmigdmdydfbe
supabase db push
```

`db push` runs, in order:

1. `20261012180000_schema.sql` — tables and indexes
2. `20261012180100_rls.sql` — helpers, auth triggers, RLS
3. `20261012180200_jobs_and_storage.sql` — overtime trigger, recurring-task function, cron schedule, `uploads` bucket

You can paste the same files into the Supabase SQL editor if you prefer not to use the CLI. Run them in that order, once.

`20261012180100_rls.sql` aliases `user_org_ids()` and `my_worker_ids()` as `ids(user_org_ids)` and `ids(my_worker_ids)`. A bare `ids` alias names the column `ids`, and `supabase db reset` then fails with `column ids.user_org_ids does not exist`. The live project already has these migrations applied, so this file change is for the next fresh reset only. Do not re-apply it to the live database.

### If the cron job was not scheduled

`pg_cron` has to be enabled for the project (Database → Extensions → `pg_cron`). The migration catches a missing extension and prints a notice instead of failing the schema. After enabling it, run:

```sql
select cron.schedule(
  'generate-recurring-tasks-daily',
  '0 4 * * *',
  $$select public.generate_recurring_tasks()$$
);
```

Confirm:

```sql
select jobid, jobname, schedule, command from cron.job;
```

The schedule is 04:00 UTC, the same as the Base44 workflow "Generer faste oppgaver daglig". The function uses the calendar date in `Europe/Oslo`. It creates a task from each active `recurring_tasks` row (daily, weekly, biweekly, monthly) and skips a title that already exists for that organization today.

The overtime workflow is a trigger, not cron. After a shift insert or a change to worker, date, times, break, or status, `check_overtime_for_shift` creates or updates an `ekstrahjelp` contract when a part-time worker's week exceeds their percentage of the organization's `full_time_hours_per_week` (default 37.5). A failure in that function does not roll back the shift. The full-time hours come from the worker's organization, not from the first workplace row in the whole database.

## 2. Deploy Edge Functions

From the linked project:

```bash
supabase functions deploy generate-contract-pdf
supabase functions deploy update-contract-status
supabase functions deploy generate-recurring-tasks
supabase functions deploy check-overtime-and-generate-contract
supabase functions deploy invite-user
```

Hosted functions already receive `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set the public site URL so invite emails return to the app:

```bash
supabase secrets set SITE_URL=https://your-production-domain
```

| Base44 function | Edge function | Who can call it |
| --- | --- | --- |
| `generateContractPDF` | `generate-contract-pdf` | Anyone who can read that contract. Returns `application/pdf`. |
| `updateContractStatus` | `update-contract-status` | `send`: manager of the org. `approve` / `reject`: that worker or a manager. |
| `generateRecurringTasks` | `generate-recurring-tasks` | `profiles.role = admin`. Cron does not use HTTP; it calls the SQL function. |
| `checkOvertimeAndGenerateContract` | `check-overtime-and-generate-contract` | Any signed-in user. The shift trigger is what runs it in normal use. |
| `users.inviteUser` | `invite-user` | Managers and super-admins. |

The browser client maps the old function names, so `Contracts.jsx` and `WorkerContractsTab.jsx` are unchanged.

## 3. Auth settings (dashboard)

In Authentication → URL configuration:

- Site URL: the Vercel URL (and `http://localhost:5173` while developing)
- Redirect URLs: `http://localhost:5173/login`, `http://localhost:5173/reset-password`, and the same two paths on the production domain (`https://your-production-domain/login` and `https://your-production-domain/reset-password`)

Leave public sign-up off if accounts should only be created by invite or by the import script. The login screen at `/login` is email and password, plus **Glemt passord**. There is no public registration form.

**Glemt passord** and invite emails return to `/reset-password`. That screen (`Sett nytt passord`) calls `supabase.auth.updateUser({ password })` and then opens the app with the same session. Add `/reset-password` in Authentication → URL configuration or Supabase rejects the link. This repository does not change the live Auth settings; add the URL in the dashboard. Redeploy the `invite-user` function so new invites use that redirect.

Create the first super-admin in Authentication → Users, then:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

Do not set `organizations.admin_user_id` or `admin_email` to that person. As soon as they are linked to an organization they become a normal organization admin and lose the cross-tenant view.

Inviting a store admin (`invite-user` with role `admin`, and `organizations.admin_email` set to them) lets them sign in and be linked on first load. The layout updates `admin_user_id` when the email matches.

## 4. Environment variables

Copy `.env.example` to `.env.local` for Vite. Both values are public client config:

```bash
VITE_SUPABASE_URL=https://iobsolszrmigdmdydfbe.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_ltaNA7nnVozoSCOcZIjg
```

The publishable key is the anon key. It is safe in the browser because RLS is on. **Do not** create a `VITE_` variable for the service-role key, and do not commit that key.

On Vercel, set the same two `VITE_` variables for Production and Preview, then redeploy. `vercel.json` rewrites every non-file path to `index.html`, which is what the React Router screens need.

Local:

```bash
npm install
npm run dev
```

## 5. Move data from Base44

Do this after the migrations are applied. Take a fresh export immediately before cutover; the import upserts on `id` and can be run again.

### Export

In the browser session of the Base44 app, copy the access token (the app stores it as `base44_access_token` or `token`). Then:

```bash
export BASE44_APP_ID=your_base44_app_id
export BASE44_ACCESS_TOKEN=your_user_access_token
# optional: export BASE44_SERVER_URL=https://base44.app

node scripts/import-base44.mjs --from-api --save ./data/base44
```

That writes one JSON file per entity (`User.json`, `Worker.json`, …) under `./data/base44`. `./data` is gitignored. The script pages `GET /api/apps/{appId}/entities/{Name}` with the Bearer token and `X-App-Id` header.

If the API shape differs, export each entity from the Base44 dashboard as JSON and save it under those file names. The importer accepts a bare array or `{ items | data | results: [...] }`.

### Import

```bash
export SUPABASE_URL=https://iobsolszrmigdmdydfbe.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # local shell only
export SITE_URL=https://your-production-domain           # only with --invite

node scripts/import-base44.mjs --from-dir ./data/base44 --dry-run
node scripts/import-base44.mjs --from-dir ./data/base44
```

What the script does:

1. Creates a Supabase Auth user for each Base44 user email (`email_confirm` on, random password that is not stored). Use **Glemt passord** on `/login` so each person sets a password on `/reset-password`. Pass `--invite` instead if you want Supabase to email an invite link to the same screen.
2. Copies `role` and `full_name` onto `profiles`.
3. Remembers old user id → new auth id.
4. Upserts every other entity. `id` is kept. `created_by` and `organizations.admin_user_id` are rewritten when they point at an old user id. Worker and shift ids are not rewritten; workers are matched to logins by email.
5. Turns `''` into null for date and timestamp columns.

Run the import with the service role so RLS does not block the load. After it finishes, sign in as the super-admin and confirm organization counts, a week of shifts, and one contract PDF.

### Suggested order on cutover day

1. `supabase db push` and function deploy on an empty project (already done if you followed sections 1–2).
2. Export Base44.
3. Import.
4. Point the Vercel project at this branch and set the two `VITE_` variables.
5. Sign in, invite one manager, stamp in, publish a shift, download a contract.
6. Leave Base44 read-only. Re-running the import upserts by id, so a second export can pick up rows created during the overlap. Auth users are matched by email and are not duplicated.

## 6. Smoke checks

- Super-admin with no organization link can open `/SuperAdmin` and sees every organization.
- An organization admin sees only their workers and shifts.
- A worker can open Min Portal, stamp, and set availability, and cannot open the timesheet editor.
- Publishing shifts (`updateMany`) and copying a week (`bulkCreate`) succeed.
- Saving a shift for a part-time worker over their percentage creates an `ekstrahjelp` contract in status `utkast`.
- `select public.generate_recurring_tasks();` inserts today's tasks and a second call inserts nothing.
- Uploading a task image returns a public URL under the `uploads` bucket, path `{auth user id}/...`.

## Notes

- The original `base44/` export stays in the repo as the schema and function reference. The running app does not import `@base44/sdk`.
- `src/pages/OAuthConsent.jsx` is the Base44 MCP consent screen. It is not routed. Supabase Auth does not use it.
- Empty-string dates from the old client are stored as null. Responses still include `id`, `_id`, and `created_by_id` (alias of `created_by`) so existing screens keep working.
- While a super-admin is impersonating an organization, creates that omit `org_id` (for example a new holiday) are stamped with `localStorage.impersonate_org_id`. The database still authorizes them as a super-admin.
- The `uploads` bucket is public-read so `<img src={file_url}>` works. Only the signed-in user can write into their own folder.
