/**
 * The spend guard for the language-model creative step. A hard monthly cap (owner directive 2026-11-08: $5 a month to start), exact cost per call and per
 * video from the provider's own usage report, and a cache so the same request is never paid for twice. Money is counted in micro-dollars (integers) so
 * sums never drift. When the cap is reached, or a call would not fit under it, the step refuses and the studio carries on without AI.
 */
import { createHash } from "node:crypto";
import type { StudioDb } from "../../db";
import { getSetting, setSetting } from "../../runtime";

export const AI_HARD_MAX_USD = 5;
export const AI_CAP_SETTING = "ms_ai_cap_usd";
const ACTOR = "ai-creative-step (owner directive 2026-11-08)";
const MICROS = 1_000_000;

export type LedgerEntry = { at: string; specId: string; purpose: string; model: string; tokensIn: number; tokensOut: number; micros: number };
export type Ledger = { month: string; micros: number; calls: number; byVideo: Record<string, number>; entries: LedgerEntry[] };

export class AiCapReached extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCapReached";
  }
}

export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const ledgerKey = (month: string) => `ms_ai_ledger_${month}`;
export const cacheKey = (model: string, system: string, user: string) => `ms_ai_cache_${createHash("sha256").update(`${model}\n${system}\n${user}`).digest("hex").slice(0, 40)}`;

/** The cap in dollars: the owner's setting, never above the hard maximum. */
export async function capUsd(db: StudioDb): Promise<number> {
  const set = await getSetting<number>(AI_CAP_SETTING, AI_HARD_MAX_USD, db);
  return Math.max(0, Math.min(AI_HARD_MAX_USD, Number.isFinite(set) ? set : AI_HARD_MAX_USD));
}

export async function readLedger(db: StudioDb, month = monthOf()): Promise<Ledger> {
  return getSetting<Ledger>(ledgerKey(month), { month, micros: 0, calls: 0, byVideo: {}, entries: [] }, db);
}

export type Spend = { spentUsd: number; capUsd: number; remainingUsd: number; calls: number };
export async function spendNow(db: StudioDb): Promise<Spend> {
  const [l, cap] = await Promise.all([readLedger(db), capUsd(db)]);
  const spentUsd = l.micros / MICROS;
  return { spentUsd, capUsd: cap, remainingUsd: Math.max(0, cap - spentUsd), calls: l.calls };
}

/** Refuses before any money is spent when the worst case for this call would pass the cap. */
export async function assertRoom(db: StudioDb, worstCaseMicros: number): Promise<void> {
  const [l, cap] = await Promise.all([readLedger(db), capUsd(db)]);
  if (l.micros + worstCaseMicros > cap * MICROS) throw new AiCapReached(`the $${cap} monthly AI cap would be passed (spent $${(l.micros / MICROS).toFixed(4)}); AI generation is stopped until next month`);
}

export async function record(db: StudioDb, e: Omit<LedgerEntry, "at">): Promise<void> {
  const l = await readLedger(db);
  l.micros += e.micros;
  l.calls += 1;
  l.byVideo[e.specId] = (l.byVideo[e.specId] ?? 0) + e.micros;
  l.entries = [...l.entries, { ...e, at: new Date().toISOString() }].slice(-300);
  await setSetting(ledgerKey(l.month), l, ACTOR, db, { audited: false });
}

export const getCached = (db: StudioDb, key: string) => getSetting<{ text: string; micros: number; model: string } | null>(key, null, db);
export const putCached = (db: StudioDb, key: string, v: { text: string; micros: number; model: string }) => setSetting(key, v, ACTOR, db, { audited: false });

export const usd = (micros: number) => `$${(micros / MICROS).toFixed(4)}`;
