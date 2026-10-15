/**
 * Connector self-test: proves the whole write path of a connected site without changing anything a visitor
 * sees and without creating growth proof. Generic for every managed_feed site.
 *
 *   1. handshake      the site announces the connector and names THIS business
 *   2. write          publish an inert structured-data marker (a WebPage node with a test identifier) as an
 *                     override for "/" (existing override fields are carried over, so nothing else changes)
 *   3. verify         poll the LIVE page until the marker appears
 *   4. rollback       restore the previous override (or revert), poll until the marker is gone
 *
 * Sites that do not declare `structuredData` cannot render the marker, so only the handshake is run and the
 * result says the write path is untestable without visible change. Results are `connector_selftest` jobs and
 * never enter the Proof Ledger.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { autoConnectManagedSites, detectConnector, getSiteTarget } from "./adapters";

const PATH = "/";
const POLL_MS = 20_000;
const MAX_WAIT_MS = 12 * 60_000;

type Db = NonNullable<ReturnType<typeof getDb>>;

async function latestOverridePayload(db: Db, businessId: string, path: string): Promise<{ payload: Record<string, unknown>; status: string } | null> {
  const rows = await db.select({ payload: jobs.payload, status: jobs.status }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override"))).orderBy(desc(jobs.createdAt)).limit(300);
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (p.path === path) return { payload: p, status: r.status };
  }
  return null;
}

async function pageHasMarker(url: string, marker: string): Promise<boolean> {
  const r = await safeFetchText(url, { timeoutMs: 15_000, maxBytes: 1_500_000, headers: { "cache-control": "no-cache", pragma: "no-cache" } });
  return r.ok && r.status < 400 && r.body.includes(marker);
}

async function waitFor(url: string, marker: string, want: boolean): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_WAIT_MS) {
    if ((await pageHasMarker(url, marker)) === want) return Math.round((Date.now() - t0) / 1000);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return null;
}

export type SelfTestResult = {
  businessId: string;
  handshake: boolean;
  declared: string[];
  writeTested: boolean;
  writeVisibleSeconds: number | null;
  rollbackVerifiedSeconds: number | null;
  ok: boolean;
  note: string;
};

export async function runConnectorSelfTest(businessId: string): Promise<SelfTestResult> {
  const db = getDb();
  const res: SelfTestResult = { businessId, handshake: false, declared: [], writeTested: false, writeVisibleSeconds: null, rollbackVerifiedSeconds: null, ok: false, note: "" };
  const finish = async (note: string, ok: boolean) => {
    res.note = note;
    res.ok = ok;
    if (db) await db.insert(jobs).values({ businessId, type: "connector_selftest", status: ok ? "completed" : "partial", payload: res });
    return res;
  };
  if (!db) return finish("no_db", false);

  // Pick up any capability change the site has announced since the last probe (idempotent).
  await autoConnectManagedSites(1, businessId).catch(() => undefined);
  const target = await getSiteTarget(businessId);
  if (!target || target.adapter !== "managed_feed") return finish("no_managed_feed_target", false);
  const origin = String((target.config as { siteOrigin?: string }).siteOrigin ?? "");
  if (!origin) return finish("no_site_origin", false);

  const found = await detectConnector(origin);
  res.handshake = Boolean(found && found.businessId === businessId);
  res.declared = Object.entries(target.capabilities).filter(([, v]) => v).map(([k]) => k);
  if (!res.handshake) return finish("handshake_failed", false);
  if (!target.capabilities.structuredData) return finish("handshake_ok_write_untestable_without_structured_data", true);

  const marker = `gravyblock-selftest-${Date.now().toString(36)}`;
  const previous = await latestOverridePayload(db, businessId, PATH);
  const carried = previous && previous.status === "active" ? previous.payload : { path: PATH };
  const url = origin + PATH;

  res.writeTested = true;
  await db.insert(jobs).values({
    businessId,
    type: "site_override",
    status: "active",
    payload: { ...carried, path: PATH, selftest: marker, jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "@id": `${origin}/#${marker}`, identifier: marker } },
  });
  res.writeVisibleSeconds = await waitFor(url, marker, true);

  // Roll back to exactly the previous state, whether or not the write became visible.
  if (previous && previous.status === "active") {
    await db.insert(jobs).values({ businessId, type: "site_override", status: "active", payload: previous.payload });
  } else {
    await db.insert(jobs).values({ businessId, type: "site_override", status: "reverted", payload: { path: PATH, reason: "selftest_rollback", selftest: marker } });
  }
  res.rollbackVerifiedSeconds = await waitFor(url, marker, false);

  if (res.writeVisibleSeconds === null) return finish("write_not_visible_within_12_min", false);
  if (res.rollbackVerifiedSeconds === null) return finish("rollback_not_verified_within_12_min", false);
  return finish("write_and_rollback_verified", true);
}
