# Backup og gjenoppretting

Nattlig kopi kjøres av GitHub Actions (`.github/workflows/db-backup.yml`). Den tar en logisk dump av produksjon, krypterer den, og lagrer filen som et workflow-artifact i 30 dager. Det koster ikke ekstra hos GitHub.

Klokken er 01:00 UTC. Det er 02:00 i Norge om vinteren og 03:00 om sommeren. GitHub kan ikke følge sommertid. Du kan også starte jobben for hånd under Actions → Database backup → Run workflow.

## Hemmeligheter i GitHub

Legg disse under **GitHub-repoet → Settings → Secrets and variables → Actions → New repository secret**. Ikke legg dem i Vercel, ikke i `.env`, og ikke i chatten.

| Navn | Hva det er |
|---|---|
| `SUPABASE_DB_URL` | Session pooler-URI til **produksjon**, med passord. |
| `BACKUP_PASSPHRASE` | Et langt passord du finner på selv. Samme passord brukes til å dekryptere. Mister du det, er filene uleselige. |

Jobben feiler med en tydelig feil hvis en av dem mangler.

### Hvor du finner database-URLen

1. Åpne [Supabase Dashboard](https://supabase.com/dashboard) og prosjektet `iobsolszrmigdmdydfbe`.
2. **Connect** (eller Project Settings → Database).
3. Velg **Session pooler**, ikke Transaction pooler. `pg_dump` virker ikke mot transaksjons-porten `6543`.
4. Kopier URI-en. Den ser omtrent slik ut:

```text
postgresql://postgres.iobsolszrmigdmdydfbe:[PASSORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

5. Bytt ut `[PASSORD]` med database-passordet (Project Settings → Database → Database password). Reset passordet der hvis du ikke har det. Det er ikke anon-nøkkelen.
6. Lim hele URI-en inn som `SUPABASE_DB_URL`.

Brukeren må kunne lese `public` og `auth.users` / `auth.identities`. Rollen `postgres` kan det.

## Hva som ligger i filen

`backup.tar.gpg` er en tar-fil kryptert med GPG (AES-256, symmetrisk). Inni ligger to custom-format-dumper fra `pg_dump -Fc`:

- `public.dump` — schema og data i `public`
- `auth-users.dump` — schema og data for `auth.users` og `auth.identities`

Eiere og GRANT-er er ikke med (`--no-owner --no-privileges`), så filen kan leses inn i en tom database.

## Last ned

1. Actions → Database backup → den grønne kjøringen.
2. Artifacts → `db-backup-<run id>` → last ned zip-en.
3. Pakk ut. Du skal ha `backup.tar.gpg`.

## Dekrypter

```bash
gpg --batch --yes --pinentry-mode loopback \
  --decrypt --passphrase 'PASSET-DITT' \
  -o backup.tar backup.tar.gpg
tar -xf backup.tar
```

Du skal nå ha `public.dump` og `auth-users.dump`.

## Les inn i en tom, lokal Postgres

Ikke kjør dette mot produksjon.

```bash
createdb skiftpro_restore
pg_restore --no-owner --no-privileges --dbname=skiftpro_restore public.dump
pg_restore --no-owner --no-privileges --dbname=skiftpro_restore auth-users.dump
```

`pg_restore` kan klage på extensions eller roller som ikke finnes lokalt (`pg_cron`, `supabase_admin`). Les feilene. Dataene i `public` og de to auth-tabellene skal likevel ligge der hvis kommandoen ikke stoppet på den første feilen. Legg på `--exit-on-error` når du vil at en feil skal stoppe innlesingen.

Auth-brukere i en lokal database logger ikke inn av seg selv. Supabase Auth på den hostede tjenesten er ikke erstattet av denne filen før noen bevisst restaurerer dit.

## Test at kopien kan leses

Gjør dette minst én gang, og igjen etter store migreringer.

```bash
psql skiftpro_restore -c "select count(*) as workers from public.workers;"
psql skiftpro_restore -c "select count(*) as shifts from public.shifts;"
psql skiftpro_restore -c "select count(*) as users from auth.users;"
```

Tallene skal ligne det du ser i dashbordet. Hvis `workers` er 0 og du vet at det finnes ansatte, er kopien ikke brukbar.

## Det denne kopien ikke er

Artifactet lever i 30 dager og forsvinner. Last ned en fil og legg den et annet sted hvis du trenger lengre historikk. Dette er ikke point-in-time recovery. Supabase Pro kan ta daglige kopier i tillegg senere.
