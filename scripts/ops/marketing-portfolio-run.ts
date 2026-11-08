// Portfolio driver (owner directive 2026-11-08): for every planned library angle without a script it runs the language-model creative step
// (marketing-concept-ai.ts, capped at $5/month, grounded and gated), keeps only concepts that show a REAL interaction, registers the script on the angle and
// stops there. Rendering, unlisted upload and the review email are the existing worker job (marketing-library-queue.ts). Never publishes, never writes to a site.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-portfolio-run.ts [--only slug,slug] [--dry]
import { spawnSync } from "node:child_process";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { getAngles, updateAngle } from "../../src/lib/marketing-studio/library-store";
import { getSetting } from "../../src/lib/marketing-studio/runtime";
import { conceptKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";

const ACTOR = "portfolio-driver (owner directive 2026-11-08)";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const DRY = process.argv.includes("--dry");
/** Products kept out of this run: the owner has not approved their videos (the iScream site's "see it in action" is prepared but not deployed). */
const SKIP = new Set(["iscreamstudio"]);

/** The angle entry the worker needs: the script's id and hook, the scenes shown, and the YouTube title and description (the concept's own hook, payoff lines and tracked call to action). */
async function register(db: ReturnType<typeof requireStudioDb>, slug: string, position: number, specId: string) {
  const stored = await getSetting<StoredConcept | null>(conceptKey(specId), null, db);
  const c = stored?.concept;
  if (!c) return;
  const title = c.title.length <= 100 ? c.title : `${c.title.slice(0, 97)}...`;
  const body = c.payoff.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
  const yt = { title, description: `${/[?!.]$/.test(c.hook) ? c.hook : `${c.hook}?`} ${body}

${c.cta.text}: ${c.cta.url}` };
  await updateAngle(db, ACTOR, slug, (x) => x.position === position, { specId, hook: c.hook, yt, scenes: c.capturePlan.map((pl) => pl.heading || pl.path) });
}

async function main() {
  const db = requireStudioDb();
  for (const p of PLAN_PRODUCTS) {
    if (SKIP.has(p.slug) || (only && !only.includes(p.slug))) continue;
    for (const a of (await getAngles(db, p.slug)).filter((x) => x.status === "planned").sort((x, y) => x.position - y.position)) {
      const specId = `${p.slug}:${a.id.slice(p.slug.length + 1)}`;
      const stored = await getSetting<StoredConcept | null>(conceptKey(specId), null, db);
      if (stored?.status === "blocked") {
        console.log(`${p.slug} ${a.position}: skipped, its earlier concept was blocked for weak visuals`);
        continue;
      }
      if (stored?.status === "ready") {
        if (!DRY) await register(db, p.slug, a.position, specId);
        console.log(`${p.slug} ${a.position}: concept ready (${specId})`);
        continue;
      }
      if (DRY) {
        console.log(`${p.slug} ${a.position}: would generate`);
        continue;
      }
      const r = spawnSync("npx", ["tsx", "--env-file=/etc/gravyblock-marketing.env", "scripts/ops/marketing-concept-ai.ts", p.slug, String(a.position), "--save", "--require-interaction", "--pool", "6"], { encoding: "utf8", timeout: 20 * 60_000 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const saved = out.match(/^saved (\S+)/m);
      const cost = out.match(/AI cost this run: .*/);
      if (saved) {
        await register(db, p.slug, a.position, saved[1]);
        console.log(`${p.slug} ${a.position}: SAVED ${saved[1]}. ${cost?.[0] ?? ""}`);
      } else {
        console.log(`${p.slug} ${a.position}: no concept. ${(out.match(/NO CONCEPT: .*/)?.[0] ?? out.split("\n").filter(Boolean).slice(-2).join(" ")).slice(0, 300)} ${cost?.[0] ?? ""}`);
      }
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
