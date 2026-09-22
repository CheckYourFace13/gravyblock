/**
 * AEO Action Engine.
 *
 * Turns "AI assistant did not mention this business" probes into a legitimate
 * next step: when the customer's verified Business Truth genuinely supports
 * answering the question the AI was asked, queue ONE direct-answer article
 * (the existing publisher writes it from verified facts only). If the truth
 * does not support an answer, nothing is written. Improvement is claimed
 * (proof ledger) only when a LATER probe shows a mention after a verified
 * publish.
 */

import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { aiVisibilityChecks, businesses, contentQueue, getDb, jobs, publishedContent } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { recordProof } from "@/lib/proof/ledger";
import { ensureFreshTruth, type BusinessTruth } from "@/lib/truth";

const DAY = 86_400_000;
const WINDOW_DAYS = 45;
const RECHECK_DAYS = 30;
const GIVE_UP_DAYS = 120;
const MAX_PER_BUSINESS = 2;

// Words that make up the *shape* of a recommendation question, not its topic.
const GENERIC = new Set([
  "best", "top", "rated", "highly", "recommend", "recommendation", "recommendations", "trusted", "looking", "want", "someone", "great",
  "reviews", "review", "reputation", "strong", "give", "who", "what", "whats", "the", "most", "for", "you", "and", "are", "can", "near",
  "nearby", "provider", "providers", "company", "companies", "services", "service", "local", "area", "options", "available", "leading",
  "with", "that", "have", "any", "good", "which", "how", "does", "get", "find", "need", "your", "our",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function topicTokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length > 2 && !GENERIC.has(t))
    .map((t) => t.replace(/(ing|es|s)$/, ""))
    .filter((t) => t.length > 2);
}

/** Prompts written before category/city were verified ("best other near ") measure nothing. */
function isMeaningfulPrompt(prompt: string): boolean {
  if (/other/i.test(prompt)) return false;
  if (/(in|near|serving)s*[?.]?s*(give|who|i want|$)/i.test(prompt)) return false;
  return true;
}

/** A non-claiming, natural page title from the probe's topic ("How to choose boat rentals in Chicago"), or null. */
function titleFromPrompt(prompt: string): string | null {
  const m = prompt.match(/(?:best|highly-rated|most trusted|top-rated|leading)s+(.+?)s+((?:in|near|serving)s+[^?.]+?)s*(?:[?.]|$)/i);
  if (!m) return null;
  const what = m[1]!.replace(/s+(providers?|options|companies|services)$/i, "").trim();
  const where = m[2]!.trim();
  if (!what || what.length > 60 || where.length > 60) return null;
  return `How to choose ${what} ${where}`;
}

/** Does the verified truth support answering this topic? Returns the matching truth items, or []. */
function supportingTruth(truth: BusinessTruth, topic: string[]): string[] {
  if (!truth.sufficient || topic.length === 0) return [];
  const pool = [
    ...truth.services,
    ...(truth.description ? [truth.description] : []),
    ...truth.facts.filter((f) => f.key === "page_topic").map((f) => f.value),
  ];
  const hits: string[] = [];
  for (const item of pool) {
    const it = new Set(topicTokens(item));
    const matched = topic.filter((t) => it.has(t)).length;
    if (matched >= 1 && matched / topic.length >= 0.34) hits.push(item);
  }
  return hits.slice(0, 5);
}

async function inspectCitedSource(url: string): Promise<{ title: string | null; h1: string | null; schema: string[] } | null> {
  const r = await safeFetchText(url, { timeoutMs: 7000 });
  if (!r.ok || r.status >= 400) return null;
  const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const title = strip(r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const h1 = strip(r.body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const schema = ["FAQPage", "HowTo", "LocalBusiness"].filter((t) => new RegExp(`"@type"\\s*:\\s*(\\[[^\\]]*)?"${t}"`, "i").test(r.body));
  return { title, h1, schema };
}

type Db = NonNullable<ReturnType<typeof getDb>>;

async function alreadyActedOnPrompt(db: Db, businessId: string, prompt: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "aeo_action"), gte(jobs.createdAt, since), sql`${jobs.payload}->>'prompt' = ${prompt}`))
    .limit(1);
  return !!row;
}

