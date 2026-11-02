# Marketing Studio Phase 1: runbook

Governing design: `PHASE0-audit-and-plan.md`. Phase 1 is the private foundation only: no rendering, no publishing, no AI or paid API calls, $0.

## What exists
- Feature flag `MARKETING_STUDIO_ENABLED=1` (off by default; the UI returns 404 and the worker idles in standby when it is off).
- Tables `ms_*` in `src/lib/db/studio-schema.ts` (additive only). Product/brand profiles, Product Truth (facts and claims), campaign records, asset metadata,
  encrypted credential references, job queue, usage, settings, audit trail.
- Admin UI `/admin/marketing-studio` (existing admin session required, operator-only).
- Separate process `gravyblock-marketing-worker` (`src/worker/marketing.ts`) in its own systemd cgroup scope (provisional limits: MemoryMax 768M, CPUQuota 50%), niced and ionice idle,
  its own queue, logs (`/var/lib/gravyblock-marketing/logs`), temp and media directories, heartbeat, retry/backoff, cleanup.
- Least-privilege DB role `gb_studio` (`scripts/ops/marketing-db-grants.sh`): writes only `ms_*` tables.
- Emergency disable: (1) `/var/lib/gravyblock-marketing/DISABLE` file, (2) kill switch button in the UI, (3) `pm2 stop gravyblock-marketing-worker`, (4) unset the flag.

## Environment and the unprivileged worker user
- The worker runs as the system user `gbstudio` (no login, no home) and reads ONLY `/etc/gravyblock-marketing.env` (root:gbstudio, mode 640) containing
  `NODE_ENV`, `MARKETING_STUDIO_ENABLED=1`, `MARKETING_DATABASE_URL` (the gb_studio role), `MARKETING_SECRET_KEY` (32 bytes, base64), `MARKETING_SECRET_KEY_ID=k1`, `MARKETING_STORAGE_ROOT`.
  It never reads the main `.env`, so it holds no Stripe, email or GravyBlock database credentials.
- The web app (admin UI) needs the same four MARKETING_* values in `/home/deploy/gravyblock/.env` (mode 640). Never commit either file.
- Storage: `/var/lib/gravyblock-marketing/{tmp,media,logs}`, owner gbstudio:gbstudio, mode 2770 (setgid) so files the web app writes stay readable by the worker.

## Setup after the tables exist
1. `useradd --system --no-create-home --shell /usr/sbin/nologin gbstudio`; create the storage directories above.
2. `GB_STUDIO_PASSWORD=... DB_NAME=gravyblock_prod bash scripts/ops/marketing-db-grants.sh`
3. Write the env file and add the keys to `.env`, then `pm2 restart gravyblock-marketing-worker` and `pm2 delete gravyblock && pm2 start ecosystem.config.js --only gravyblock` (PM2 caches environments).

## Verification commands
- `node scripts/ops/check-marketing-isolation.mjs` (no import path to site writes, publishing, outreach, growth engine).
- `npx tsx --test src/lib/marketing-studio/__tests__/pure.test.ts`
- `STUDIO_TEST_DATABASE_URL=postgresql://.../<db with "test" in its name> npx tsx --test src/lib/marketing-studio/__tests__/db.test.ts` (deletes ms_ rows; refuses non-test databases)
- Role test: add `STUDIO_TEST_ROLE_URL=<gb_studio url>` to prove the role is denied on businesses, published_content, publishing_jobs, proof_ledger, jobs, etc.

## Limits are placeholders
Every number in `src/lib/marketing-studio/config.ts` and `ecosystem.config.js` is conservative and provisional. Phase 2 chooses real values from a measured benchmark on this VPS.
