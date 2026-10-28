#!/usr/bin/env bash
# Apply every file in supabase/migrations to an empty Supabase project.
# Set DATABASE_URL to that project's session pooler (port 5432).
# Refuses the production project unless ALLOW_PROD_MIGRATIONS=1.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Set DATABASE_URL to the new project's session pooler URI (port 5432)." >&2
  exit 1
fi

if printf '%s' "$DATABASE_URL" | grep -q 'iobsolszrmigdmdydfbe'; then
  if [ "${ALLOW_PROD_MIGRATIONS:-}" != "1" ]; then
    echo "Refusing to migrate the production project iobsolszrmigdmdydfbe." >&2
    echo "Create an empty Supabase project and point DATABASE_URL at that." >&2
    exit 1
  fi
fi

command -v psql >/dev/null 2>&1 || { echo "psql is not installed" >&2; exit 1; }

root="$(cd "$(dirname "$0")/.." && pwd)"
ordered=()
while IFS= read -r file; do
  base="$(basename "$file")"
  if [ "$base" = "20261025160000_monthly_ekstrahjelp.sql" ]; then
    continue
  fi
  ordered+=("$file")
  if [ "$base" = "20261025160000_org_signup_details.sql" ]; then
    monthly="$root/supabase/migrations/20261025160000_monthly_ekstrahjelp.sql"
    if [ -f "$monthly" ]; then
      ordered+=("$monthly")
    fi
  fi
done < <(find "$root/supabase/migrations" -maxdepth 1 -name '*.sql' | sort)

echo "Applying ${#ordered[@]} migration files. The database URL is not printed."
for file in "${ordered[@]}"; do
  echo "→ $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Done. Create the storage buckets in the new project if a migration only printed a notice about storage."
