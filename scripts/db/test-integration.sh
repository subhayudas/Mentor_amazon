#!/usr/bin/env bash
# Run the integration suites (tests/integration) against the local Supabase stack.
#   bash scripts/db/test-integration.sh [vitest args, e.g. a file filter]
# Takes the stack settings from scripts/e2e/env.sh; SUPABASE_TEST_* already set win.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../e2e/env.sh
source "$ROOT/scripts/e2e/env.sh"
export SUPABASE_TEST_URL="${SUPABASE_TEST_URL:-$SUPABASE_URL}"
export SUPABASE_TEST_ANON_KEY="${SUPABASE_TEST_ANON_KEY:-$VITE_SUPABASE_ANON_KEY}"
export SUPABASE_TEST_SERVICE_ROLE_KEY="${SUPABASE_TEST_SERVICE_ROLE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"
export SUPABASE_TEST_DB_URL="${SUPABASE_TEST_DB_URL:-$DATABASE_URL}"
cd "$ROOT"
exec npx vitest run -c vitest.integration.config.ts "$@"
