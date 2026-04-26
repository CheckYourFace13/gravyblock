// PM2 process configuration for GravyBlock on Hostinger VPS
// Start: pm2 start ecosystem.config.js
// Save:  pm2 save && pm2 startup

const secret = process.env.AUTOPILOT_OPERATOR_SECRET ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

module.exports = {
  apps: [
    {
      name: "gravyblock",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/deploy/gravyblock",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Restart on crash, but not too aggressively
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
      // Log rotation
      out_file: "/home/deploy/logs/gravyblock-out.log",
      error_file: "/home/deploy/logs/gravyblock-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      // Runs the autopilot loop every hour via PM2 cron
      // Processes up to 10 pending jobs per tick
      name: "gravyblock-worker",
      script: "bash",
      args: `-c "curl -sS -X POST '${siteUrl}/api/autopilot/run-recurring' -H 'Authorization: Bearer ${secret}' -H 'Content-Type: application/json' -d '{\"limit\":10}' | head -c 2000"`,
      cron_restart: "0 * * * *",  // every hour on the hour
      autorestart: false,          // cron jobs should not auto-restart between fires
      watch: false,
      out_file: "/home/deploy/logs/worker-out.log",
      error_file: "/home/deploy/logs/worker-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
