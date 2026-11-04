// Shows (default) or applies the launch-state reconciliation for game creative. The Studio worker runs the same reconcile on every loop, so this
// is only for looking. "apply" flags stale pre-launch videos, cancels their unsent posts and queues a replacement record; it renders nothing,
// publishes nothing and never touches a post that is already public. Rendering the replacement is the usual governed marketing-demo-run.ts.
//   tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-launch-state.ts [apply]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeDestination } from "../../src/lib/marketing-studio/video/demo/language-qa";
import { reconcileGameLaunchState } from "../../src/lib/marketing-studio/video/demo/launch-state";
import { DEMO_SPECS } from "../../src/lib/marketing-studio/video/demo/specs";

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  for (const spec of Object.values(DEMO_SPECS).filter((s) => s.kind === "game")) {
    const p = products.find((x) => x.slug === spec.slug);
    if (!p) continue;
    const facts = (await listFacts(INTERNAL_SCOPE, p.id, db)).filter((f) => f.status === "current").map((f) => ({ value: f.factValue, verified: Boolean(f.verifiedAt) }));
    const d = storeDestination(facts);
    console.log(`${spec.slug}: ${d ? `LIVE (${d.store}) ${d.url}` : "pre-launch (invitation CTA)"}`);
  }
  if (process.argv[2] === "apply") console.log(JSON.stringify(await reconcileGameLaunchState(db), null, 2));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
