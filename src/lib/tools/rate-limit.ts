import { headers } from "next/headers";

/**
 * Small in-memory limiter for the free public tools. It is per server process, which is enough here:
 * the goal is to cap abuse and model cost, not to meter customers. Each tool also has a global daily cap.
 */
const hits = new Map<string, number[]>();
const daily = new Map<string, { day: string; n: number }>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Returns true if the call is allowed (and records it). */
export function allow(tool: string, key: string, opts: { perHour: number; perDay: number }): boolean {
  const now = Date.now();
  const k = `${tool}:${key}`;
  const recent = (hits.get(k) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= opts.perHour) return false;
  const day = new Date().toISOString().slice(0, 10);
  const g = daily.get(tool);
  const cur = g && g.day === day ? g : { day, n: 0 };
  if (cur.n >= opts.perDay) return false;
  cur.n += 1;
  daily.set(tool, cur);
  recent.push(now);
  hits.set(k, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}
