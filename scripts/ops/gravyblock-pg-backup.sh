#!/usr/bin/env bash
# Nightly compressed pg_dump of the GravyBlock production database on this VPS (existing disk only).
# Installed at /usr/local/sbin/gravyblock-pg-backup.sh, run by gravyblock-pg-backup.timer.
#
# RESTORE (into an empty database, as root):
#   sudo -u postgres psql -c "create database gravyblock_prod owner gravyblock_prod"
#   zcat /var/backups/gravyblock/daily/<file>.sql.gz | sudo -u postgres psql -d gravyblock_prod -v ON_ERROR_STOP=1 --single-transaction
set -euo pipefail
DIR=/var/backups/gravyblock; D=$DIR/daily; W=$DIR/weekly; LOG=/var/log/gravyblock-backup.log
mkdir -p "$D" "$W"; chmod 700 "$DIR"
DB=gravyblock_prod

tables=$(sudo -u postgres psql -d "$DB" -Atc "select count(*) from information_schema.tables where table_schema='public'")
if [ "${tables:-0}" -lt 1 ]; then echo "$(date -u +%FT%TZ) skipped: $DB has no tables" >> "$LOG"; exit 0; fi

f="$D/gravyblock-$(date -u +%Y%m%d-%H%M%S).sql.gz"
sudo -u postgres pg_dump -d "$DB" --no-owner | gzip -9 > "$f.tmp"
gzip -t "$f.tmp"
[ "$(stat -c%s "$f.tmp")" -gt 2000 ] || { echo "$(date -u +%FT%TZ) FAILED: backup too small" >> "$LOG"; rm -f "$f.tmp"; exit 1; }
zcat "$f.tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete' || { echo "$(date -u +%FT%TZ) FAILED: dump incomplete" >> "$LOG"; rm -f "$f.tmp"; exit 1; }
mv "$f.tmp" "$f"; chmod 600 "$f"
[ "$(date -u +%u)" = "7" ] && cp -p "$f" "$W/"
find "$D" -name 'gravyblock-*.sql.gz' -mtime +14 -delete
find "$W" -name 'gravyblock-*.sql.gz' -mtime +56 -delete
echo "$(date -u +%FT%TZ) ok $f $(stat -c%s "$f") bytes; free disk: $(df -h --output=avail / | tail -1 | tr -d ' ')" >> "$LOG"
