#!/usr/bin/env bash
# Nightly logical backup of the hosted database.
# Reads SUPABASE_DB_URL and BACKUP_PASSPHRASE from the environment.
# Writes an encrypted archive to the path in BACKUP_OUTPUT (default ./backup.tar.gpg).
# Does not print the database URL or the passphrase.
set -euo pipefail

missing=0
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::error::Missing secret SUPABASE_DB_URL. Add it under GitHub → Settings → Secrets and variables → Actions." >&2
  missing=1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "::error::Missing secret BACKUP_PASSPHRASE. Add a long passphrase under GitHub → Settings → Secrets and variables → Actions." >&2
  missing=1
fi
if [ "$missing" -ne 0 ]; then
  exit 1
fi

command -v pg_dump >/dev/null 2>&1 || { echo "::error::pg_dump is not installed" >&2; exit 1; }
command -v gpg >/dev/null 2>&1 || { echo "::error::gpg is not installed" >&2; exit 1; }

root="$(cd "$(dirname "$0")/.." && pwd)"
work="${BACKUP_WORKDIR:-$(mktemp -d)}"
out="${BACKUP_OUTPUT:-$root/backup.tar.gpg}"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT

echo "Dumping public schema and auth.users / auth.identities (custom format)."
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="$work/public.dump"

pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --table=auth.users \
  --table=auth.identities \
  --file="$work/auth-users.dump"

if [ ! -s "$work/public.dump" ] || [ ! -s "$work/auth-users.dump" ]; then
  echo "::error::pg_dump wrote an empty file" >&2
  exit 1
fi

tar -C "$work" -cf "$work/backup.tar" public.dump auth-users.dump
gpg --batch --yes --pinentry-mode loopback \
  --symmetric --cipher-algo AES256 \
  --passphrase-fd 3 \
  -o "$out" "$work/backup.tar" 3<<<"$BACKUP_PASSPHRASE"

if [ ! -s "$out" ]; then
  echo "::error::Encrypted backup is empty" >&2
  exit 1
fi

echo "Encrypted backup written ($(wc -c < "$out") bytes)."
