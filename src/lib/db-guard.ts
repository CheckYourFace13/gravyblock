/**
 * Lightweight database-load guard for the worker.
 *
 * Once per worker tick it reads the database's own cumulative counters (one cheap query), turns them into
 * transactions-per-minute, and compares with a rolling baseline. If the rate suddenly runs far above normal
 * (a polling loop, a retry storm, repeated manual cycles), the worker enters "conserve" for two hours: it
 * skips OPTIONAL house work (the due-check and request draining) so redundant retries and polling stop first.
 * Customer-facing work (content publishing, scans, billing, outreach, measurement) is never paused.
 * It reads and writes almost nothing itself: one SELECT per tick and one job row only when it trips.
 */
import { sql } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

type Sample = { at: number; xact: number; rows: number };

const history: number[] = []; // recent transactions/minute, newest last
let last: Sample | null = null;
let conserveUntil = 0;

const MIN_GAP_MS = 8 * 60_000;
const TRIP_FACTOR = 3;
const TRIP_FLOOR_TX_PER_MIN = 400;
const CONSERVE_MS = 2 * 60 * 60_000;

export function isConserving(): boolean {
  return Date.now() < conserveUntil;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

export async function sampleDbLoad(): Promise<{ txPerMin: number; baseline: number; conserving: boolean } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = (await db.execute(sql`select xact_commit::bigint as x, tup_returned::bigint as t from pg_stat_database where datname = current_database()`)) as unknown as Array<{ x: string; t: string }>;
  const cur: Sample = { at: Date.now(), xact: Number(rows[0]?.x ?? 0), rows: Number(rows[0]?.t ?? 0) };
  const prev = last;
  if (prev && cur.at - prev.at < MIN_GAP_MS) return { txPerMin: history.at(-1) ?? 0, baseline: median(history), conserving: isConserving() };
  last = cur;
  if (!prev) return { txPerMin: 0, baseline: 0, conserving: isConserving() };
  const minutes = (cur.at - prev.at) / 60_000;
  const txPerMin = Math.max(0, (cur.xact - prev.xact) / minutes);
  const baseline = median(history);
  if (history.length >= 6 && txPerMin > Math.max(TRIP_FLOOR_TX_PER_MIN, baseline * TRIP_FACTOR)) {
    conserveUntil = Date.now() + CONSERVE_MS;
    await db.insert(jobs).values({ type: "db_load_guard", status: "completed", payload: { txPerMin: Math.round(txPerMin), baseline: Math.round(baseline), conserveHours: 2 } });
  }
  history.push(txPerMin);
  if (history.length > 48) history.shift();
  return { txPerMin, baseline, conserving: isConserving() };
}
