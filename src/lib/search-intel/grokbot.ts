/**
 * Emails new and reopened search recommendations to the GrokBot automation, through the EXISTING Resend infrastructure (no other provider).
 *
 * Guarantees:
 *  - Once per occurrence: a delivery row with a unique idempotency key (recommendation id + occurrence) is the only way an email is sent, and the same key goes to Resend
 *    as its Idempotency-Key, so a retry after a crash cannot produce a second email. Regenerating a report never queues anything.
 *  - Sending is NOT a status change. A recommendation emailed here is not marked in progress, completed or verified; only a "sent to GrokBot" event is stored. GravyBlock does
 *    not assume the work was done and keeps verifying completed work with read-only checks.
 *  - Rollout: only occurrences that began AFTER activation are ever queued, so the existing backlog is never sent.
 *  - House accounts only. Daily cap, retry with backoff, delivery log, a pause switch, and failures are reported in the Friday owner email.
 *  - Nothing that looks like a credential is sent, and email addresses and phone numbers are removed from the text.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reportLink } from "./index-links";
import { buildPrompt } from "./prompt";
import { logRecommendationEvent } from "./recommendations";
import type { Improvement, SiteIntel } from "./types";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

export const MAX_ATTEMPTS = 5;
/** Concrete changes only. page_two is a research/validation note and stays in the Friday report and admin, not in GrokBot's inbox. */
export const ACTIONABLE_KINDS: ReadonlyArray<Improvement["kind"]> = ["indexing", "low_ctr", "near_page_one", "declining", "competitor_gap", "systemic_ctr", "topic_ranking", "cannibalization", "new_demand", "conversion", "mobile_ctr"];

export function grokbotConfig(env: Record<string, string | undefined> = process.env) {
  const cap = Number(env.GROKBOT_DAILY_CAP ?? 6);
  return {
    to: env.GROKBOT_TO ?? "mygrokbot2026@gmail.com",
    from: env.GROKBOT_FROM ?? "Casey at GravyBlock <hello@gravyblock.com>",
    dailyCap: Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : 6,
    paused: env.GROKBOT_PAUSED === "1",
  };
}

export const idempotencyKey = (recommendationId: string, occurrence: number): string => `${recommendationId}:${occurrence}`;

/** Wait before the next attempt: 10 minutes, 30 minutes, 2 hours, 6 hours, then give up (MAX_ATTEMPTS). */
export function retryDelayMs(attempts: number): number {
  return [10 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000][Math.min(Math.max(attempts, 1), 4) - 1]!;
}

/** Which occurrences may be emailed: an unresolved house recommendation with real affected URLs and evidence, of a kind that is a concrete change (not a research or validation note). */
export function isActionable(imp: Pick<Improvement, "kind" | "urls" | "evidence">): boolean {
  return ACTIONABLE_KINDS.includes(imp.kind) && imp.urls.length > 0 && imp.evidence.length > 0 && imp.evidence.some((e) => e.trim().length > 0);
}

/** The time this occurrence began: first report for occurrence 1, the reopening for later ones. */
export function occurrenceStart(occurrence: number, firstSeenAt: Date, reopenedAt: Date | null): Date | null {
  return occurrence <= 1 ? firstSeenAt : reopenedAt;
}

