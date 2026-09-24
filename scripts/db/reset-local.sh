#!/usr/bin/env bash
# Rebuild the LOCAL Supabase database from the repo's SQL, the way production was built:
#   drop + recreate schema public → drizzle push (shared/schema.ts) → supabase_setup_v2.sql
#   → supabase_phase2.sql → migrations/0002 → migrations/0003 → migrations/0004 (seed)
#   → reload PostgREST.
# All auth users are deleted as well. It refuses to touch anything but 127.0.0.1 / localhost.
#
# Usage: bash scripts/db/reset-local.sh [--no-contract] [--no-seed] [--e2e-seed]
#   --no-contract  stop after 0002 (the state production is in between the migration and the deploy)
#   --no-seed      skip 0004 (the featured mentors stay static, "opening soon")
#   --e2e-seed     afterwards run scripts/e2e/seed.ts (Playwright personas and fixture bookings)
# Env: DATABASE_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONTRACT=1
SEED=1
E2E_SEED=0
for arg in "$@"; do
  case "$arg" in
    --no-contract) CONTRACT=0 ;;
    --no-seed) SEED=0 ;;
    --e2e-seed) E2E_SEED=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

HOST="$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { console.log("") }' "$DB")"
if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]]; then
  echo "reset-local: refusing to run against host '${HOST:-?}'. This script only resets a local database (127.0.0.1 / localhost)." >&2
  exit 1
fi

run_sql() {
  echo "  applying $1"
  psql "$DB" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$ROOT/$1" 2> >(grep -Ev '^psql:.*NOTICE:|^$' >&2)
}

echo "reset-local: $HOST — dropping schema public and all auth users"
psql "$DB" -v ON_ERROR_STOP=1 -q -o /dev/null <<'SQL'
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
DELETE FROM auth.users;
SQL

echo "  drizzle push (shared/schema.ts)"
( cd "$ROOT" && DATABASE_URL="$DB" npx drizzle-kit push --force --strict=false >/dev/null )

run_sql supabase_setup_v2.sql
run_sql supabase_phase2.sql
run_sql migrations/0002_production_readiness.sql
if [[ $CONTRACT == 1 ]]; then run_sql migrations/0003_restrict_legacy_writes.sql; fi
if [[ $SEED == 1 ]]; then run_sql migrations/0004_seed_featured_mentors.sql; fi

psql "$DB" -q -c "NOTIFY pgrst, 'reload schema';"
echo "reset-local: ok — $(psql "$DB" -Atc "select string_agg(version, ', ' order by version) from public.schema_migrations") applied; \
$(psql "$DB" -Atc "select count(*) from information_schema.tables where table_schema = 'public'") public relations; \
legacy writes $(psql "$DB" -Atc "select value from public.mc_settings where key = 'legacy_booking_writes'")"

if [[ $E2E_SEED == 1 ]]; then
  echo "  seeding E2E personas"
  ( cd "$ROOT" && DATABASE_URL="$DB" npx vite-node scripts/e2e/seed.ts )
fi
