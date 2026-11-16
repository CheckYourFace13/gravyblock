// Plans GravyBlock's videos with the permanent AI concept planner (reads the live site, plans each brief, replans on any gate failure) and prints the result. Renders and sends nothing.
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { siteCorpus } from "../../src/lib/marketing-studio/video/concepts/corpus";
import { GRAVYBLOCK_PLAN_PATHS } from "../../src/lib/marketing-studio/gravyblock-briefs";
import { registerGravyblockExplainers } from "../../src/lib/marketing-studio/gravyblock-register";
import { spendNow } from "../../src/lib/marketing-studio/video/concepts/ai-budget";
async function main() {
  const db = requireStudioDb();
  const c = await siteCorpus(db, "https://gravyblock.com", GRAVYBLOCK_PLAN_PATHS, true);
  console.log("corpus pages:", c.pages.map((p) => `${p.path}(${p.blocks.length}b/${p.controls.length}c)`).join(" "));
  const r = await registerGravyblockExplainers(db, (m) => console.log("  " + m));
  console.log(JSON.stringify(r, null, 1).slice(0, 3000));
  console.log("AI spend:", JSON.stringify(await spendNow(db)));
  await closeStudioDb();
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
