#!/usr/bin/env bash
# GravyBlock one-time Neon -> VPS PostgreSQL migration watchdog.
# Installed at /usr/local/sbin/gravyblock-neon-migrate.sh and run hourly by
# gravyblock-neon-watch.timer (root). Zero cost: only the existing VPS Postgres is used.
#
# While Neon is blocked it only runs `select 1` (once per run) and logs nothing unless the
# reason for being unreachable changes. When Neon answers it migrates ONCE, validates every
# table count before switching, and on any failure leaves production on Neon (rolls back) and
# retries later with backoff. It never starts from an empty database.
set -u

STATE_DIR=/var/lib/gravyblock-migration
NEON_URL_FILE=$STATE_DIR/neon.url
LOCAL_URL_FILE=/root/.gravyblock_prod_dburl
APP_DIR=/home/deploy/gravyblock
ENV_FILE=$APP_DIR/.env
HOLD=$STATE_DIR/hold
STATE=$STATE_DIR/state
REPORT=$STATE_DIR/REPORT.txt
LOG=/var/log/gravyblock-migration.log
WORK=$STATE_DIR/work
SNAP_DIR=/var/backups/gravyblock
DEPLOY_LOCK=/tmp/gravyblock-self-deploy.lock
LOCAL_DB=gravyblock_prod
LOCAL_URL_PREFIX="postgresql://gravyblock_prod:"

export PATH=/root/.nvm/versions/node/v20.20.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PGCONNECT_TIMEOUT=15

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
get() { grep -m1 "^$1=" "$STATE" 2>/dev/null | cut -d= -f2-; }
set_kv() { # set_kv key value
  touch "$STATE"; grep -v "^$1=" "$STATE" > "$STATE.tmp" 2>/dev/null; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"
}
now() { date +%s; }

mkdir -p "$STATE_DIR" "$SNAP_DIR"; chmod 700 "$STATE_DIR"

# Evidence pass ~55 min after a successful migration (scheduled by the migration itself).
if [ "${1:-}" = "postcheck" ]; then
  LOCAL_URL=$(cat "$LOCAL_URL_FILE"); since=$(get started_at)
  q() { psql "$LOCAL_URL" -X -Atc "$1" 2>&1; }
  {
    echo; echo "== POST-CHECK $(date -u +%FT%TZ) =="
    echo "worker: $(pm2 jlist 2>/dev/null | python3 -c 'import sys,json
for p in json.load(sys.stdin):
  if p["name"]=="gravyblock-worker": print(p["pm2_env"]["status"], "restarts", p["pm2_env"]["restart_time"])')"
    echo "house accounts: $(q "select count(*) from businesses where account_type='house'")"
    echo "job types created since migration start:"; q "select '  '||type||': '||count(*) from jobs where created_at > '$since' group by type order by 1"
    for pat in truth authority backlink aeo competitor measurement house; do echo "jobs matching '$pat': $(q "select count(*) from jobs where created_at > '$since' and type ilike '%$pat%'")"; done
    echo "house website writes since migration (published_content rows for house accounts, must be 0): $(q "select count(*) from published_content pc join businesses b on b.id=pc.business_id where b.account_type='house' and pc.created_at > '$since'")"
    echo "outreach sends since migration: $(q "select count(*) from jobs where created_at > '$since' and type in ('cold_outreach_sent','cold_outreach_followup_sent','cold_outreach_breakup_sent','authority_outreach_sent','authority_followup_sent','review_request_customer_sent')") (shared daily ceiling 100)"
  } >> "$REPORT" 2>&1
  exit 0
fi

exec 9>"$STATE_DIR/lock"; flock -n 9 || exit 0

[ -f "$NEON_URL_FILE" ] || { log "FATAL: $NEON_URL_FILE missing"; exit 1; }
NEON_URL=$(cat "$NEON_URL_FILE")
LOCAL_URL=$(cat "$LOCAL_URL_FILE")

STATUS=$(get status); STATUS=${STATUS:-waiting}

finish_disable_timer() { systemctl disable --now gravyblock-neon-watch.timer >/dev/null 2>&1; }

if [ "$STATUS" = "done" ]; then finish_disable_timer; exit 0; fi

# ---------------------------------------------------------------- helpers
pm() { pm2 "$@" >/dev/null 2>&1; }

stats_sql() { cat <<'SQL'
with t as (
  select table_schema s, table_name n from information_schema.tables
  where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
)
select 'table|'||s||'.'||n||'|'||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', s, n), false, true, '')))[1]::text from t
union all select 'indexes|'||schemaname||'|'||count(*) from pg_indexes where schemaname not in ('pg_catalog','information_schema') group by schemaname
union all select 'constraints|'||n.nspname||'|'||count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname not in ('pg_catalog','information_schema') group by n.nspname
union all select 'sequences|'||count(*) from pg_sequences where schemaname not in ('pg_catalog','information_schema')
order by 1;
SQL
}
seq_sql() { echo "select 'seqval|'||schemaname||'.'||sequencename||'|'||coalesce(last_value::text,'null') from pg_sequences where schemaname not in ('pg_catalog','information_schema') order by 1;"; }

