# GravyBlock VPS PostgreSQL: backups and restore

Production database: local PostgreSQL 16 on the VPS, database `gravyblock_prod`, reachable only on 127.0.0.1. Neon is no longer used by any
running GravyBlock process (verified 2026-11-02).

## Backups
- `gravyblock-pg-backup.timer` runs nightly at 03:40 UTC and writes `/var/backups/gravyblock/daily/gravyblock-<date>.sql.gz` (mode 600, root).
- Retention: 14 daily files and 8 weekly files (see `scripts/ops/gravyblock-pg-backup.sh`). Cost: $0 (local disk).
- The one-time Neon rollback snapshot is `/var/backups/gravyblock/neon-final-20261101-001501.sql.gz`. Keep it until the Neon project is retired.
- Run one on demand: `systemctl start gravyblock-pg-backup.service`; log: `/var/log/gravyblock-backup.log`.

## Verify a backup (does not touch production)
```bash
f=$(ls -t /var/backups/gravyblock/daily/gravyblock-*.sql.gz | head -1)
gzip -t "$f" && echo integrity ok
sudo -u postgres psql -c "create database gb_restore_test"
zcat "$f" | sudo -u postgres psql -d gb_restore_test -v ON_ERROR_STOP=0
# compare per-table counts with gravyblock_prod, then:
sudo -u postgres psql -c "drop database gb_restore_test"
```
Verified 2026-11-02: 52 tables, 73 indexes, 139 constraints, 0 sequences, 0 restore errors, row counts equal.

## Restore into production (disaster recovery only)
1. `pm2 stop gravyblock gravyblock-worker gravyblock-marketing-worker` (root's PM2) and stop the self-deploy cron.
2. Create the empty database and restore into it, then validate counts:
   `sudo -u postgres psql -c "create database gravyblock_restore"` then `zcat <file> | sudo -u postgres psql -d gravyblock_restore -v ON_ERROR_STOP=1 --single-transaction`.
3. Only after validation: rename databases (`alter database ... rename`) or point `DATABASE_URL` at the restored database, reassign ownership to the application role,
   run `bash scripts/ops/marketing-db-grants.sh`, restart the processes, and check `/api/health`.
4. Never restore over a live database without a fresh backup of it first.

## Pitfall that cost a day (fixed 2026-11-02)
PM2 stores each process's environment. A restart with `--update-env` does not remove a variable that is absent from the current shell, so the web process kept an old Neon `DATABASE_URL`
and overrode `.env`. After any change to `DATABASE_URL`, check the live process environment (`/proc/<pid>/environ`) and, if stale, `pm2 delete` and `pm2 start ecosystem.config.js --only <app>`.
