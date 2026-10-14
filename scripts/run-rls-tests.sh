#!/usr/bin/env bash
# Throwaway Postgres for RLS isolation tests. Never uses the hosted database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="skiftpro_rls_test"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGUSER="${PGUSER:-postgres}"

psql -d postgres -v ON_ERROR_STOP=1 <<SQL
select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid();
drop database if exists ${DB_NAME};
create database ${DB_NAME};
SQL

psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') = '' then null
    else (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
  end
$$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
SQL

psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261012180000_schema.sql"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261012180100_rls.sql"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261013210000_hide_wage_columns.sql"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261014100000_wage_column_grants.sql"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261014120000_prelaunch_security.sql"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls_isolation.sql" | tee /tmp/rls-test.out
if grep -E 'FAIL|[[:space:]]+[1-9][0-9]* \|[[:space:]]+[0-9]+' /tmp/rls-test.out | head -n 1 | grep -q FAIL; then
  echo "RLS tests failed" >&2
  exit 1
fi
if ! grep -q ' 0 |' /tmp/rls-test.out && ! grep -q '| 0 |' /tmp/rls-test.out; then
  echo "RLS summary missing a zero failure count" >&2
  exit 1
fi
