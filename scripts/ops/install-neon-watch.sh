#!/usr/bin/env bash
# One-time installer (run as root on the VPS from this directory). Idempotent.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
install -d -m 700 /var/lib/gravyblock-migration /var/backups/gravyblock
install -m 755 "$HERE/gravyblock-neon-migrate.sh" /usr/local/sbin/gravyblock-neon-migrate.sh
install -m 755 "$HERE/gravyblock-pg-backup.sh" /usr/local/sbin/gravyblock-pg-backup.sh

# Root-only copy of the ORIGINAL Neon URL (taken once; never overwritten) so the watchdog and rollback do not depend on .env.
if [ ! -s /var/lib/gravyblock-migration/neon.url ]; then
  grep -m1 '^DATABASE_URL=' /home/deploy/gravyblock/.env | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' > /var/lib/gravyblock-migration/neon.url
  chmod 600 /var/lib/gravyblock-migration/neon.url
fi
grep -q 'neon.tech' /var/lib/gravyblock-migration/neon.url || { echo "neon.url does not look like a Neon URL; aborting"; exit 1; }

# Worker hold: the worker idles (no DB access) until the migration removes this file.
touch /var/lib/gravyblock-migration/hold

cat > /etc/systemd/system/gravyblock-neon-watch.service <<'EOF'
[Unit]
Description=GravyBlock Neon to VPS Postgres one-time migration watchdog
After=network-online.target postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/gravyblock-neon-migrate.sh
TimeoutStartSec=3h
Nice=10
EOF
cat > /etc/systemd/system/gravyblock-neon-watch.timer <<'EOF'
[Unit]
Description=Hourly Neon reachability check (disables itself after a successful migration)

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/gravyblock-pg-backup.service <<'EOF'
[Unit]
Description=GravyBlock nightly compressed pg_dump
After=postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/gravyblock-pg-backup.sh
Nice=15
EOF
cat > /etc/systemd/system/gravyblock-pg-backup.timer <<'EOF'
[Unit]
Description=Nightly GravyBlock database backup

[Timer]
OnCalendar=*-*-* 03:40:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now gravyblock-neon-watch.timer
# backup timer is enabled by the migration once the local database holds real data
echo installed