const SENSITIVE = [/\bsk_(live|test)_[A-Za-z0-9]{8,}/, /\bAKIA[0-9A-Z]{12,}/, /bearer\s+[A-Za-z0-9._-]{16,}/i, /\b(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*\S{6,}/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bre_[A-Za-z0-9]{16,}/];
export const containsSensitive = (text: string): boolean => SENSITIVE.some((r) => r.test(text));

/** Removes email addresses and phone numbers from free text (URLs are left alone). */
export function scrubPersonal(text: string): string {
  // URLs are left untouched; elsewhere emails and phone-style numbers (3-3-4 digit groups) are removed. Dates and metrics do not match that shape.
  return text
    .split(/(https?:\/\/\S+)/gi)
    .map((seg) => (/^https?:\/\//i.test(seg) ? seg : seg.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]").replace(/\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[number removed]")))
    .join("");
}

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

/** A short, specific issue summary for the subject line. */
export function issueSummary(imp: Pick<Improvement, "kind" | "issue" | "urls">): string {
  const p = imp.urls[0] ? pathOf(imp.urls[0]) : "";
  const s = (() => {
    switch (imp.kind) {
      case "indexing": return "Previously ranking pages dropped out of Google";
      case "low_ctr": return `Low click-through on ${p}`;
      case "near_page_one": return `Near page one, strengthen ${p}`;
      case "declining": return `Traffic drop on ${p}`;
      case "competitor_gap": return `Competitor gap on ${p}`;
      case "page_two": return `Validate page for ${p}`;
      case "confirmed_problem": return `${(imp.issue.split(":")[1] ?? imp.issue).replace(/_/g, " ")} on ${imp.urls.length} page${imp.urls.length === 1 ? "" : "s"}`;
      case "systemic_ctr": return `Search snippets under-clicked across ${(imp.issue.split(":")[1] ?? "a section")}`;
      case "topic_ranking": return `Win the "${imp.issue.split(":").slice(1).join(":")}" searches`;
      case "cannibalization": return `Two pages compete for "${imp.issue.split(":").slice(1).join(":")}"`;
      case "new_demand": return `Uncaptured searches: ${imp.issue.split(":").slice(1).join(":")}`;
      case "conversion": return "Turn search visitors into sign-ups";
      case "mobile_ctr": return "Mobile searchers click far less than desktop";
      default: return imp.kind;
    }
  })();
  return s.length > 90 ? `${s.slice(0, 87)}...` : s;
}

export const buildSubject = (siteName: string, ref: string, imp: Pick<Improvement, "kind" | "issue" | "urls">, kind: "new" | "reopened" | "test"): string =>
  `${kind === "test" ? "[TEST] " : ""}[GravyBlock Action] ${siteName} — ${ref} — ${kind === "reopened" ? "REOPENED: " : ""}${issueSummary(imp)}`;

const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- none");

export type EmailInput = {
  site: { name: string; website: string | null; businessId: string };
  ref: string;
  occurrence: number;
  kind: "new" | "reopened" | "test";
  improvement: Improvement;
  intel: SiteIntel;
  now: Date;
};

/** The complete message: everything GrokBot, or the site's developer, needs, plus ONE copy-ready instruction for this recommendation alone. */
export function buildGrokbotEmail(i: EmailInput): { subject: string; text: string; html: string } {
  const imp = { ...i.improvement, ref: i.ref };
  const w = i.intel.w28 ? `${i.intel.w28.cur.start} to ${i.intel.w28.cur.end}` : "the latest complete 28 days";
  const instruction = buildPrompt(i.intel, [imp]);
  const L: string[] = [];
  if (i.kind === "test") {
    L.push("*** TEST MESSAGE: this is a controlled delivery test, NOT a real recommendation. Do not implement anything in this email. ***", "");
  }
  L.push(`GRAVYBLOCK ACTION: ${imp.title}`);
  L.push(`Website: ${i.site.website ?? i.site.name} (${i.site.name})`);
  L.push(`Recommendation ID: ${i.ref} (occurrence ${i.occurrence}${i.kind === "reopened" ? ", REOPENED: it was verified fixed and has genuinely come back" : i.kind === "new" ? ", NEW" : ""})`);
  L.push(`Issue type: ${imp.kind.replace(/_/g, " ")}`);
  L.push(`Sent: ${i.now.toISOString()}`);
  L.push("", "STATUS NOTE: receiving this email does not change the task. GravyBlock has NOT marked it in progress, completed or verified and does not assume it has been implemented. When the work is done, report back with the ID above; GravyBlock then checks the live pages read-only.");
  L.push("", "AFFECTED URLS", bullets(imp.urls));
  L.push("", `CURRENT GOOGLE SEARCH CONSOLE EVIDENCE (${w}; Google clicks and impressions only, not total website visitors)`, bullets(imp.evidence));
  if (imp.potentialClicks28 > 0) L.push(`Upper-bound opportunity: about ${imp.potentialClicks28} more Google clicks per 28 days if fully fixed (an estimate, not a forecast).`);
  L.push("", "COMPETITOR REFERENCES (public pages GravyBlock read; research only, never copy their text, images or design)", imp.competitorUrls.length ? bullets(imp.competitorUrls) : `- none verified for this item (competitors last observed ${i.intel.competitors.observedAt.slice(0, 10)})`);
  L.push("", "SPECIFIC IMPROVEMENTS TO MAKE", bullets(imp.actions));
  L.push("", "ACCEPTANCE FOR THIS ITEM", bullets(imp.acceptance));
  L.push("", "EXISTING FEATURES AND PROTECTIONS TO PRESERVE", bullets(i.intel.topPages.slice(0, 8).map((p) => `${p.page} (${p.clicks} clicks, ${p.impressions} impressions in the latest 28 days)`)));
  L.push("- All existing routes, canonical tags, structured data, analytics tags and every signup, booking, search or checkout path.", "- GravyBlock never edits this site, its repository or its deployment. Only this site's own developer makes changes.");
  L.push("", "=================== COPY-READY DEVELOPMENT INSTRUCTION (Claude / Cursor / GrokBot): copy everything between the lines ===================", instruction, "=================== END OF INSTRUCTION ===================");
  L.push("", "REPORT BACK", bullets([`Recommendation ID ${i.ref}`, "Commit SHA and the list of changed URLs", "The final title, meta description, robots meta, canonical and HTTP status of each changed URL from production"]));
  L.push("", `GravyBlock admin (sign-in required): ${reportLink(i.site.businessId)}`);
  const text = scrubPersonal(L.join("\n"));
  const subject = buildSubject(i.site.name, i.ref, imp, i.kind);
  // Plain text only: no HTML, links or tracking. It is what an automation reads best, and plain mail is the least spam-like format for a technical message.
  return { subject, text, html: "" };
}

export type SendResult = { ok: boolean; id?: string; error?: string };
export type SendFn = (m: { to: string; from: string; subject: string; text: string; html: string; idempotencyKey: string }) => Promise<SendResult>;

/** The existing Resend account, with Resend's own Idempotency-Key header so a retried send cannot create a second email. */
export const sendViaResend: SendFn = async (m) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `gravyblock-grokbot-${m.idempotencyKey}`.slice(0, 250) },
      body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), tags: [{ name: "type", value: "grokbot_recommendation" }] }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${body.message ?? body.name ?? "error"}`.slice(0, 300) };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "send failed" };
  }
};

/* ───────────── database side ───────────── */

/** Active only between a `grokbot_activation` job and any later `grokbot_deactivation`. Returns when it was activated, or null when it is off. */
export async function getActivation(): Promise<Date | null> {
  const db = getDb();
  if (!db) return null;
  const rows = rowsOf<{ type: string; created_at: string }>(await db.execute(sql`select type, created_at from jobs where type in ('grokbot_activation', 'grokbot_deactivation') order by created_at desc limit 1`));
  return rows[0]?.type === "grokbot_activation" ? new Date(rows[0].created_at) : null;
}

type RecRow = { id: string; business_id: string; occurrence: number; first_seen_at: string; reopened_at: string | null; improvement: Improvement; status: string; ref_fp: string };

/** Queue (never send) deliveries for occurrences that began after activation. Idempotent: the unique key makes a second call a no-op. */
export async function enqueueGrokbot(businessId: string, now = new Date(), opts: { activatedAt?: Date | null } = {}): Promise<{ queued: number; reason?: string }> {
  const db = getDb();
  if (!db) return { queued: 0, reason: "no_db" };
  const activated = opts.activatedAt === undefined ? await getActivation() : opts.activatedAt;
  if (!activated) return { queued: 0, reason: "not_active" };
  // The improved (v2) analysis re-describes every site's problems once. Those first v2 recommendations reach GrokBot in the next weekly audit, not as a burst
  // of "new" action emails: immediate emails resume for occurrences that begin after the first weekly audit completed after the v2 switch.
  const gate = opts.activatedAt === undefined ? await v2Gate() : { open: true, since: null };
  if (!gate.open) return { queued: 0, reason: "waiting_for_first_v2_weekly_audit" };
  const activatedAt = gate.since && gate.since > activated ? gate.since : activated;
  const recs = rowsOf<RecRow>(await db.execute(sql`
    select r.id, r.business_id, r.occurrence, r.first_seen_at, r.reopened_at, r.improvement, r.status, r.fingerprint ref_fp
    from search_recommendations r join businesses b on b.id = r.business_id
    where r.business_id = ${businessId} and b.account_type = 'house' and r.status in ('new', 'opened')`));
  let queued = 0;
  for (const r of recs) {
    const start = occurrenceStart(Number(r.occurrence), new Date(r.first_seen_at), r.reopened_at ? new Date(r.reopened_at) : null);
    if (!start || start < activatedAt || !isActionable(r.improvement)) continue; // earlier occurrences are backlog and are never sent
    const key = idempotencyKey(r.id, Number(r.occurrence));
    const ins = rowsOf<{ id: string }>(await db.execute(sql`insert into grokbot_deliveries (recommendation_id, business_id, occurrence, idempotency_key, kind)
      values (${r.id}::uuid, ${r.business_id}::uuid, ${Number(r.occurrence)}, ${key}, ${Number(r.occurrence) > 1 ? "reopened" : "new"}) on conflict (idempotency_key) do nothing returning id`));
    if (ins.length) queued++;
  }
  void now;
  return { queued };
}

/** Open once a weekly audit has fully completed after the v2 switch marker; immediate emails then cover only occurrences that began after it. */
export async function v2Gate(): Promise<{ open: boolean; since: Date | null }> {
  const db = getDb();
  if (!db) return { open: false, since: null };
  const [m] = rowsOf<{ at: string }>(await db.execute(sql`select min(created_at) at from jobs where type = 'search_intel_v2_baseline'`));
  if (!m?.at) return { open: true, since: null };
  const [g] = rowsOf<{ at: string | null }>(await db.execute(sql`select min(sent_at) at from grokbot_deliveries where idempotency_key like 'audit:%:complete' and sent_at > ${m.at}::timestamptz`));
  return g?.at ? { open: true, since: new Date(g.at) } : { open: false, since: null };
}

async function reportIntel(businessId: string): Promise<SiteIntel | null> {
  const db = getDb()!;
  const [x] = rowsOf<{ data: SiteIntel }>(await db.execute(sql`select data from search_intel_reports where business_id = ${businessId} order by week_ending desc limit 1`));
  return x?.data ?? null;
}

export async function processGrokbotQueue(now = new Date(), opts: { send?: SendFn; activatedAt?: Date | null } = {}): Promise<{ sent: number; failed: number; suppressed: number; deferredByCap: number; skipped?: string }> {
  const out = { sent: 0, failed: 0, suppressed: 0, deferredByCap: 0 };
  const db = getDb();
  if (!db) return { ...out, skipped: "no_db" };
  const cfg = grokbotConfig();
  const activatedAt = opts.activatedAt === undefined ? await getActivation() : opts.activatedAt;
  if (!activatedAt) return { ...out, skipped: "not_active" };
  if (cfg.paused) return { ...out, skipped: "paused" };
  const send = opts.send ?? sendViaResend;
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where status = 'sent' and kind in ('new', 'reopened') and sent_at >= ${dayStart}::timestamptz`));
  let slots = Math.max(0, cfg.dailyCap - Number(n));
  const due = rowsOf<{ id: string }>(await db.execute(sql`
    select d.id from grokbot_deliveries d left join search_recommendations r on r.id = d.recommendation_id
    where d.kind in ('new', 'reopened') and d.attempts < ${MAX_ATTEMPTS}
      and ((d.status in ('pending', 'failed') and d.next_attempt_at <= ${now.toISOString()}::timestamptz) or (d.status = 'sending' and d.updated_at < ${new Date(now.getTime() - 15 * 60_000).toISOString()}::timestamptz))
    order by coalesce(r.priority, 0) desc, d.created_at limit 50`));
  for (const row of due) {
    if (slots <= 0) { out.deferredByCap++; continue; }
    // claim: only one worker can move a delivery to 'sending'
    const [d] = rowsOf<{ id: string; recommendation_id: string; business_id: string; occurrence: number; idempotency_key: string; kind: string; attempts: number }>(await db.execute(sql`
      update grokbot_deliveries set status = 'sending', attempts = attempts + 1, updated_at = now()
      where id = ${row.id}::uuid and (status in ('pending', 'failed') or (status = 'sending' and updated_at < ${new Date(now.getTime() - 15 * 60_000).toISOString()}::timestamptz)) returning *`));
    if (!d) continue;
    const suppress = async (why: string) => {
      await db.execute(sql`update grokbot_deliveries set status = 'suppressed', last_error = ${why}, updated_at = now() where id = ${d.id}::uuid`);
      out.suppressed++;
    };
    const [rec] = rowsOf<{ id: string; status: string; occurrence: number; improvement: Improvement; fingerprint: string; first_seen_at: string; name: string; website: string | null; account_type: string }>(await db.execute(sql`
      select r.id, r.status, r.occurrence, r.improvement, r.fingerprint, r.first_seen_at, b.name, b.website, b.account_type from search_recommendations r join businesses b on b.id = r.business_id where r.id = ${d.recommendation_id}::uuid`));
    if (!rec || rec.account_type !== "house") { await suppress("not a house account"); continue; }
    if (!["new", "opened"].includes(rec.status) || Number(rec.occurrence) !== Number(d.occurrence)) { await suppress(`no longer an unresolved occurrence (status ${rec.status})`); continue; }
    const intel = await reportIntel(d.business_id);
    if (!intel) { await db.execute(sql`update grokbot_deliveries set status = 'pending', attempts = attempts - 1, last_error = 'waiting for the first weekly report data', next_attempt_at = now() + interval '1 hour', updated_at = now() where id = ${d.id}::uuid`); continue; }
    const ref = `SR-${rec.fingerprint.slice(0, 6).toUpperCase()}`;
    const email = buildGrokbotEmail({ site: { name: rec.name, website: rec.website, businessId: d.business_id }, ref, occurrence: Number(d.occurrence), kind: d.kind as "new" | "reopened", improvement: rec.improvement, intel, now });
    if (containsSensitive(email.text)) { await suppress("content looked like it contained a credential, so it was not sent"); continue; }
    const r = await send({ to: cfg.to, from: cfg.from, subject: email.subject, text: email.text, html: email.html, idempotencyKey: d.idempotency_key });
    if (r.ok) {
      await db.execute(sql`update grokbot_deliveries set status = 'sent', sent_at = now(), resend_email_id = ${r.id ?? null}, subject = ${email.subject}, last_error = null, updated_at = now() where id = ${d.id}::uuid`);
      await logRecommendationEvent(rec.id, d.business_id, "sent_to_grokbot", { note: `emailed to GrokBot (${d.kind}, occurrence ${d.occurrence}); workflow status unchanged`, meta: { resendEmailId: r.id, to: cfg.to } });
      out.sent++;
      slots--;
    } else {
      // d.attempts already includes this attempt (the claim incremented it)
      await db.execute(sql`update grokbot_deliveries set status = 'failed', last_error = ${r.error ?? "send failed"}, subject = ${email.subject}, next_attempt_at = ${new Date(now.getTime() + retryDelayMs(Number(d.attempts))).toISOString()}::timestamptz, updated_at = now() where id = ${d.id}::uuid`);
      out.failed++;
    }
  }
  return out;
}

