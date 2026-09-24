#!/usr/bin/env bash
# Gate G6: prove the repo SQL is idempotent and that re-run chains never revert anything.
# Builds a throwaway database on the LOCAL server (never the shared one), then compares
# catalog fingerprints (scripts/db/fingerprint.sql):
#   A  drizzle push → v2 → phase2 → 0002 → 0003 → 0004
#   B  A + 0002 + 0003 + 0004 again           (each file is a no-op)
#   C  B + v2 alone                           (the v2 mirror reverts nothing)
#   D  C + v2 → phase2 → 0002 → 0003 again    (the full re-run chain)
# Any difference is printed and the script exits 1.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HOST="$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { console.log("") }' "$BASE")"
if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]]; then
  echo "verify-idempotency: local databases only (got '${HOST:-?}')" >&2
  exit 1
fi
NAME="mc_idem_$(node -e 'console.log(require("crypto").randomBytes(4).toString("hex"))')"
SCRATCH="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; console.log(u.toString())' "$BASE" "$NAME")"
WORK="$(mktemp -d)"
cleanup() {
  psql "$BASE" -q -c "drop database if exists $NAME with (force)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

apply() { psql "$SCRATCH" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$ROOT/$1" 2> >(grep -Ev 'NOTICE|^$' >&2); }
fingerprint() { psql "$SCRATCH" -At -f "$ROOT/scripts/db/fingerprint.sql" > "$WORK/$1.txt"; }
compare() {
  if ! diff -u "$WORK/$1.txt" "$WORK/$2.txt" > "$WORK/diff.txt"; then
    echo "verify-idempotency: $3 changed the catalog:" >&2
    cat "$WORK/diff.txt" >&2
    exit 1
  fi
  echo "  ok: $3"
}

psql "$BASE" -q -c "create database $NAME" >/dev/null
apply scripts/db/supabase-stubs.sql
( cd "$ROOT" && DATABASE_URL="$SCRATCH" npx drizzle-kit push --force --strict=false >/dev/null )
for f in supabase_setup_v2.sql supabase_phase2.sql migrations/0002_production_readiness.sql \
         migrations/0003_restrict_legacy_writes.sql migrations/0004_seed_featured_mentors.sql; do apply "$f"; done
fingerprint A
for f in migrations/0002_production_readiness.sql migrations/0003_restrict_legacy_writes.sql migrations/0004_seed_featured_mentors.sql; do apply "$f"; done
fingerprint B
compare A B "re-running 0002, 0003 and 0004"
apply supabase_setup_v2.sql
fingerprint C
compare A C "re-running supabase_setup_v2.sql alone"
for f in supabase_setup_v2.sql supabase_phase2.sql migrations/0002_production_readiness.sql migrations/0003_restrict_legacy_writes.sql; do apply "$f"; done
fingerprint D
compare A D "the chain v2 → phase2 → 0002 → 0003 run again"
echo "verify-idempotency: fingerprint diff empty ($(wc -l < "$WORK/A.txt" | tr -d ' ') catalog lines); re-run chain OK"