env_db_is_local() { grep -q "^DATABASE_URL=.*@127.0.0.1:5432/$LOCAL_DB" "$ENV_FILE"; }

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$1"; }

wait_web_ok() { # all critical routes must be 200 on the local app
  local deadline=$(( $(now) + 150 )) bad
  while [ "$(now)" -lt "$deadline" ]; do
    bad=""
    for p in / /pricing /scan /login /proof /examples/sample-local-growth-report /api/health; do
      c=$(http_code "http://127.0.0.1:3000$p"); [ "$c" = "200" ] || bad="$bad $p=$c"
    done
    [ -z "$bad" ] && return 0
    sleep 8
  done
  echo "$bad"; return 1
}

fail_and_rollback() { # fail_and_rollback "reason"
  local reason="$1" n
  log "MIGRATION FAILED: $reason"
  set_kv last_failure "$(date -u +%FT%TZ) $reason"
  # production stays on Neon: restore the original env if we had switched it
  if [ -f "$STATE_DIR/env.neon.bak" ] && env_db_is_local; then cp -p "$STATE_DIR/env.neon.bak" "$ENV_FILE"; log "rolled back .env to Neon"; fi
  touch "$HOLD"; pm stop gravyblock-worker
  pm restart gravyblock --update-env || pm start gravyblock
  pm2 save >/dev/null 2>&1
  n=$(get attempts); n=$(( ${n:-0} + 1 )); set_kv attempts "$n"
  set_kv status waiting
  set_kv not_before "$(( $(now) + 3600 * (n > 4 ? 12 : n * 2) ))"
  kill "${TOUCHER:-0}" 2>/dev/null; rm -f "$DEPLOY_LOCK"
  exit 1
}

# ---------------------------------------------------------------- reachability (cheap path)
if [ "$STATUS" != "migrating" ]; then
  nb=$(get not_before); if [ -n "${nb:-}" ] && [ "$(now)" -lt "$nb" ]; then set_kv last_check "$(date -u +%FT%TZ)"; exit 0; fi
  out=$(timeout 30 psql "$NEON_URL" -X -Atc 'select 1' 2>&1); rc=$?
  set_kv last_check "$(date -u +%FT%TZ)"
  if [ $rc -ne 0 ] || [ "$out" != "1" ]; then
    reason=$(echo "$out" | grep -oE '53000|exceeded the quota|timeout|could not translate|refused' | head -1); reason=${reason:-other}
    if [ "$(get last_reason)" != "$reason" ]; then log "Neon unreachable (reason: $reason); waiting"; set_kv last_reason "$reason"; fi
    exit 0
  fi
  log "Neon is reachable: starting migration"
fi

# ---------------------------------------------------------------- migration
set_kv status migrating
START_TS=$(date -u +%FT%TZ); set_kv started_at "$START_TS"

# Block self-deploy while we work (it clears locks older than 15 min, so keep touching it).
touch "$DEPLOY_LOCK"; ( while :; do touch "$DEPLOY_LOCK"; sleep 60; done ) & TOUCHER=$!

if env_db_is_local; then
  log "resuming: .env already points at local database; skipping to verification"
