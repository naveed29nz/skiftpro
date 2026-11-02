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
supabase functions deploy demo-switch --project-ref iobsolszrmigdmdydfbe
```

`demo-switch` is not deployed by a pull request. Run the command above only after the change is approved. It signs a Narvesen Demo AS role in without sending email. Hosted functions already have `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; this function needs no extra secret.

Hosted functions already receive `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set the public site URL so invite emails return to the app:

```bash
supabase secrets set SITE_URL=https://your-production-domain
```

| Base44 function | Edge function | Who can call it |
| --- | --- | --- |
| `generateContractPDF` | `generate-contract-pdf` | Anyone who can read that contract. Returns `application/pdf`. |
| `updateContractStatus` | `update-contract-status` | `send`: admin who can read wages, via `send_contract`. `approve`: always rejected. The employee signs with a one-time code in `sign-contract`. `reject`: only the employee. |
| `generateRecurringTasks` | `generate-recurring-tasks` | `profiles.role = admin`. Cron does not use HTTP; it calls the SQL function. |
| `checkOvertimeAndGenerateContract` | `check-overtime-and-generate-contract` | Any signed-in user. The shift trigger is what runs it in normal use. |
| `users.inviteUser` | `invite-user` | Managers and super-admins. |
| Demo-modus | `demo-switch` | A signed-in user in Narvesen Demo AS, or a platform super-admin. Target must be one of the five `@demo.skiftpro.invalid` accounts in that org. Returns a session. Sends no email. |

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

## 7. Digital employment contracts

Migrations `20261015120000_digital_contracts.sql` and `20261015120100_contract_template_seed.sql` are in the repo and are **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Do not run them until the templates have been read by the chain's HR or a lawyer. Deploy the new edge functions only after the migrations are applied, and do not deploy them as part of opening the pull request.

Apply, when you are ready:

```bash
supabase db push
```

or paste the two files into the SQL editor in order. The second file seeds six global templates (version 1): `fast`, `midlertidig_vikar`, `tilkalling_ramme`, `butikksjef_ledende`, `merarbeid`, `bilag`.

The migration creates a private `contracts` storage bucket when the `storage` schema exists. Confirm in Storage that the bucket is private. Signed PDFs are stored at `{org_id}/{worker_id}/{contract_id}.pdf`.

If the migration prints a notice that `pg_cron` is missing, schedule the reminder yourself after the functions are deployed:

```sql
select cron.schedule(
  'contract-signing-reminders',
  '0 6 * * *',
  $$select public.enqueue_contract_reminders()$$
);
```

The HTTP function `contract-reminders` does the same enqueue and, when `RESEND_API_KEY` is set, emails the employee. It does not replace the SQL schedule.

### Environment variables (edge functions, not Vite)

Leave these unset until you mean to use them. Do not commit secrets.

| Variable | Purpose |
| --- | --- |
| `SIGNING_PROVIDER` | `simple_otp` (default), `idura`, or `signicat`. BankID stays off until this matches the org setting and the secrets below exist. |
| `IDURA_CLIENT_ID` | Idura / Criipto client id. Not used yet. |
| `IDURA_CLIENT_SECRET` | Idura client secret. Not used yet. |
| `IDURA_WEBHOOK_SECRET` | Reserved for the Idura webhook. The webhook currently returns 501. |
| `SIGNICAT_CLIENT_ID` | Signicat client id. Not used yet. |
| `SIGNICAT_CLIENT_SECRET` | Signicat client secret. Not used yet. |
| `SIGNICAT_WEBHOOK_SECRET` | Reserved for the Signicat webhook. |
| `RESEND_API_KEY` | Sends the one-time code and the signed PDF. Without it, signing still works if `SIGNING_DEV_OTP=true` on a non-production project. |
| `RESEND_FROM_EMAIL` | From-address. Defaults to `SkiftPro <noreply@skiftpro.no>`. |
| `SIGNING_DEV_OTP` | `true` returns the code in the API response. Never set this in production. |

Do not request fødselsnummer from BankID unless a legal basis has been written down. The provider stubs store nothing today.

### What an admin does after the migration

1. Settings → Arbeidsgiver i avtalene: company name, org number, address, who signs, tariff, opening hours on the workplace card.
2. New employee → leave **Send arbeidsavtale til signering** checked, or preview first.
3. The employee opens Min side → Kontrakter → Les og signer, scrolls the frozen text, checks «Jeg har lest og godtar avtalen», and enters the e-mail code.
4. An admin countersigns from Kontrakter when the status is «Signert av ansatt».
5. Both parties then see the certificate. The PDF copy is emailed when Resend is configured.

A store manager sees status for their own store and does not see wages, birth date, contract text, or the PDF. `approve` on `update-contract-status` no longer records a manager as the employee.

## 8. Per-store workplace fields

Migration `20261016120000_store_workplace.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it only after `20261015120000_digital_contracts.sql` and `20261015120100_contract_template_seed.sql`. Do not deploy anything extra for this change; it is schema, template text, and the Settings form.

