import { loadEnvConfig } from "@next/env";

/**
 * @next/env's loadEnvConfig caches its result at the module level the first
 * time it's called in a process (Next.js's own bootstrap calls it once,
 * automatically, before any request handling) — every subsequent call
 * WITHOUT forceReload:true returns that cached result and never re-reads
 * the .env files from disk again for the rest of that process's lifetime.
 * This is the actual, traced root cause of the webhook route treating
 * RESEND_WEBHOOK_SECRET as missing even after the file was confirmed
 * correct on disk: the already-running process's env was cached before the
 * file write and nothing short of forceReload (or a genuine process
 * restart) makes it see the new value.
 *
 * Call this at the top of any request path where an env var that can change
 * without a deploy (i.e. one written by an admin action rather than only
 * ever set via the deploy pipeline) needs to reflect its current on-disk
 * value. Cheap — a handful of small file reads — safe to call per-request.
 */
export function reloadEnvFromDisk(): void {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", undefined, true);
}