import { recordOpportunity, markActed, recordMeasuredResultByDedupeKey } from "@/lib/opportunities/queue";
import { buildMeasurementPlan } from "@/lib/opportunities/measurement";

export async function runAeoActionForBusiness(businessId: string): Promise<{ queued: number; considered: number }> {
  const db = getDb();
  if (!db) return { queued: 0, considered: 0 };
  let queued = 0;
  let considered = 0;
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * DAY);
    const checks = await db
      .select()
      .from(aiVisibilityChecks)
      .where(and(eq(aiVisibilityChecks.businessId, businessId), gte(aiVisibilityChecks.createdAt, since), eq(aiVisibilityChecks.mentionFound, "false")))
      .orderBy(desc(aiVisibilityChecks.createdAt))
      .limit(60);
    if (!checks.length) return { queued, considered };

    // One candidate per distinct prompt; prefer ones with a cited source.
    const byPrompt = new Map<string, (typeof checks)[number]>();
    for (const c of checks) {
      const cur = byPrompt.get(c.prompt);
      if (!cur || (!cur.citationUrl && c.citationUrl)) byPrompt.set(c.prompt, c);
    }
    const candidates = [...byPrompt.values()].filter((c) => isMeaningfulPrompt(c.prompt)).sort((a, b) => Number(!!b.citationUrl) - Number(!!a.citationUrl));

    const truth = await ensureFreshTruth(businessId);
    const existing = await db.select({ title: contentQueue.title }).from(contentQueue).where(eq(contentQueue.businessId, businessId)).orderBy(desc(contentQueue.createdAt)).limit(300);
    const used = new Set(existing.map((e) => norm(e.title)));

    for (const c of candidates) {
      if (considered >= MAX_PER_BUSINESS) break;
      if (await alreadyActedOnPrompt(db, businessId, c.prompt)) continue;
      considered++;

      let cited: Awaited<ReturnType<typeof inspectCitedSource>> = null;
      if (c.citationUrl) cited = await inspectCitedSource(c.citationUrl);
      const gapReason = cited
        ? `AI answer cites a third-party page${cited.title || cited.h1 ? ` ("${cited.h1 ?? cited.title}")` : ""}${cited.schema.length ? ` with ${cited.schema.join("/")} schema` : ""}; the business has no page directly answering this question.`
        : "No cited source available; the business has no page directly answering this question.";

      const topic = topicTokens([c.prompt, cited?.h1 ?? "", cited?.title ?? ""].join(" "));
      // Base support on the prompt's own topic first (the cited page can only add words, so require the prompt topic itself to match).
      const support = supportingTruth(truth, topicTokens(c.prompt));
      const title = titleFromPrompt(c.prompt);

      await recordOpportunity({
        businessId,
        opportunityType: "aeo",
        engine: "aeo_action",
        evidence: { prompt: c.prompt, engine: c.engine, citedUrl: c.citationUrl, topic },
        expectedImpact: c.citationUrl ? 55 : 40,
        confidence: title && support.length > 0 ? 70 : 30,
        cost: 3,
        risk: 2,
        requiredCapability: "website_write",
        autoEligible: Boolean(title && support.length > 0),
        dedupeKey: `aeo_gap:${businessId}:${c.prompt}`,
      }).catch(() => undefined);

      if (!title || support.length === 0 || used.has(norm(title))) {
        await db.insert(jobs).values({
          businessId,
          type: "aeo_action",
          status: "no_supported_answer",
          payload: { prompt: c.prompt, engine: c.engine, citedUrl: c.citationUrl, gapReason, reason: !title ? "prompt_not_actionable" : used.has(norm(title)) && support.length ? "already_queued" : truth.sufficient ? "truth_does_not_cover_topic" : truth.insufficientReason, topic },
        });
        continue;
      }

      await db.insert(contentQueue).values({
        businessId,
        kind: "article",
        title,
        outline: `Answer directly in the first sentence, then supporting detail; include an FAQ section; use ONLY verified facts. Relevant verified items: ${support.join("; ")}. Do not claim the company is the best, top-rated or most trusted unless a verified fact says so. Do not copy or paraphrase any third-party source.`,
        targetKeyword: topicTokens(c.prompt).join(" ").slice(0, 100) || null,
        status: "queued",
        variant: "aeo_action",
      });
      used.add(norm(title));
      await db.insert(jobs).values({
        businessId,
        type: "aeo_action",
        status: "queued",
        payload: {
          prompt: c.prompt,
          engine: c.engine,
          citedUrl: c.citationUrl,
          gapReason,
          queuedTitle: title,
          baselineMention: false,
          recheckAfter: new Date(Date.now() + RECHECK_DAYS * DAY).toISOString(),
        },
      });
      await markActed(`aeo_gap:${businessId}:${c.prompt}`, { actionId: c.prompt, verificationStatus: "unverified", measurementPlan: buildMeasurementPlan("aeo", 0, "n/a") });
      queued++;
    }
  } catch (err) {
    console.error("[aeo-actions] failed", { businessId, error: err instanceof Error ? err.message : String(err) });
  }
  return { queued, considered };
}

