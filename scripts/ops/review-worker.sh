#!/bin/sh
# Timer entry for the Marketing Studio review worker (installed in /etc/cron.d/gravyblock-review-worker). Rendering needs about 1.5 GB, more than the
# marketing worker's cap, so the work runs in its own transient unit, one at a time, at low priority. It exits at once when no job is runnable.
cd /home/deploy/gravyblock || exit 0
exec flock -n /run/gravyblock-review-worker.lock systemd-run --wait --collect --quiet --unit="review-worker-$(date +%s)" \
  -p User=gbstudio -p WorkingDirectory=/home/deploy/gravyblock \
  nice -n 19 ionice -c 3 npx tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-review-worker.ts
