#!/usr/bin/env bash
# Compare supabase/migrations/*.sql with supabase_migrations.schema_migrations.
# A file with a unique timestamp counts when that timestamp or the full
# filename stem is stored. Files that share a timestamp count only when the
# full stem is stored, because one timestamp cannot prove both were applied.
# Does not print SUPABASE_DB_URL.
set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::error::Missing SUPABASE_DB_URL. The drift check only runs with the session-pooler URI." >&2
  exit 1
fi

command -v psql >/dev/null 2>&1 || { echo "::error::psql is not installed" >&2; exit 1; }

root="$(cd "$(dirname "$0")/.." && pwd)"
recorded="$(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -At -c "select version from supabase_migrations.schema_migrations")" || {
  echo "::error::Could not read supabase_migrations.schema_migrations." >&2
  exit 1
}

has_version() {
  printf '%s\n' "$recorded" | grep -qx "$1"
}

declare -A prefix_count=()
files=()
while IFS= read -r file; do
  files+=("$file")
  base="$(basename "$file" .sql)"
  prefix="${base%%_*}"
  prefix_count["$prefix"]=$(( ${prefix_count["$prefix"]:-0} + 1 ))
done < <(find "$root/supabase/migrations" -maxdepth 1 -name '*.sql' | sort)

missing=0
for file in "${files[@]}"; do
  base="$(basename "$file" .sql)"
  prefix="${base%%_*}"
  if [ "${prefix_count[$prefix]}" -gt 1 ]; then
    if has_version "$base"; then
      continue
    fi
    echo "MISSING $base (shares timestamp $prefix, so the timestamp alone is not enough)"
    missing=1
    continue
  fi
  if has_version "$base" || has_version "$prefix"; then
    continue
  fi
  echo "MISSING $base"
  missing=1
done

if [ "$missing" -ne 0 ]; then
  echo "::error::Migration files are not fully recorded in supabase_migrations.schema_migrations." >&2
  exit 1
fi

echo "Every migration file is recorded in supabase_migrations.schema_migrations."
