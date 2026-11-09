// GravyBlock's own video-topic library (owner directive 2026-11-08). Runs the duplicate gate over the whole inventory against the angles GravyBlock already has,
// then (with --seed) adds the topics that pass as PLANNED angles from position 4. Seeding makes nothing: the portfolio loop makes one video at a time, each through
// every gate, and a topic that cannot be shown truthfully with real interaction simply waits. Also writes the placement recommendations for gravyblock.com
// (a setting for developers to read; Studio never edits the site).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-gravyblock-topics.ts [--seed]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { gravyblockInventory, seedGravyblockTopics } from "../../src/lib/marketing-studio/gravyblock-seed";

async function main() {
  const db = requireStudioDb();
  const inv = await gravyblockInventory(db);
  console.log(`inventory: ${inv.topics} topics, ${inv.distinct} pass the duplicate gate, ${inv.conflicts.length} blocked, ${inv.alreadySeeded} already seeded`);
  for (const c of inv.conflicts) console.log(`BLOCKED ${c.id}: ${c.with} (${c.reasons.join(", ")})`);
  if (process.argv.includes("--seed")) console.log(JSON.stringify(await seedGravyblockTopics(db, "gravyblock-topics (owner directive 2026-11-08)")));
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