else
  touch "$HOLD"
  pm stop gravyblock-worker
  pm stop gravyblock          # nothing may write to Neon between dump and switch
  pm2 save >/dev/null 2>&1
  rm -rf "$WORK"; mkdir -p "$WORK"; chmod 700 "$WORK"

  DIRECT_URL=$(echo "$NEON_URL" | sed -E 's/-pooler\././')
  if timeout 30 psql "$DIRECT_URL" -X -Atc 'select 1' >/dev/null 2>&1; then SRC="$DIRECT_URL"; else SRC="$NEON_URL"; fi

  vnum=$(psql "$SRC" -X -Atc 'show server_version_num' 2>/dev/null)
  case "$vnum" in ''|*[!0-9]*) fail_and_rollback "cannot read Neon server version";; esac
  major=$(( vnum / 10000 ))

  # extensions Neon uses must exist locally
  for e in $(psql "$SRC" -X -Atc "select extname from pg_extension where extname <> 'plpgsql'"); do
    ok=$(sudo -u postgres psql -Atc "select 1 from pg_available_extensions where name='$e'")
    [ "$ok" = "1" ] || fail_and_rollback "extension '$e' used on Neon is not available on the VPS"
  done

  if [ "$major" -gt 16 ]; then
    DUMP=(docker run --rm --network host postgres:${major}-alpine pg_dump)
  else
    DUMP=(pg_dump)
  fi
  "${DUMP[@]}" --dbname="$SRC" --no-owner --no-privileges --no-comments --format=plain --quote-all-identifiers > "$WORK/neon.sql" 2> "$WORK/dump.err" \
    || fail_and_rollback "pg_dump failed: $(head -c 300 "$WORK/dump.err")"
  [ -s "$WORK/neon.sql" ] || fail_and_rollback "pg_dump produced an empty file"
  grep -q 'CREATE TABLE' "$WORK/neon.sql" || fail_and_rollback "dump contains no tables"
  grep -v -E '^SET transaction_timeout' "$WORK/neon.sql" > "$WORK/restore.sql"

  # source stats taken after the dump, with web+worker stopped (no writers)
  stats_sql | psql "$SRC" -X -At > "$WORK/src.stats" 2> "$WORK/src.stats.err" || fail_and_rollback "cannot read Neon row counts"
  seq_sql   | psql "$SRC" -X -At > "$WORK/src.seq"   2>/dev/null
  [ -s "$WORK/src.stats" ] || fail_and_rollback "empty Neon stats"

  # permanent compressed copy of exactly what we migrated (kept for rollback/forensics)
  gzip -c "$WORK/neon.sql" > "$SNAP_DIR/neon-final-$(date -u +%Y%m%d-%H%M%S).sql.gz" && chmod 600 "$SNAP_DIR"/neon-final-*.sql.gz

  # fresh isolated local DB (never live until the switch below)
  sudo -u postgres psql -qAt <<SQL || fail_and_rollback "cannot reset local database"
drop database if exists $LOCAL_DB with (force);
create database $LOCAL_DB owner gravyblock_prod;
revoke all on database $LOCAL_DB from public;
SQL
  sudo -u postgres psql -d "$LOCAL_DB" -X -q -v ON_ERROR_STOP=1 --single-transaction < "$WORK/restore.sql" > "$WORK/restore.out" 2> "$WORK/restore.err" \
    || fail_and_rollback "restore failed: $(grep -m2 -i error "$WORK/restore.err" | head -c 400)"

  sudo -u postgres psql -d "$LOCAL_DB" -X -q -v ON_ERROR_STOP=0 <<'SQL' >/dev/null 2>"$WORK/owner.err"
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast','public') AND nspname NOT LIKE 'pg_%' LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO gravyblock_prod', r.nspname);
  END LOOP;
  FOR r IN SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg_%'
             AND c.relkind IN ('r','p','v','m','S','f')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype IN ('e','a','i')) LOOP
    BEGIN
      EXECUTE format('ALTER %s %I.%I OWNER TO gravyblock_prod',
        CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, r.nspname, r.relname);
    EXCEPTION WHEN others THEN RAISE WARNING 'owner % %: %', r.nspname, r.relname, SQLERRM; END;
  END LOOP;
  FOR r IN SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
           WHERE t.typtype IN ('e','d') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=t.oid AND d.deptype='e') LOOP
    BEGIN EXECUTE format('ALTER TYPE %I.%I OWNER TO gravyblock_prod', r.nspname, r.typname);
    EXCEPTION WHEN others THEN RAISE WARNING 'owner type %: %', r.typname, SQLERRM; END;
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') LOOP
    BEGIN EXECUTE format('ALTER FUNCTION %s OWNER TO gravyblock_prod', r.sig);
    EXCEPTION WHEN others THEN RAISE WARNING 'owner fn %: %', r.sig, SQLERRM; END;
  END LOOP;