export async function loadDeliveries(businessId: string): Promise<Map<string, { status: string; sentAt: string | null; occurrence: number; error: string | null }>> {
  const db = getDb();
  const m = new Map<string, { status: string; sentAt: string | null; occurrence: number; error: string | null }>();
  if (!db) return m;
  const rows = rowsOf<{ recommendation_id: string; status: string; sent_at: string | null; occurrence: number; last_error: string | null }>(await db.execute(sql`
    select recommendation_id, status, sent_at, occurrence, last_error from grokbot_deliveries where business_id = ${businessId} and recommendation_id is not null order by occurrence, created_at`));
  for (const r of rows) m.set(r.recommendation_id, { status: r.status, sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null, occurrence: Number(r.occurrence), error: r.last_error });
  return m;
}

/** Plain-language delivery report for the Friday owner email, including any failure. */
export async function grokbotSummary(now = new Date()): Promise<{ text: string; html: string }> {
  const db = getDb();
  if (!db) return { text: "", html: "" };
  const act = await getActivation();
  const cfg = grokbotConfig();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const rows = rowsOf<{ status: string; n: number }>(await db.execute(sql`select status, count(*)::int n from grokbot_deliveries where kind in ('new', 'reopened') and created_at >= ${since}::timestamptz group by 1`));
  const c = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  const fails = rowsOf<{ name: string; last_error: string | null; attempts: number; status: string }>(await db.execute(sql`
    select b.name, d.last_error, d.attempts, d.status from grokbot_deliveries d join businesses b on b.id = d.business_id where d.kind <> 'test' and d.status in ('failed') and d.created_at >= ${since}::timestamptz limit 5`));
  const line = !act
    ? "  GrokBot recommendation emails: not active."
    : `  GrokBot recommendation emails (last 7 days, to ${cfg.to}): ${c("sent")} sent, ${c("pending") + c("sending")} waiting (daily cap ${cfg.dailyCap}), ${c("failed")} failed, ${c("suppressed")} suppressed.${cfg.paused ? " PAUSED." : ""}`;
  const failLines = fails.map((f) => `    FAILED: ${f.name}: ${f.last_error ?? "unknown"} (${f.attempts} of ${MAX_ATTEMPTS} attempts${f.status === "failed" && f.attempts >= MAX_ATTEMPTS ? ", gave up" : ", will retry"})`);
  const text = [line, ...failLines].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return { text, html: `<p style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto 12px;font-size:13px;color:${fails.length ? "#b91c1c" : "#3f3f46"}">${esc(line.trim())}${fails.map((f) => `<br>FAILED: ${esc(f.name)}: ${esc(f.last_error ?? "unknown")}`).join("")}</p>` };
}

