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

## Environment (in /home/deploy/gravyblock/.env, never committed)
`MARKETING_STUDIO_ENABLED=1`, `MARKETING_DATABASE_URL` (gb_studio role), `MARKETING_SECRET_KEY` (32 bytes, base64), `MARKETING_SECRET_KEY_ID=k1`.

## Setup after the tables exist
1. `GB_STUDIO_PASSWORD=... DB_NAME=gravyblock_prod bash scripts/ops/marketing-db-grants.sh`
2. Add the four env keys, then `pm2 delete` and `pm2 start ecosystem.config.js --only gravyblock-marketing-worker`, and restart `gravyblock` so the UI sees the flag.

## Verification commands
- `node scripts/ops/check-marketing-isolation.mjs` (no import path to site writes, publishing, outreach, growth engine).
- `npx tsx --test src/lib/marketing-studio/__tests__/pure.test.ts`
- `STUDIO_TEST_DATABASE_URL=postgresql://.../<db with "test" in its name> npx tsx --test src/lib/marketing-studio/__tests__/db.test.ts` (deletes ms_ rows; refuses non-test databases)
- Role test: add `STUDIO_TEST_ROLE_URL=<gb_studio url>` to prove the role is denied on businesses, published_content, publishing_jobs, proof_ledger, jobs, etc.

## Limits are placeholders
Every number in `src/lib/marketing-studio/config.ts` and `ecosystem.config.js` is conservative and provisional. Phase 2 chooses real values from a measured benchmark on this VPS.