END $$;
SQL
  left=$(sudo -u postgres psql -d "$LOCAL_DB" -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m') and n.nspname not in ('pg_catalog','information_schema','pg_toast') and pg_get_userbyid(c.relowner) <> 'gravyblock_prod'")
  [ "${left:-1}" = "0" ] || fail_and_rollback "$left relations not owned by gravyblock_prod after restore"

  # ---- validation (fatal on any mismatch of table row counts, index/constraint/sequence counts)
  stats_sql | psql "$LOCAL_URL" -X -At > "$WORK/dst.stats" 2> "$WORK/dst.stats.err" || fail_and_rollback "cannot read local row counts as app user: $(head -c 200 "$WORK/dst.stats.err")"
  if ! diff -q "$WORK/src.stats" "$WORK/dst.stats" >/dev/null; then
    diff "$WORK/src.stats" "$WORK/dst.stats" > "$WORK/stats.diff"; cp "$WORK/stats.diff" "$STATE_DIR/last-validation-diff.txt"
    fail_and_rollback "validation mismatch between Neon and local (see $STATE_DIR/last-validation-diff.txt)"
  fi
  seq_sql | psql "$LOCAL_URL" -X -At > "$WORK/dst.seq" 2>/dev/null
  diff -q "$WORK/src.seq" "$WORK/dst.seq" >/dev/null || log "WARNING: sequence last_value differences (non-fatal)"

  tables=$(grep -c '^table|' "$WORK/dst.stats")
  house=$(psql "$LOCAL_URL" -X -Atc "select count(*) from businesses where account_type='house'" 2>/dev/null)
  house_src=$(psql "$SRC" -X -Atc "select count(*) from businesses where account_type='house'" 2>/dev/null)
  [ "$house" = "$house_src" ] && [ -n "$house" ] || fail_and_rollback "house account count mismatch (neon=$house_src local=$house)"
  supp=$(grep -i -E '^table\|[^|]*(suppress|unsub|bounce|complain)' "$WORK/dst.stats" | tr '\n' ' ')
  echo "tables=$tables house=$house suppression_tables: $supp" > "$STATE_DIR/validation-summary.txt"
  log "validation passed: $(cat "$STATE_DIR/validation-summary.txt")"

  # ---- switch
  cp -p "$ENV_FILE" "$STATE_DIR/env.neon.bak"; chmod 600 "$STATE_DIR/env.neon.bak"
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=$LOCAL_URL#" "$ENV_FILE"
  env_db_is_local || fail_and_rollback "could not update DATABASE_URL"
fi

# ---------------------------------------------------------------- bring web up on local Postgres, verify
pm restart gravyblock --update-env || pm start gravyblock
bad=$(wait_web_ok) || fail_and_rollback "web verification failed on local Postgres:$bad"

# Stripe config, read-only (no session is created)
stripe_note="not checked"
KEY=$(grep -m1 '^STRIPE_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'"); PRICE=$(grep -m1 '^STRIPE_PRICE_GROWTH_MONTHLY=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
if [ -n "$KEY" ] && [ -n "$PRICE" ]; then
  stripe_note=$(curl -s --max-time 20 -u "$KEY:" "https://api.stripe.com/v1/prices/$PRICE" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print("price active=%s amount=%s %s interval=%s" % (d.get("active"), d.get("unit_amount"), d.get("currency"), (d.get("recurring") or {}).get("interval")))
except Exception as e: print("unreadable")')
fi

# Resume worker. The shared daily send ceiling and caps are derived from the migrated jobs table,
# so accumulated downtime cannot produce a catch-up burst.
rm -f "$HOLD"
pm restart gravyblock-worker --update-env || pm start gravyblock-worker
sleep 90
wstatus=$(pm2 jlist 2>/dev/null | python3 -c 'import sys,json
for p in json.load(sys.stdin):
  if p["name"]=="gravyblock-worker": print(p["pm2_env"]["status"], p["pm2_env"]["restart_time"])')
tick=$(grep -c 'tick start' /home/deploy/logs/worker-out-1.log 2>/dev/null || echo 0)
dbwrites=$(psql "$LOCAL_URL" -X -Atc "select count(*) from jobs where created_at > '$START_TS'" 2>/dev/null)
pm2 save >/dev/null 2>&1

# ---------------------------------------------------------------- success
set_kv status done; set_kv attempts 0; set_kv finished_at "$(date -u +%FT%TZ)"
finish_disable_timer
kill "$TOUCHER" 2>/dev/null; rm -f "$DEPLOY_LOCK"
systemctl enable --now gravyblock-pg-backup.timer >/dev/null 2>&1
systemctl start gravyblock-pg-backup.service
sleep 5
backup_latest=$(ls -1t "$SNAP_DIR"/daily/*.sql.gz 2>/dev/null | head -1)
cat > "$REPORT" <<EOF
GRAVYBLOCK VPS MIGRATION: PASS (verify items below; post-check appended later)
finished: $(get finished_at)  started: $START_TS
neon dump completed: YES (copy: $(ls -1t $SNAP_DIR/neon-final-*.sql.gz | head -1))
data validated: YES ($(cat $STATE_DIR/validation-summary.txt))
production using VPS PostgreSQL: YES (DATABASE_URL -> 127.0.0.1:5432/$LOCAL_DB)
web critical routes: all 200
worker: $wstatus; tick_lines=$tick; jobs rows created since start=$dbwrites
stripe (read-only): $stripe_note  (an interactive Checkout session is not created automatically)
backup: ${backup_latest:-NONE}
migration watchdog disabled: $(systemctl is-enabled gravyblock-neon-watch.timer 2>&1)
neon retained for rollback: YES (untouched; env backup at $STATE_DIR/env.neon.bak)
ongoing DB cost: \$0
EOF
log "MIGRATION SUCCEEDED; see $REPORT"
systemd-run --on-active=55m --unit=gravyblock-migration-postcheck /usr/local/sbin/gravyblock-neon-migrate.sh postcheck >/dev/null 2>&1
exit 0
