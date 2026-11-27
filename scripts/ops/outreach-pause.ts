// Unsolicited-outreach pause (cold sales emails, their follow-ups and break-ups, house authority pitches and follow-ups). Transactional, customer, lead-drip,
// review-request, report and GrokBot mail, and all unsubscribe/suppression processing, are unaffected.
//   status:  tsx --env-file=.env scripts/ops/outreach-pause.ts status
//   pause:   tsx --env-file=.env scripts/ops/outreach-pause.ts pause "<reason>"
//   resume:  tsx --env-file=.env scripts/ops/outreach-pause.ts resume "<who approved>" "<evidence that recipient quality and sending practice improved>"
import { sql } from "drizzle-orm";
import { getDb, jobs } from "../../src/lib/db";
import { coldOutreachPauseState } from "../../src/lib/outreach/cold-pause";

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "pause") {
    await db.insert(jobs).values({ type: "cold_outreach_pause", status: "completed", payload: { reason: a ?? "sender reputation" } });
  } else if (cmd === "resume") {
    if (!a || !b) throw new Error('resume needs the approver and the evidence: resume "<who approved>" "<evidence>"');
    await db.insert(jobs).values({ type: "cold_outreach_resume", status: "completed", payload: { approvedBy: a, evidence: b } });
  } else if (cmd !== "status") {
    console.log("commands: status | pause <reason> | resume <approvedBy> <evidence>");
    return;
  }
  console.log(JSON.stringify(await coldOutreachPauseState()));
  const rows = (await db.execute(sql`select type, created_at, payload from jobs where type in ('cold_outreach_pause', 'cold_outreach_resume') order by created_at desc limit 5`)) as unknown as Array<Record<string, unknown>>;
  for (const r of rows) console.log(" ", JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