/** The controlled TEST message: clearly marked, not tied to any real recommendation, sent once per call through the same pipeline and logged. */
export async function sendGrokbotTest(now = new Date(), send: SendFn = sendViaResend): Promise<{ ok: boolean; resendEmailId?: string; subject: string; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, subject: "", error: "no_db" };
  const cfg = grokbotConfig();
  const [site] = rowsOf<{ id: string; name: string; website: string | null }>(await db.execute(sql`select id, name, website from businesses where account_type = 'house' and name = 'GravyBlock' limit 1`));
  const intel = site ? await reportIntel(site.id) : null;
  if (!site || !intel) return { ok: false, subject: "", error: "no house report data to build the test from" };
  const imp: Improvement = {
    kind: "low_ctr", issue: "test", identityUrls: [], title: "TEST ONLY: example recommendation (do not implement)", urls: [`${site.website?.replace(/\/$/, "") ?? "https://gravyblock.com"}/example-test-page`],
    evidence: ["This is a delivery test. No real Search Console finding is described here."], competitorUrls: [], actions: ["Do nothing. This message only checks that GravyBlock recommendation emails reach GrokBot."],
    acceptance: ["Reply or log that the TEST message arrived. No site change is needed."], potentialClicks28: 0, priority: 0,
  };
  const email = buildGrokbotEmail({ site: { name: site.name, website: site.website, businessId: site.id }, ref: "SR-TEST00", occurrence: 1, kind: "test", improvement: imp, intel, now });
  const key = `test:${now.toISOString()}`;
  const [row] = rowsOf<{ id: string }>(await db.execute(sql`insert into grokbot_deliveries (recommendation_id, business_id, occurrence, idempotency_key, kind, status, subject, attempts) values (null, ${site.id}::uuid, 1, ${key}, 'test', 'sending', ${email.subject}, 1) returning id`));
  const r = await send({ to: cfg.to, from: cfg.from, subject: email.subject, text: email.text, html: email.html, idempotencyKey: key });
  if (r.ok) await db.execute(sql`update grokbot_deliveries set status = 'sent', sent_at = now(), resend_email_id = ${r.id ?? null}, updated_at = now() where id = ${row!.id}::uuid`);
  else await db.execute(sql`update grokbot_deliveries set status = 'failed', last_error = ${r.error ?? "send failed"}, updated_at = now() where id = ${row!.id}::uuid`);
  return { ok: r.ok, resendEmailId: r.id, subject: email.subject, error: r.error };
}
