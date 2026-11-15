// Proof run of one GravyBlock live-tour video: stores its concept, captures the real site, renders it and prints every QA check. Uploads and sends nothing.
//   systemd-run --scope -p MemoryMax=2200M runuser -u gbstudio -- npx tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-gravyblock-tour-proof.ts gravyblock:marketing-studio
import { promises as fs } from "node:fs";
import path from "node:path";
import { GRAVYBLOCK_EXPLAINERS } from "../../src/lib/marketing-studio/gravyblock-explainers";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { produceDemo } from "../../src/lib/marketing-studio/video/demo/run";
import { conceptFromExplainer } from "../../src/lib/marketing-studio/video/concepts/explainer";
import { conceptKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";
import { setSetting } from "../../src/lib/marketing-studio/runtime";

async function main() {
  const spec = process.argv[2];
  const e = GRAVYBLOCK_EXPLAINERS.find((x) => x.def.specId === spec);
  if (!e) throw new Error("no such explainer " + spec);
  const db = requireStudioDb();
  const c = conceptFromExplainer(e.def);
  const next: StoredConcept = { specId: c.specId, status: "ready", concept: c, alternates: [], nextVariant: 2, attempts: [], generatedAt: new Date().toISOString() };
  await setSetting(conceptKey(c.specId), next, "tour-proof", db, { audited: false });
  const dir = `/tmp/tourproof-${spec.split(":")[1]}`;
  await fs.rm(dir, { recursive: true, force: true });
  const made = await produceDemo({ slug: c.specId, db, workDir: dir, writeFacts: false, log: (m) => console.log("  " + m) });
  await fs.copyFile(made.file, `/tmp/tourproof-${spec.split(":")[1]}.mp4`);
  console.log("QA passed:", made.qa.passed);
  for (const k of made.qa.checks) console.log(k.ok ? "PASS" : k.severity === "warn" ? "warn" : "FAIL", k.id, "-", k.detail.slice(0, 220));
  console.log(JSON.stringify(made.qa.metrics));
  await closeStudioDb();
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
