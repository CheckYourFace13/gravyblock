// Refreshes ScribbleZap's Product Truth from its live game page: when the page links a real Google Play listing and that listing answers, the verified
// store destination is recorded. That is what lifts the pre-store restriction for the game (the game pause and the launch-state automation read Product
// Truth, never a hand edit). Games stay under their own fun-first rules. Renders and publishes nothing; a stale pre-launch video that was never public is
// flagged by the existing launch-state automation, and one that is already public (the YouTube Short) is left alone.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-refresh-scribblezap.ts
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { addFact, listFacts, listProducts, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeDestination } from "../../src/lib/marketing-studio/video/demo/language-qa";

const PAGE = "https://iscreamstudio.com/games/scribblezap/";
const ACTOR = "portfolio-seed (live page read, owner directive 2026-11-08)";

async function main() {
  const db = requireStudioDb();
  const p = (await listProducts(INTERNAL_SCOPE, db)).find((x) => x.slug === "scribblezap");
  if (!p) throw new Error("ScribbleZap is not a Studio product");
  const html = await (await fetch(PAGE, { signal: AbortSignal.timeout(20_000) })).text();
  const link = [...html.matchAll(/https:\/\/play\.google\.com\/store\/apps\/details\?id=[A-Za-z0-9._]+/g)].map((m) => m[0])[0];
  if (!link) throw new Error("The live game page does not link a Google Play listing. Nothing was recorded.");
  const live = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (live.status !== 200) throw new Error(`The Google Play listing answers ${live.status}, so it is not recorded as live.`);
  const facts = (await listFacts(INTERNAL_SCOPE, p.id, db)).filter((f) => f.status === "current");
  const value = `ScribbleZap is available on Google Play: ${link}`;
  if (!facts.some((f) => f.factValue === value)) {
    const row = await addFact(INTERNAL_SCOPE, ACTOR, p.id, { factKey: "store_listing", factValue: value, sourceKind: "public_page", sourceUrl: PAGE }, db);
    if (!row.verifiedAt) await verifyFact(INTERNAL_SCOPE, ACTOR, p.id, row.id, db);
  }
  const after = (await listFacts(INTERNAL_SCOPE, p.id, db)).filter((f) => f.status === "current").map((f) => ({ value: f.factValue, verified: Boolean(f.verifiedAt) }));
  console.log(`store destination now in Product Truth: ${JSON.stringify(storeDestination(after))}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
