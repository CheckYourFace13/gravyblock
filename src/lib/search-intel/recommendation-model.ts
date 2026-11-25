/**
 * Recommendation lifecycle rules: pure functions, no database, so every rule that decides what the owner sees, and when, is unit tested.
 *
 * Identity: a recommendation is the same recommendation when business, issue type and affected URLs are the same. Numbers in the evidence change every week and are
 * deliberately NOT part of the identity, so weekly regeneration refreshes a record instead of creating a duplicate task.
 *
 * Status (workflow): new -> opened -> in_progress -> completed -> verified, or dismissed. Opening a report is a view, never work started. "Copied/handed off" is a
 * separate flag. Completed means the owner or developer says it is done; verified means a read-only check of the live page confirmed it. A ranking change never
 * completes or verifies anything: search results are measured separately as an outcome.
 */
import { createHash } from "node:crypto";

export type Status = "new" | "opened" | "in_progress" | "completed" | "verified" | "dismissed";
export const STATUS_LABEL: Record<Status, string> = { new: "New", opened: "Opened", in_progress: "In progress", completed: "Completed", verified: "Verified", dismissed: "Dismissed" };

export function normalizeUrl(u: string): string {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.hostname.replace(/^www\./i, "").toLowerCase()}${p.pathname.replace(/\/+$/, "") || ""}`;
  } catch {
    return u.trim().toLowerCase();
  }
}

export function fingerprintOf(businessId: string, kind: string, issue: string, identityUrls: string[]): string {
  const urls = [...new Set(identityUrls.map(normalizeUrl))].sort().join(",");
  return createHash("sha256").update(`${businessId}|${kind}|${issue.toLowerCase()}|${urls}`).digest("hex").slice(0, 24);
}

export const shortRef = (fingerprint: string): string => `SR-${fingerprint.slice(0, 6).toUpperCase()}`;

/** A verified recommendation that shows up again within this many days is treated as stale search data from before the fix, not a recurrence. */
export const REOPEN_GRACE_DAYS = 28;
const DAY = 86_400_000;

export type RecState = { status: Status; verifiedAt: Date | null; occurrence: number };
export type SeenOutcome = { action: "create" | "update" | "reopen" | "keep"; status: Status; occurrence: number };

/** What happens to a record when a weekly regeneration (or the daily sync) finds this recommendation again. */
export function onSeen(rec: RecState | null, now: Date): SeenOutcome {
  if (!rec) return { action: "create", status: "new", occurrence: 1 };
  if (rec.status === "dismissed") return { action: "keep", status: "dismissed", occurrence: rec.occurrence };
  if (rec.status === "verified") {
    const aged = rec.verifiedAt ? now.getTime() - rec.verifiedAt.getTime() > REOPEN_GRACE_DAYS * DAY : true;
    return aged ? { action: "reopen", status: "new", occurrence: rec.occurrence + 1 } : { action: "keep", status: "verified", occurrence: rec.occurrence };
  }
  return { action: "update", status: rec.status, occurrence: rec.occurrence }; // new, opened, in_progress, completed all keep their status
}

/** Opening a report moves only a NEW recommendation to OPENED. Anything further along is untouched, and a view never means work started. */
export const afterOpen = (s: Status): Status => (s === "new" ? "opened" : s);

const ALLOWED: Record<Status, Status[]> = {
  new: ["in_progress", "completed", "dismissed"],
  opened: ["in_progress", "completed", "dismissed"],
  in_progress: ["completed", "dismissed", "opened"],
  completed: ["in_progress", "dismissed"],
  verified: ["dismissed"],
  dismissed: ["new"], // restore
};
export const canTransition = (from: Status, to: Status): boolean => ALLOWED[from].includes(to);

/** Owner-driven statuses only; "verified" can only be reached by a passing live check (see evaluateVerification). */
export const OWNER_STATUSES: Status[] = ["in_progress", "completed", "dismissed"];

export type EmailBucket = "NEW" | "REOPENED" | "STILL_UNOPENED" | "OPENED" | "IN_PROGRESS" | "COMPLETED_AWAITING" | "VERIFIED";
export const BUCKET_LABEL: Record<EmailBucket, string> = {
  NEW: "NEW this week",
  REOPENED: "REOPENED (came back after being verified)",
  STILL_UNOPENED: "STILL OPEN, not yet opened (already reported earlier)",
  OPENED: "OPENED, not started",
  IN_PROGRESS: "IN PROGRESS",
  COMPLETED_AWAITING: "COMPLETED, awaiting verification",
  VERIFIED: "VERIFIED fixes",
};

export type EmailRec = { status: Status; occurrence: number; firstEmailedAt: Date | null; verifiedNotifiedAt: Date | null; lastSeenAt: Date };
const STALE_DAYS = 21;

/**
 * Where a recommendation belongs in the Friday email. Each unfinished item is promoted as NEW only once: after the first email that lists it, it is a still-open
 * or opened or in-progress item. Dismissed items are never listed; a fix is announced as verified once.
 */
export function emailBucket(rec: EmailRec, now: Date): EmailBucket | null {
  const stale = now.getTime() - rec.lastSeenAt.getTime() > STALE_DAYS * DAY;
  switch (rec.status) {
    case "dismissed": return null;
    case "verified": return rec.verifiedNotifiedAt ? null : "VERIFIED";
    case "completed": return "COMPLETED_AWAITING";
    case "in_progress": return "IN_PROGRESS";
    case "opened": return stale ? null : "OPENED";
    case "new":
      if (stale) return null;
      if (!rec.firstEmailedAt) return rec.occurrence > 1 ? "REOPENED" : "NEW";
      return "STILL_UNOPENED";
  }
}

/* ───────────── read-only verification of a deployed fix ───────────── */

export type PageSnap = {
  url: string;
  status: number | null;
  title: string;
  description: string;
  robots: string;
  canonical: string;
  h1s: number;
  h2s: number;
  words: number;
  ogImage: boolean;
  indexable: boolean;
  at: string;
};

const attr = (html: string, re: RegExp) => html.match(re)?.[1]?.replace(/\s+/g, " ").trim() ?? "";

export function snapshotFromHtml(url: string, status: number | null, html: string, xRobots: string | null, at: string): PageSnap {
  const meta = (name: string) => attr(html, new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i")) || attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"));
  const robots = `${meta("robots")} ${xRobots ?? ""}`.trim().toLowerCase();
  const body = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = body.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    url,
    status,
    title: attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: meta("description"),
    robots,
    canonical: attr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || attr(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i),
    h1s: (body.match(/<h1\b/gi) ?? []).length,
    h2s: (body.match(/<h2\b/gi) ?? []).length,
    words: text ? text.split(" ").length : 0,
    ogImage: /<meta[^>]+property=["']og:image["'][^>]*content=["'][^"']+["']/i.test(html) || /<meta[^>]+content=["'][^"']+["'][^>]*property=["']og:image["']/i.test(html),
    indexable: status !== null && status < 400 && !/noindex/.test(robots),
    at,
  };
}

export type Check = { url: string; check: string; before: string | null; after: string; pass: boolean };
export type VerifyResult = { deployed: boolean | null; level: "defect_cleared" | "change_observed" | "none"; checks: Check[]; at: string; note: string };

const changed = (b: PageSnap | undefined, c: PageSnap): string[] => {
  if (!b) return [];
  const out: string[] = [];
  if (b.title !== c.title) out.push("title");
  if (b.description !== c.description) out.push("description");
  if (b.h2s !== c.h2s) out.push("sections");
  if (b.words && Math.abs(c.words - b.words) / b.words >= 0.1) out.push("body length");
  return out;
};

/**
 * Did the fix reach production? Compares the live pages now with the snapshots taken when the recommendation was first seen. "defect_cleared" means the specific
 * problem is no longer present; "change_observed" means the page differs from before (quality is not judged). Pages that cannot be fetched make the result
 * "cannot check" (deployed null), never a pass.
 */
export function evaluateVerification(kind: string, issue: string, baseline: PageSnap[], current: PageSnap[], now: Date): VerifyResult {
  const at = now.toISOString();
  const base = new Map(baseline.map((b) => [normalizeUrl(b.url), b]));
  const checks: Check[] = [];
  const unreachable = current.filter((c) => c.status === null);
  if (!current.length) return { deployed: null, level: "none", checks, at, note: "No page to check for this recommendation." };
  if (unreachable.length === current.length) return { deployed: null, level: "none", checks, at, note: "None of the pages could be fetched, so nothing was verified." };
  const live = current.filter((c) => c.status !== null);
  let level = "change_observed" as VerifyResult["level"];

  const defect = (test: (c: PageSnap) => boolean, label: string, show: (c: PageSnap) => string) => {
    level = "defect_cleared";
    for (const c of live) checks.push({ url: c.url, check: label, before: base.get(normalizeUrl(c.url)) ? show(base.get(normalizeUrl(c.url))!) : null, after: show(c), pass: test(c) });
  };

  const sub = issue.split(":")[1] ?? "";
  if (kind === "indexing" || kind === "declining") defect((c) => c.indexable && (!c.canonical || normalizeUrl(c.canonical) === normalizeUrl(c.url)), "live, indexable, canonical points to itself", (c) => `status ${c.status}, robots "${c.robots || "none"}", canonical ${c.canonical || "none"}`);
  else if (kind === "confirmed_problem" && sub === "no_social_image") defect((c) => c.ogImage, "og:image present", (c) => (c.ogImage ? "present" : "missing"));
  else if (kind === "confirmed_problem" && sub === "multiple_h1") defect((c) => c.h1s === 1, "exactly one h1", (c) => `${c.h1s} h1`);
  else if (kind === "confirmed_problem" && sub === "title_too_long") defect((c) => c.title.length > 0 && c.title.length <= 60, "title 60 characters or fewer", (c) => `${c.title.length} characters`);
  else if (kind === "confirmed_problem" && sub === "description_too_long") defect((c) => c.description.length > 0 && c.description.length <= 160, "description 160 characters or fewer", (c) => `${c.description.length} characters`);
  else {
    for (const c of live) {
      const diff = changed(base.get(normalizeUrl(c.url)), c);
      checks.push({ url: c.url, check: "page differs from before the work", before: base.get(normalizeUrl(c.url)) ? "snapshot taken when first reported" : null, after: diff.length ? `changed: ${diff.join(", ")}` : "no visible change", pass: diff.length > 0 });
    }
  }
  const allPass = checks.length > 0 && checks.every((c) => c.pass);
  const anyPass = checks.some((c) => c.pass);
  return {
    deployed: unreachable.length ? null : allPass,
    level: allPass ? level : "none",
    checks,
    at,
    note: allPass
      ? level === "defect_cleared" ? "The specific problem is no longer present on the live page(s). This confirms the fix is deployed, not that search results improved." : "The live page(s) differ from before the work. This confirms a change is deployed; its quality and effect are not judged here."
      : anyPass ? "Only some pages show the fix." : "The live page(s) do not yet show the fix.",
  };
}

/* ───────────── measured outcome in Search Console (never causal) ───────────── */

export type Win = { clicks: number; impressions: number };
export type Outcome = { verdict: "improved" | "no_material_change" | "declined" | "low_sample" | "too_early"; before: Win | null; after: Win | null; note: string; measuredAt: string };

export function outcomeWindows(completedAt: Date, now: Date): { before: { start: string; end: string }; after: { start: string; end: string }; ready: boolean } {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const day = new Date(Date.UTC(completedAt.getUTCFullYear(), completedAt.getUTCMonth(), completedAt.getUTCDate()));
  const afterEnd = new Date(day.getTime() + 27 * DAY);
  return {
    before: { start: d(new Date(day.getTime() - 28 * DAY)), end: d(new Date(day.getTime() - DAY)) },
    after: { start: d(day), end: d(afterEnd) },
    ready: afterEnd.getTime() <= now.getTime() - 3 * DAY,
  };
}

/** A page's clicks and impressions before and after, judged cautiously. Small numbers are "low sample"; a rise is a measured change, not proof the work caused it. */
export function classifyOutcome(before: Win | null, after: Win | null, ready: boolean, now: Date): Outcome {
  const measuredAt = now.toISOString();
  if (!ready) return { verdict: "too_early", before, after, note: "The 28 days after completion are not complete yet, so no result is claimed.", measuredAt };
  if (!before || !after) return { verdict: "low_sample", before, after, note: "Search Console data for one of the windows was unavailable.", measuredAt };
  if (before.clicks + after.clicks < 10 && before.impressions + after.impressions < 100) return { verdict: "low_sample", before, after, note: "Too few clicks and impressions to read a change.", measuredAt };
  const delta = after.clicks - before.clicks;
  const margin = Math.max(3, Math.round(before.clicks * 0.2));
  const verdict = delta >= margin ? "improved" : delta <= -margin ? "declined" : "no_material_change";
  return { verdict, before, after, note: "A measured change in this page's Google clicks over equal 28-day windows. Other factors (season, ranking changes elsewhere) also move these numbers, so this is not proof the work caused it.", measuredAt };
}