The migration adds `team1`–`team10` address, opening hours, an opening-hours summary, and notes. A contract uses the worker's first team. Empty address and opening hours fall back to the company-wide workplace. The summary is optional and is left out of the agreement when it is blank.

Until the migration is applied, the app still loads workplace settings. Saving a store address is stored only after the columns exist.

## 9. Company party and owner signature

Migration `20261016210000_employer_company_signatory.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it after `20261016120000_store_workplace.sql`.

The party at the top of the agreement is `organizations.name` and `organizations.org_number` from the customer card. Employer settings supply those values only when the card is empty. Apply the next migration as well. It replaces who appears on the signature line. The admin who countersigns is still stored in `contracts.employer_signed_by` and in `contract_events`.

## 10. Customer admin on the signature line

Migration `20261016220000_customer_admin_signatory.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it after `20261016210000_employer_company_signatory.sql`.

The customer card has **Signerer for arbeidsgiver**. The list is that customer's primary admin and department admins (`admin` / `sub_admin`). The default is the customer's primary admin (`admin_user_id`, then `admin_email`). The signature line is `For [selskap]: [navn]`, in this order: the chosen admin, the customer's primary admin, then `employer_settings.signatur_navn`. `organizations.contact_name` is not used. A platform super-admin, or an admin of another customer, is not used.

After both migrations are applied on the live project, set the signer for Butikkdrift Nas AS to Naveed Zafar. This update is not part of the migration. In Kundeoversikt, open Butikkdrift Nas AS, choose Naveed Zafar under Signerer for arbeidsgiver, and save. Or run this once, only if that profile is an admin of that customer:

```sql
update public.organizations o
set employer_signatory_user_id = p.id
from public.profiles p
where o.name = 'Butikkdrift Nas AS'
  and btrim(p.full_name) = 'Naveed Zafar'
  and public.customer_admin_name(o.id, p.id) = 'Naveed Zafar';
```

If the statement updates no row, link Naveed Zafar as that customer's admin before choosing him. Do not point the column at a platform super-admin or at another customer's admin.

## 11. Admin name on the customer card

Migration `20261016233000_customer_card_admin_name.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it after `20261016220000_customer_admin_signatory.sql`. Do not re-apply the earlier contract migrations.

The customer card has no admin-name field. `contact_name` is the contact person (for Butikkdrift Nas AS that value has been ZAS) and is not the signer. The new field is `organizations.admin_signerer_navn`, labeled **Admin / signerer (navn)**. An empty field is prefilled in the form from the selected admin. The signature line uses that card name, then the selected admin's profile name, then `employer_settings.signatur_navn`.

After this migration is applied, set the card name for Butikkdrift Nas AS. This update is not part of the migration:

```sql
update public.organizations
set admin_signerer_navn = 'Naveed Zafar'
where name = 'Butikkdrift Nas AS';
```

## 12. Store address and signing emails

Migration `20261016240000_store_address_and_contract_mail.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it after `20261016233000_customer_card_admin_name.sql`. Do not re-apply the earlier contract migrations. Do not deploy the edge functions until this migration is applied, and do not deploy them just to open the pull request.

`{{adresse}}` (Arbeidsgivers adresse) is the address of the worker's first store (`team1_address` … `team10_address`). `employer_settings.adresse` is used only when that store address is empty. The company name, the contact name, and the workplace name are not this address. An empty settings address no longer blocks the contract when the store has an address. The company name and organization number at the top stay on the customer card.

Sending a contract (`Send avtale`, `Send til signering`, or `Send arbeidsavtale til signering`) emails the employee from `RESEND_FROM_EMAIL`. The link is `https://skiftpro.com/signer/<avtale>?tilgang=<token>`. The token is stored only as a SHA-256 hash and is valid until the signing deadline. Opening the link does not sign the contract. The employee still requests a one-time code, which is sent to the email on the contract, and the signature is recorded only when that code is entered. No user account is created. An employee who already has an account can still sign while logged in; the link works without one.

