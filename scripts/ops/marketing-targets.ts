// Video targets and the production audit.
//   tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-targets.ts audit          every product: target, counts, blocker, waiting emails, game capture
//   tsx ... marketing-targets.ts set <slug|games|all> <n>                                          set a target (the owner does this on the product page; this is the same call)
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { productStatus } from "../../src/lib/marketing-studio/portfolio-loop";
import { getPolicy } from "../../src/lib/marketing-studio/publishing/video-policy";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { captureReady } from "../../src/lib/marketing-studio/video/game/production";
import { getMaxPending, getTarget, isGame, setTarget, targetStats, type TargetProduct } from "../../src/lib/marketing-studio/video-target";

async function main() {
  const [cmd, arg, n] = process.argv.slice(2);
  const db = requireStudioDb();
  const products = (await listProducts(INTERNAL_SCOPE, db)) as unknown as Array<TargetProduct & { name: string }>;
  if (cmd === "set" && arg && n) {
    const picked = products.filter((p) => (arg === "games" ? isGame(p) : arg === "all" ? p.ownerKind !== "customer" : p.slug === arg));
    if (!picked.length) throw new Error(`no product matches "${arg}"`);
    for (const p of picked) console.log(`${p.slug}: target ${await setTarget(db, "marketing-targets-cli", p.id, n)}`);
    return;
  }
  if (cmd !== "audit") {
    console.log("usage: audit | set <slug|games|all> <n>");
    return;
  }
  const reviews = await listReviews(db);
  const totals = { waitingForOpportunity: 0, blocked: 0, emailsWaiting: 0 };
  for (const p of products) {
    const t = await getTarget(db, p);
    const stats = await targetStats(db, p);
    const st = await productStatus(db, p as never).catch((e) => ({ status: "ERROR", detail: String(e) }));
    const pol = await getPolicy(db, p.id);
    const angles = await getAngles(db, p.slug);
    const jobs = await db.select({ n: sql<number>`count(*)::int` }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, p.id), inArray(ms.msMediaJobs.kind, ["library_video", "game_video"]), inArray(ms.msMediaJobs.status, ["queued", "running"])));
    const waitingMail = reviews.filter((r) => r.productId === p.id && r.status === "unlisted_live" && !r.emailedAt).length;
    if (st.status === "WAITING_FOR_NEW_OPPORTUNITY") totals.waitingForOpportunity++;
    if (st.status === "NEEDS_OWNER_ACTION") totals.blocked++;
    totals.emailsWaiting += waitingMail;
    console.log(JSON.stringify({ slug: p.slug, kind: p.kind, game: isGame(p), target: t.target, explicit: t.explicit, maxPendingReviews: (await getMaxPending(db, p)).max, approved: stats.approved, reviewPending: stats.waiting, renderingOrQueued: jobs[0]?.n ?? 0, remaining: stats.remaining, paused: Boolean(pol.paused), status: st.status, blocker: st.detail, blockedAngles: angles.filter((a) => a.status === "blocked").length, emailsWaiting: waitingMail, ...(isGame(p) ? { realGameCapture: captureReady(p.slug) } : {}) }));
  }
  console.log("TOTALS", JSON.stringify(totals));
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