/** Paid businesses with recent "not mentioned" probes; bounded by `limit` businesses per run. */
export async function runAeoActionBatch(limit = 4): Promise<{ businesses: number; queued: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, queued: 0 };
  let n = 0;
  let queued = 0;
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * DAY);
    const rows = await db
      .selectDistinct({ businessId: aiVisibilityChecks.businessId })
      .from(aiVisibilityChecks)
      .innerJoin(businesses, eq(businesses.id, aiVisibilityChecks.businessId))
      .where(and(gte(aiVisibilityChecks.createdAt, since), eq(aiVisibilityChecks.mentionFound, "false"), notInArray(businesses.planTier, ["free"])))
      .limit(100);
    for (const r of rows) {
      if (n >= limit) break;
      if (!r.businessId) continue;
      // Skip businesses that acted this week and have nothing new to consider.
      const [recent] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.businessId, r.businessId), eq(jobs.type, "aeo_action"), gte(jobs.createdAt, new Date(Date.now() - 7 * DAY))))
        .limit(1);
      if (recent) continue;
      const res = await runAeoActionForBusiness(r.businessId);
      if (res.considered > 0) n++;
      queued += res.queued;
    }
  } catch (err) {
    console.error("[aeo-actions] batch failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return { businesses: n, queued };
}

/**
 * For queued aeo_action jobs past recheckAfter: if the article was really
 * published (public URL returns 200) and a LATER probe (same prompt + engine)
 * exists, mark rechecked; record proof only when that probe shows a mention.
 */
export async function runAeoRecheckBatch(limit = 4): Promise<{ rechecked: number; proofs: number }> {
  const db = getDb();
  if (!db) return { rechecked: 0, proofs: 0 };
  let rechecked = 0;
  let proofs = 0;
  try {
    const jobRows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, "aeo_action"), eq(jobs.status, "queued"), sql`(${jobs.payload}->>'recheckAfter')::timestamptz <= now()`))
      .orderBy(jobs.createdAt)
      .limit(50);

    for (const job of jobRows) {
      if (rechecked >= limit) break;
      if (!job.businessId) continue;
      const p = (job.payload ?? {}) as { prompt?: string; engine?: string; queuedTitle?: string };
      if (!p.prompt || !p.queuedTitle) continue;
      try {
        const ageDays = (Date.now() - job.createdAt.getTime()) / DAY;

        const [queueRow] = await db
          .select({ id: contentQueue.id, status: contentQueue.status })
          .from(contentQueue)
          .where(and(eq(contentQueue.businessId, job.businessId), eq(contentQueue.title, p.queuedTitle), eq(contentQueue.variant, "aeo_action")))
          .orderBy(desc(contentQueue.createdAt))
          .limit(1);

        let pub: { id: string; publicUrl: string | null; createdAt: Date } | undefined;
        if (queueRow?.status === "published") {
          [pub] = await db
            .select({ id: publishedContent.id, publicUrl: publishedContent.publicUrl, createdAt: publishedContent.createdAt })
            .from(publishedContent)
            .where(and(eq(publishedContent.queueId, queueRow.id), eq(publishedContent.status, "published")))
            .limit(1);
        }
        let live = false;
        if (pub?.publicUrl) {
          const r = await safeFetchText(pub.publicUrl, { timeoutMs: 10000 });
          live = r.ok && r.status === 200;
        }

        if (!pub || !live) {
          if (ageDays > GIVE_UP_DAYS) {
            await db.update(jobs).set({ status: "expired_unpublished", payload: { ...p, note: "article never verified live; no claim made" } }).where(eq(jobs.id, job.id));
          }
          continue;
        }

        // Newest probe for the same prompt (same engine when known) AFTER the page went live.
        const [probe] = await db
          .select({ mentionFound: aiVisibilityChecks.mentionFound, engine: aiVisibilityChecks.engine, createdAt: aiVisibilityChecks.createdAt })
          .from(aiVisibilityChecks)
          .where(
            and(
              eq(aiVisibilityChecks.businessId, job.businessId),
              eq(aiVisibilityChecks.prompt, p.prompt),
              gte(aiVisibilityChecks.createdAt, pub.createdAt),
              ...(p.engine ? [eq(aiVisibilityChecks.engine, p.engine)] : []),
            ),
          )
          .orderBy(desc(aiVisibilityChecks.createdAt))
          .limit(1);

        if (!probe) {
          if (ageDays > GIVE_UP_DAYS) {
            await db.update(jobs).set({ status: "expired_no_probe", payload: { ...p, publicUrl: pub.publicUrl, note: "no later probe; no claim made" } }).where(eq(jobs.id, job.id));
          }
          continue;
        }

        const mentionNow = probe.mentionFound === "true";
        await db
          .update(jobs)
          .set({ status: "rechecked", payload: { ...p, publicUrl: pub.publicUrl, publishedAt: pub.createdAt.toISOString(), recheckedAt: new Date().toISOString(), mentionNow } })
          .where(eq(jobs.id, job.id));
        rechecked++;

        if (mentionNow) {
          const res = await recordProof({
            businessId: job.businessId,
            actionType: "aeo_action",
            engine: "aeo",
            proofCategory: "aeo",
            destination: pub.publicUrl,
            summary: "published a direct-answer page and AI assistants began mentioning the business",
            beforeEvidence: { mention: false, prompt: p.prompt },
            afterEvidence: { mention: true, engine: probe.engine, publicUrl: pub.publicUrl, probedAt: probe.createdAt.toISOString() },
            metricName: "ai_mention",
            metricBefore: 0,
            metricAfter: 1,
            methodVersion: "ai_probe_recheck_v1",
            dedupeKey: `aeo_action:${job.id}`,
          });
          if (res.recorded) proofs++;
          await recordMeasuredResultByDedupeKey(`aeo_gap:${job.businessId}:${p.prompt}`, "positive", { engine: probe.engine, publicUrl: pub.publicUrl });
        } else if (ageDays > RECHECK_DAYS + 14) {
          // Given a fair window past the recheck date with no mention yet, call it honestly rather than leaving it open forever.
          await recordMeasuredResultByDedupeKey(`aeo_gap:${job.businessId}:${p.prompt}`, "no_material_change", { publicUrl: pub.publicUrl, note: "no AI mention detected within a fair window after publishing" });
        }
      } catch (err) {
        console.error("[aeo-recheck] job failed", { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("[aeo-recheck] batch failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return { rechecked, proofs };
}
