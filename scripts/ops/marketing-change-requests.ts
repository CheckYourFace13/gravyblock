// Change-request engine V2 operations.
//   tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-change-requests.ts list
//   tsx ... marketing-change-requests.ts plan <publicationId>      what the owner's note would do (nothing is stored, flagged or changed; uses the capped AI step when the rules cannot read the note)
//   tsx ... marketing-change-requests.ts queue <publicationId|all>  put the request back in the queue; the worker rebuilds the script from its source, renders, runs QA, uploads a NEW unlisted video and emails the owner
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { getSetting } from "../../src/lib/marketing-studio/runtime";
import { jobKey, queueReplacement, requeueReplacement, type ReplacementJob } from "../../src/lib/marketing-studio/publishing/review-replacement";
import { getReview, listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { prepareRevision } from "../../src/lib/marketing-studio/revisions/run";
import { boardOf, reconstructConcept, sourceKey, type RevisionSource } from "../../src/lib/marketing-studio/revisions/source";
import { conceptKey, discoveryKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";
import type { PageDiscovery } from "../../src/lib/marketing-studio/video/concepts/types";
import { demoSpecFor } from "../../src/lib/marketing-studio/video/demo/specs";
import { ensureSpec } from "../../src/lib/marketing-studio/video/concepts/registry";
import { spendNow } from "../../src/lib/marketing-studio/video/concepts/ai-budget";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const db = requireStudioDb();
  const open = (await listReviews(db)).filter((r) => r.status === "changes_requested");
  if (cmd === "list") {
    for (const r of open) {
      const job = await getSetting<ReplacementJob | null>(jobKey(r.publicationId), null, db);
      console.log(JSON.stringify({ publicationId: r.publicationId, product: r.productName, spec: r.specId, note: r.changesNote, hints: r.changesHints ?? null, job: job ? { status: job.status, attempts: job.attempts, generation: job.generation, detail: job.detail?.slice(0, 160) } : null }));
    }
    return;
  }
  if (cmd === "plan" && arg) {
    const r = await getReview(db, arg);
    if (!r) throw new Error("no such review");
    const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.id === r.productId)!;
    const specId = r.specId ?? product.slug;
    await ensureSpec(db, specId);
    const out = await prepareRevision(db, { productId: product.id, slug: product.slug, productName: product.name, origin: demoSpecFor(specId).site.origin, specId, supersedes: r.publicationId, note: r.changesNote ?? "", hints: r.changesHints }, { dry: true });
    if (!out.ok) {
      console.log(JSON.stringify({ result: out.kind, reason: out.reason, options: "options" in out ? out.options : undefined, plan: "revision" in out ? out.revision?.plan : undefined }, null, 1));
      return;
    }
    const rev = out.revision;
    console.log(JSON.stringify({ result: "ok", interpretedBy: rev.interpretedBy, aiMicros: rev.aiMicros, summary: out.understood, ops: rev.plan.ops, factual: rev.plan.factual, recheck: rev.recheck?.note, scenes: rev.scenesAffected, seconds: [rev.before.seconds, rev.after.seconds] }, null, 1));
    const was = new Map(rev.before.lines.map((l) => [l.id, l.spoken]));
    for (const l of rev.after.lines) console.log(`${was.get(l.id) === l.spoken ? "  " : "~ "}${l.id} ${l.scene}: ${l.spoken}${was.get(l.id) === l.spoken ? "" : `\n    was: ${was.get(l.id) ?? "(new)"}`}`);
    for (const id of rev.before.lines.map((l) => l.id).filter((id) => !rev.after.lines.some((l) => l.id === id))) console.log(`- ${id} removed: ${was.get(id)}`);
    console.log("steps after:", rev.after.steps.join(" | "));
    return;
  }
  if (cmd === "source" && arg) {
    // what the saved source for this request is (or would be), rebuilt from the approved video's own record; nothing is stored
    const r = await getReview(db, arg);
    if (!r) throw new Error("no such review");
    const specId = r.specId ?? (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.id === r.productId)!.slug;
    await ensureSpec(db, specId);
    const saved = await getSetting<RevisionSource | null>(sourceKey(arg), null, db);
    if (saved) {
      console.log("saved source:", saved.origin, saved.savedAt);
      for (const l of saved.concept?.narration ?? []) console.log(l.id, l.sceneId, l.spoken, l.claims.join(","));
      return;
    }
    const cur = (await getSetting<StoredConcept | null>(conceptKey(specId), null, db))?.concept;
    const board = await boardOf(db, arg);
    const rebuilt = cur && board ? reconstructConcept(cur, board, ((await getSetting<PageDiscovery[] | null>(discoveryKey(cur.slug), null, db)) ?? []).filter(Boolean)) : null;
    console.log(rebuilt ? "rebuilt from the approved video's record:" : "COULD NOT REBUILD", "est", rebuilt?.estSeconds);
    for (const l of rebuilt?.narration ?? []) console.log(l.id, l.sceneId, l.spoken, l.claims.join(","));
    console.log("steps:", rebuilt?.capturePlan.map((p) => p.clicks.map((k) => k.name + " -> " + k.payoff.slice(0, 50)).join(" | ")).join(" || "));
    return;
  }
  if (cmd === "queue" && arg) {
    const targets = arg === "all" ? open : open.filter((r) => r.publicationId === arg);
    for (const r of targets) {
      const job = await getSetting<ReplacementJob | null>(jobKey(r.publicationId), null, db);
      const next = job ? await requeueReplacement(db, r.publicationId) : await queueReplacement(db, "change-requests-v2", r);
      console.log(`${r.productName} ${r.publicationId}: ${next.status}, generation ${next.generation}`);
    }
    return;
  }
  console.log("usage: list | plan <publicationId> | queue <publicationId|all>");
  console.log("AI spend this month:", JSON.stringify(await spendNow(db)));
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
