#!/usr/bin/env bash
# Drop leftover throwaway databases on the LOCAL server: mc_scratch_* (tests/integration),
# mc_idem_* (verify-idempotency.sh) and mc_mut_* (mutation checks) that no session is using.
# The integration suites already sweep their own timestamped scratch databases older than two
# hours whenever they create one (tests/integration/scratchDb.ts); this also removes the
# untimestamped names earlier runs left behind. It never touches any other database.
#   bash scripts/db/drop-scratch-dbs.sh [--dry-run]
set -euo pipefail
BASE="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HOST="$(node -e 'try { console.log(new URL(process.argv[1]).hostname) } catch { console.log("") }' "$BASE")"
if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]]; then
  echo "drop-scratch-dbs: local databases only (got '${HOST:-?}')" >&2
  exit 1
fi
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

names="$(psql "$BASE" -Atc "select datname from pg_database d
  where datname ~ '^mc_(scratch|idem|mut)_'
    and not exists (select 1 from pg_stat_activity a where a.datname = d.datname)
  order by 1")"
count=0
for name in $names; do
  if [[ $DRY == 1 ]]; then
    echo "would drop $name"
  elif psql "$BASE" -q -c "drop database if exists \"$name\"" 2>/dev/null; then
    echo "dropped $name"
  else
    echo "skipped $name (in use)"
    continue
  fi
  count=$((count + 1))
done
echo "drop-scratch-dbs: $count database(s) $([[ $DRY == 1 ]] && echo 'to drop' || echo dropped)"