The customer card field **Kopi av signerte avtaler til** is `organizations.signert_kopi_epost`. When both parties have signed, the PDF is emailed to the employee and to that address. An empty field uses `admin_email`, then `contact_email`. If that address is the same as the employee's, one email is sent.

The Norwegian subjects and bodies live in `supabase/functions/_shared/contractEmails.js`. Edit that file before any send. Nothing in this migration emails existing employees. `contracts.signing_email_sent_at` stays null until a send after the migration claims it, and reminder emails are skipped while it is null. There is no backfill.

## 13. Deleting a contract revokes the signing link

Migration `20261016245000_contract_delete_revoke_tokens.sql` is applied to the live project `iobsolszrmigdmdydfbe` with pull request 12 (`18b8552`). Do not re-apply it. It follows `20261016240000_store_address_and_contract_mail.sql`. No edge function changes with this migration.

`DELETE` on `contracts` as `authenticated` fails when the statement uses `RETURNING *`, because table-level `SELECT` is revoked. The row stays. The app now deletes without asking for the row back. A sent contract, including one the employee has already signed (`signert_ansatt`), can still be withdrawn. A fully signed contract (`signert`) stays blocked.

The delete trigger is `security definer`. It sets `contract_access_tokens.revoked_at` and consumes unused `contract_otp` rows. It does not delete `contract_events`. After the row is gone, the signing link no longer opens the contract.

## 14. Countersigner on the certificate

Migration `20261016250000_countersigner_identity.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. Apply it after `20261016245000_contract_delete_revoke_tokens.sql`, which is already live. Do not re-apply the earlier contract migrations, and do not rewrite contracts that are already signed.

After an admin countersigns, SkiftPro returns to Kontrakter and shows the toast «Avtalen er signert av begge parter». The contract list is where that agreement is viewed and downloaded.

`contracts.employer_signed_by` remains the countersigning admin's user id. The `motsignert` event also stores that id plus the admin's name and email from `profiles` at the moment of signing. The in-app Signeringsbevis shows all three. The contract PDF keeps a short electronic signature line and uses that admin's name on the employer line. A separate signeringsbevis download keeps the full identity and the event log. This migration does not backfill an already countersigned contract. Redeploy `sign-contract` and `generate-contract-pdf` after the migration so new files include the name and email. The redirect itself is in the web app.

## 15. Contract text version 2 and fødselsnummer

Migration `20261016260000_contract_text_and_fodselsnummer.sql` is in the repo and is **not** applied to the live project `iobsolszrmigdmdydfbe` by this change. `20261016245000` is already live. `20261016250000` and `20261016260000` are not.

Apply order:

1. `20261016240000_store_address_and_contract_mail.sql` is already live.
2. `20261016245000_contract_delete_revoke_tokens.sql` is already live with pull request 12.
3. `20261016250000_countersigner_identity.sql` (this pull request).
4. `20261016260000_contract_text_and_fodselsnummer.sql` (this pull request). It does not depend on `20261016245000`.

Redeploy `sign-contract` and `generate-contract-pdf` after `20261016250000` and `20261016260000`. Do not deploy them only to open the pull request. Already emailed PDFs stay as they were sent. There is no backfill of contract `6d36da3c-c98e-4d8d-a35c-ac957a6ca62b`.

Version 2 replaces the active text for `fast`, `midlertidig_vikar`, `tilkalling_ramme`, `butikksjef_ledende`, and `bilag`. Version 1 of those keys stays in the table and is inactive. `merarbeid` version 1 stays active. New contracts use the active template. A contract that already has `body_snapshot` keeps that text and its `template_version`.

`workers.fodselsnummer` is `bytea`, encrypted with a key that lives only in `private.sensitive_keys`. The column is not in the SELECT grant. Super-admin and department admins read it through `worker_fodselsnummer` and write it through `set_worker_fodselsnummer`. Lists use `worker_fodselsnummer_masks` (seven bullets and the last four digits). The employee does not get the number from those functions. `contract_field_values` returns the digits for the contract text and is not executable by `authenticated`. The number is printed on the contract PDF because the agreement requires it. It is not added to email subjects, email bodies, or event payloads.

