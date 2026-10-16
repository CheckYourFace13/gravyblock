/**
 * Cross-process wake signal between the web app (admin actions) and the worker, with NO database access.
 * The worker used to poll Postgres every minute for requested cycles / self-tests / watchdog passes; that kept
 * a scale-to-zero database permanently awake. Now the admin action drops a tiny file, the worker checks the
 * file (a stat call) every few seconds, and only touches the database when the file exists. The regular worker
 * tick still checks the database once per interval, so a request is never lost if the two processes do not
 * share a temp directory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WAKE_FILE = path.join(os.tmpdir(), "gravyblock-house-wake");

export function signalHouseWork(): void {
  try {
    fs.writeFileSync(WAKE_FILE, String(Date.now()));
  } catch {
    /* the worker's own tick will still find the request */
  }
}

/** True once per signal. */
export function consumeHouseWake(): boolean {
  try {
    if (!fs.existsSync(WAKE_FILE)) return false;
    fs.unlinkSync(WAKE_FILE);
    return true;
  } catch {
    return false;
  }
}
