/**
 * In-memory brute-force guard for the shared-password admin login.
 *
 * The admin panel now has a public link in the site footer (every page),
 * so unlimited password guesses against a single shared secret is a real
 * risk, not a theoretical one. This is intentionally simple: an in-memory
 * map keyed by client IP, since the app runs as one long-lived Node process
 * on the VPS (not serverless/multi-instance) — no DB round-trip needed, and
 * it resets safely on deploy/restart.
 *
 * 5 failed attempts per IP within 15 minutes locks that IP out for 15
 * minutes. Other IPs (including the real admin, if the attacker's IP
 * differs) are unaffected.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; windowStartedAt: number };
const buckets = new Map<string, Bucket>();

// Bound memory in the (unlikely) event of a distributed attempt flood —
// oldest entries are evicted first once the map gets large.
const MAX_TRACKED_IPS = 5000;

function pruneIfNeeded() {
  if (buckets.size <= MAX_TRACKED_IPS) return;
  const oldestFirst = [...buckets.entries()].sort((a, b) => a[1].windowStartedAt - b[1].windowStartedAt);
  for (const [key] of oldestFirst.slice(0, buckets.size - MAX_TRACKED_IPS)) {
    buckets.delete(key);
  }
}

export function isLockedOut(ip: string): { locked: boolean; retryAfterSeconds?: number } {
  const bucket = buckets.get(ip);
  if (!bucket) return { locked: false };
  const elapsed = Date.now() - bucket.windowStartedAt;
  if (elapsed > WINDOW_MS) {
    buckets.delete(ip);
    return { locked: false };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { locked: true, retryAfterSeconds: Math.ceil((WINDOW_MS - elapsed) / 1000) };
  }
  return { locked: false };
}

export function recordFailedAttempt(ip: string): void {
  const bucket = buckets.get(ip);
  const now = Date.now();
  if (!bucket || now - bucket.windowStartedAt > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStartedAt: now });
  } else {
    bucket.count += 1;
  }
  pruneIfNeeded();
}

export function clearAttempts(ip: string): void {
  buckets.delete(ip);
}
