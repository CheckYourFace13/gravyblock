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
      // Persistent background worker — processes snapshot jobs and content queue
      // every WORKER_INTERVAL_MS (default 15 min). No external cron needed.
      name: "gravyblock-worker",
      script: "npx",
      args: "tsx --env-file=/home/deploy/gravyblock/.env src/worker/index.ts",
      cwd: "/home/deploy/gravyblock",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        WORKER_INTERVAL_MS: 900000,  // 15 minutes
        JOBS_PER_TICK: 5,
        CONTENT_PER_TICK: 3,
      },
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 5000,
      watch: false,
      out_file: "/home/deploy/logs/worker-out.log",
      error_file: "/home/deploy/logs/worker-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
