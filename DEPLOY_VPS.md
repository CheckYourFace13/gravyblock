# Deploy on Hostinger VPS (Ubuntu 22.04)

This replaces the shared-hosting deployment. VPS gives you persistent Node.js processes, a real cron daemon, and the background worker needed for autonomous content generation.

## Recommended VPS specs

| Tier | RAM | When to use |
|---|---|---|
| KVM 2 | 2 GB | Starting out, < 50 businesses |
| KVM 4 | 4 GB | Production, content generation running |
| KVM 8 | 8 GB | High volume, multiple workers |

Use **Ubuntu 22.04 LTS**. Choose the same Hostinger region as your PostgreSQL instance to minimize latency.

---

## 1. First login — server hardening

```bash
# As root
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
# Switch to deploy user for all remaining steps
su - deploy
```

---

## 2. Install Node.js 20 LTS via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node -v   # should print v20.x.x
```

---

## 3. Install PostgreSQL 15

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Start and enable
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create DB and user
sudo -u postgres psql <<'SQL'
CREATE USER gravyblock WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE gravyblock OWNER gravyblock;
GRANT ALL PRIVILEGES ON DATABASE gravyblock TO gravyblock;
SQL
```

`DATABASE_URL` will be:
```
postgresql://gravyblock:CHANGE_THIS_PASSWORD@localhost:5432/gravyblock
```

If you use Hostinger's managed PostgreSQL add-on instead, skip this step and use the connection string from the Hostinger panel.

---

## 4. Install PM2 and Nginx

```bash
npm install -g pm2

sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 5. Clone the repo and install dependencies

```bash
cd /home/deploy
git clone https://github.com/CheckYourFace13/gravyblock.git
cd gravyblock
npm ci
```

---

## 6. Set environment variables

Create `/home/deploy/gravyblock/.env`:

```bash
nano /home/deploy/gravyblock/.env
```

Paste and fill in all values (see `.env.example` in the repo for the full list):

```env
NODE_ENV=production
DATABASE_URL=postgresql://gravyblock:YOUR_PASSWORD@localhost:5432/gravyblock
NEXT_PUBLIC_SITE_URL=https://gravyblock.com

GOOGLE_PLACES_API_KEY=
ADMIN_PASSWORD=
ADMIN_SECRET=
AUTOPILOT_OPERATOR_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_BASE_MONTHLY=price_1TPPZpGtMdtMcPyFDPPKYop2
STRIPE_PRICE_PRO_MONTHLY=price_1TPPahGtMdtMcPyFlf7lDOkO

RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@gravyblock.com
LEAD_NOTIFICATION_EMAIL=chris@gravyblock.com

ANTHROPIC_API_KEY=

# Optional deploy markers
NEXT_PUBLIC_APP_BUILD=1.0.0
GIT_SHA=
DEPLOYED_AT=
```

---

## 7. Run database schema push

```bash
cd /home/deploy/gravyblock
npm run db:push
```

This must complete successfully before starting the app.

---

## 8. Build the app

```bash
npm run build
```

---

## 9. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to enable boot persistence
```

This starts two processes:
- `gravyblock` — the Next.js app on port 3000
- `gravyblock-worker` — a PM2 cron that fires the autopilot loop hourly

Check status:
```bash
pm2 status
pm2 logs gravyblock
```

---

## 10. Configure Nginx

Create `/etc/nginx/sites-available/gravyblock`:

```nginx
server {
    listen 80;
    server_name gravyblock.com www.gravyblock.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/gravyblock /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. SSL with Certbot

```bash
sudo certbot --nginx -d gravyblock.com -d www.gravyblock.com
```

Certbot auto-renews. Verify renewal works:

```bash
sudo certbot renew --dry-run
```

---

## 12. Point DNS

In your domain registrar or Cloudflare:
- `A` record: `gravyblock.com` → your VPS IP
- `A` record: `www.gravyblock.com` → your VPS IP

TTL: 300 seconds while migrating, bump to 3600 after verified.

---

## 13. Smoke tests

```bash
# Health check
curl https://gravyblock.com/api/health

# Autopilot auth guard (should return 401 without secret)
curl -X POST https://gravyblock.com/api/autopilot/run-recurring

# Autopilot with secret (should return 200 + JSON)
curl -X POST https://gravyblock.com/api/autopilot/run-recurring \
  -H "Authorization: Bearer YOUR_AUTOPILOT_OPERATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":2}'
```

Then open:
- `/` — homepage loads
- `/admin/login` — admin login works
- `/api/health` — `"databaseConfigured": true`

---

## Updating the app (deployments)

```bash
cd /home/deploy/gravyblock
git pull origin main
npm ci
npm run build
# Run db:push only if schema changed:
npm run db:push
pm2 restart gravyblock
```

---

## Monitoring logs

```bash
pm2 logs gravyblock         # app logs (real-time)
pm2 logs gravyblock-worker  # autopilot cron logs
pm2 monit                   # live CPU/memory dashboard
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| 502 Bad Gateway | `pm2 status` — app crashed? `pm2 logs gravyblock` for error |
| DB connection refused | Check `DATABASE_URL`, confirm PostgreSQL is running: `sudo systemctl status postgresql` |
| Build fails | Check Node version: `node -v` must be 20+. Check `.env` is present. |
| Autopilot returns 503 | `AUTOPILOT_OPERATOR_SECRET` not set in `.env` |
| Content not generating | `ANTHROPIC_API_KEY` not set — content falls back to template stubs |
| SSL cert expired | `sudo certbot renew` |
