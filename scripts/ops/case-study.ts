// Growth stories for the two pilot house sites.
//   draft:   tsx --env-file=.env scripts/ops/case-study.ts draft [boating-chicago|the-drink-place]    (read only; prints the story and the exact draft claims)
//   sync:    tsx --env-file=.env scripts/ops/case-study.ts sync                                         (pulls Search Console history for the pilots now; the daily engine does this too)
//   approve: tsx --env-file=.env scripts/ops/case-study.ts approve <slug> "<public name>" "<disclosure>" [approver]
//            (records the CURRENT draft claims as owner-approved; only these claim wordings can ever appear on /real-growth-stories)
//   revoke:  tsx --env-file=.env scripts/ops/case-study.ts revoke <slug>
import { and, eq } from "drizzle-orm";
import { caseStudyApprovals, getDb } from "../../src/lib/db";
import { buildGrowthStory, PILOT_SLUGS } from "../../src/lib/case-studies/build";
import { renderClaim } from "../../src/lib/case-studies/model";
import { syncSearchHistory, recheckDroppedPages } from "../../src/lib/seo/search-history";

async function main() {
  const [cmd, slugArg, publicName, disclosure, approver] = process.argv.slice(2);
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const slugs = slugArg && PILOT_SLUGS[slugArg] ? [slugArg] : Object.keys(PILOT_SLUGS);
  if (cmd === "sync") {
    for (const s of slugs) {
      const story = await buildGrowthStory(s);
      if (!story) continue;
      console.log(s, "history", JSON.stringify(await syncSearchHistory(story.businessId)));
      if (s === "the-drink-place") console.log(s, "index recheck", JSON.stringify(await recheckDroppedPages(story.businessId)));
    }
    return;
  }
  if (cmd === "draft") {
    for (const s of slugs) {
      const st = await buildGrowthStory(s);
      if (!st) continue;
      console.log(`\n=== ${st.name} (${s}) ===`);
      console.log(`start: ${st.start.day ?? "none"} (${st.start.basis}); search history days stored: ${st.historyDays}`);
      console.log(`baseline: ${JSON.stringify(st.baseline)}`);
      console.log(`latest:   ${JSON.stringify(st.latest)}`);
      for (const a of st.after) console.log(`after ${a.label}d: ${a.elapsed ? JSON.stringify(a.stat) : "not elapsed yet"}`);
      console.log(`discovered: ${JSON.stringify(st.discovered)}`);
      console.log(`recommended (open briefs): ${JSON.stringify(st.recommended)}`);
      console.log(`executed: ${JSON.stringify({ ...st.executed, videoUrls: st.executed.videoUrls.length })}`);
      console.log(`verified links: ${st.verified.links.length}; index rechecks: ${JSON.stringify(st.verified.indexRechecks.slice(-3))}`);
      console.log(`referral: ${st.referral.note}`);
      console.log(`attribution: ${st.attribution.attributable ? "ATTRIBUTABLE" : "not established: " + st.attribution.reasons.join("; ")}`);
      console.log("DRAFT CLAIMS (for owner review):");
      for (const c of st.claims) console.log(`  [${c.stage}] ${c.key}: ${renderClaim(c)}`);
    }
    return;
  }
  if (cmd === "approve" || cmd === "revoke") {
    if (!slugArg || !PILOT_SLUGS[slugArg]) throw new Error("unknown slug");
    const st = await buildGrowthStory(slugArg);
    if (!st) throw new Error("story unavailable");
    if (cmd === "revoke") {
      await db.update(caseStudyApprovals).set({ status: "revoked" }).where(and(eq(caseStudyApprovals.businessId, st.businessId), eq(caseStudyApprovals.status, "approved")));
      console.log("revoked", slugArg);
      return;
    }
    if (!publicName || !disclosure) throw new Error('usage: approve <slug> "<public name>" "<disclosure>" [approver]');
    await db.update(caseStudyApprovals).set({ status: "superseded" }).where(and(eq(caseStudyApprovals.businessId, st.businessId), eq(caseStudyApprovals.status, "approved")));
    await db.insert(caseStudyApprovals).values({ businessId: st.businessId, publicName, disclosure, claims: st.claims, approvedBy: approver ?? "owner" });
    console.log("approved", slugArg, st.claims.length, "claims");
    return;
  }
  console.log("commands: draft | sync | approve | revoke");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
