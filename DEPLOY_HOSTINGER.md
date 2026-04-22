# Deploy on Hostinger (Next.js)

Exact values below assume a **managed PostgreSQL** connection string from Hostinger (or any Postgres). Adjust paths and panel labels to match your Hostinger product (VPS, Node hosting, or Docker).

## Required environment variables (production)

Set these in the Hostinger environment / `.env` used at **build** and **runtime**:

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | Must be `production`. |
| `DATABASE_URL` | Yes | Postgres URL. Required: the app **throws** if production would use in-memory persistence. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public site origin, e.g. `https://your-domain.com` (Open Graph + metadata). |
| `GOOGLE_PLACES_API_KEY` | Yes | Real scans need Places. |
| `ADMIN_PASSWORD` | Yes | Operator login password. |
| `ADMIN_SECRET` | Yes | Session signing secret (app fails in production if empty). |
| `AUTOPILOT_OPERATOR_SECRET` | Yes | Long random string. Required for **all** `POST` routes under `/api/autopilot/*` in production. |
| `RESEND_API_KEY` | If using email | Lead notifications. |
| `RESEND_FROM_EMAIL` | If using Resend | Verified sender in Resend. |
| `LEAD_NOTIFICATION_EMAIL` | If using Resend | Internal lead inbox. |

Optional:

- `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN` — verified Search Console metrics when set.
- `RESEND_SEND_CONFIRMATION_TO_LEAD` — default `true`.
- `DB_POOL_MAX` — Postgres pool size (default `5`).
- `CMS_WEBHOOK_SECRET`, `CMS_PUBLISHER_MODE`, `AUTOMATION_ALERT_EMAIL` — reserved / future wiring (see `.env.example`).

## Hostinger deployment steps

1. **Create Postgres** in Hostinger (or use external Postgres). Copy the connection string as `DATABASE_URL`.
2. **Create the Node app** (or deploy to your VPS): clone this repo or connect Git; use **Node 20 LTS** or newer (align with your local dev version).
3. **Install**: `npm ci` (or `npm install` if you do not commit a lockfile).
4. **Schema (before first traffic)** — from the same machine or CI where `DATABASE_URL` is available:
   - `npm run db:push`
5. **Build**: `npm run build` (must run with production env vars available if your code reads `NEXT_PUBLIC_*` at build time).
6. **Start**: `npm run start` (Hostinger often sets `PORT`; Next.js listens on `PORT` automatically).
7. **Reverse proxy / domain**: Point your domain to the app; enable HTTPS.
8. **Smoke tests** (see checklist below).

`package.json` scripts used in production:

- `"build": "next build"`
- `"start": "next start"`

## Exact `db:push` step

On any host with Node, the repo checked out, dependencies installed, and `DATABASE_URL` pointing at **production** Postgres:

```bash
set DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
npm run db:push
```

On Linux/macOS use `export DATABASE_URL=...` instead of `set`.

This runs `drizzle-kit push` against `src/lib/db/schema.ts` (see `drizzle.config.ts`). Run after deploy when the schema changes.

## Exact cron setup (recurring autopilot)

Schedule a job (Hostinger **Cron Jobs** or system `crontab`) to call the recurring worker **daily or hourly** as you prefer.

- **URL**: `https://YOUR_DOMAIN/api/autopilot/run-recurring`
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer YOUR_AUTOPILOT_OPERATOR_SECRET`  
    **or** `x-gravyblock-automation-secret: YOUR_AUTOPILOT_OPERATOR_SECRET`
  - `Content-Type: application/json`
- **Body** (example): `{"limit":10}`

Example with `curl` (what to mirror in cron):

```bash
curl -sS -X POST "https://YOUR_DOMAIN/api/autopilot/run-recurring" ^
  -H "Authorization: Bearer YOUR_AUTOPILOT_OPERATOR_SECRET" ^
  -H "Content-Type: application/json" ^
  -d "{\"limit\":10}"
```

(Use `\` line continuations on Unix instead of `^`.)

Without the secret, production returns **401**. If `AUTOPILOT_OPERATOR_SECRET` is unset in production, these routes return **503**.

## Smoke test checklist

After deploy:

1. `GET https://YOUR_DOMAIN/api/health` → **200**, JSON includes `"ok": true` and `"databaseConfigured": true`.
2. `GET https://YOUR_DOMAIN/` → **200**, no server error overlay.
3. Admin: open `/admin/login`, sign in with `ADMIN_PASSWORD` → session works (cookie set).
4. Run a **small** scan path that touches the DB (e.g. existing flow you use in staging) → data visible in admin/workspace.
5. Cron dry run: `POST /api/autopilot/run-recurring` with `Authorization: Bearer …` → **200** JSON (not 401/503).
6. `POST /api/autopilot/run-recurring` **without** auth → **401** in production.

## Hostinger-specific notes

- **Panel naming varies** by plan (shared Node vs VPS). If there is no “Node app” wizard, run `npm run build` and `npm run start` under **PM2** or **systemd** on a VPS and put **Nginx** in front.
- **Cron on shared hosting** often only supports `GET`. If `POST` is not allowed, use a VPS cron with `curl` as above, or an external scheduler (e.g. GitHub Actions, UptimeRobot HTTP monitor does not help for POST—use real cron or worker).
- **`PORT`**: set in the panel or leave default; Next binds to `process.env.PORT`.
- **`DATABASE_URL`**: must be reachable from the Node process (same region / private network if Hostinger offers it).
