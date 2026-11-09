// Read-only audit of every generated video for logo alterations (owner directive 2026-11-08). Nothing is changed, replaced, uploaded or emailed.
// A video rendered before the logo-integrity gate carries no `logo_*` QA checks and was drawn by the old stage, which clipped the logo to rounded corners (15px on a
// 60px mark, 70px on the 300px end-card mark), forced it into a square box (stretching any non-square logo), put a drop shadow on the end-card logo and spun it -12 degrees
// as it entered. This script measures what that did to each product's actual logo file.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-logo-audit.ts [--save]
import { eq } from "drizzle-orm";
import { readAssetBytes } from "../../src/lib/marketing-studio/creative/context";
import { ms, closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { setSetting } from "../../src/lib/marketing-studio/runtime";

type Row = { video: string; title: string; product: string; where: string; renderedBy: string; logo: string; source: string; altered: string; alterations: string[]; severity: string };

/** Share of the artwork's opaque pixels that fall in the four corners a rounded clip of this radius ratio removes. */
async function clippedShare(bytes: Buffer, ratio: number): Promise<number> {
  const sharp = (await import("sharp")).default;
  const N = 128;
  const { data, info } = await sharp(bytes).ensureAlpha().resize(N, N, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const r = ratio * N;
  let opaque = 0;
  let cut = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = data[(y * N + x) * info.channels + 3];
      if (a < 200) continue;
      opaque++;
      const cx = x < r ? r : x >= N - r ? N - r : x;
      const cy = y < r ? r : y >= N - r ? N - r : y;
      if ((x < r || x >= N - r) && (y < r || y >= N - r) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) cut++;
    }
  return opaque ? cut / opaque : 0;
}

async function main() {
  const db = requireStudioDb();
  const products = await db.select().from(ms.msProducts);
  const videos = (await db.select().from(ms.msVideos)).filter((v) => !["failed", "queued", "rendering"].includes(v.status));
  const reviews = await listReviews(db);
  const rows: Row[] = [];
  for (const v of videos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const p = products.find((x) => x.id === v.productId);
    const assets = (await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, v.productId))).filter((a) => a.kind === "logo" && a.approved === "true");
    const qa = (v.qa as { checks?: Array<{ id: string }> } | null)?.checks ?? [];
    const gated = qa.some((c) => c.id.startsWith("logo_"));
    const sb = v.storyboard as { kind?: string } | null;
    const rev = reviews.find((r) => r.videoRowId === v.id);
    const where = rev ? `${rev.status} (${rev.watchUrl})` : v.status === "approved" ? "approved, not uploaded" : v.status;
    const renderedBy = gated ? "new renderer with the logo-integrity gate" : sb?.kind === "demo" ? "old demo stage" : "older template renderer";
    const logo = assets[0];
    if (!logo) {
      rows.push({ video: v.id.slice(0, 8), title: v.title, product: p?.name ?? "?", where, renderedBy, logo: "none on file", source: "-", altered: "n/a", alterations: ["no approved logo asset: the product name or an uploaded asset is used"], severity: "info" });
      continue;
    }
    const alterations: string[] = [];
    let severity = "none";
    if (!gated) {
      const ratio = (logo.width ?? 0) / (logo.height ?? 1);
      const sharp = (await import("sharp")).default;
      const bytes = await readAssetBytes(logo);
      const meta = await sharp(bytes).metadata();
      const w = meta.width ?? logo.width ?? 1;
      const h = meta.height ?? logo.height ?? 1;
      const aspect = w / h;
      if (sb?.kind === "demo") {
        const clip60 = await clippedShare(bytes, 0.25);
        const clip300 = await clippedShare(bytes, 0.2333);
        alterations.push(`forced into a square box (source ${w}x${h}, aspect ${aspect.toFixed(2)}${Math.abs(aspect - 1) > 0.02 ? `: stretched by ${(Math.abs(aspect - 1) * 100).toFixed(0)}%` : ", no visible stretch"})`);
        alterations.push(`rounded-corner clip on the corner and end-card logo (removes ${(clip60 * 100).toFixed(1)}% of the artwork's pixels)`);
        alterations.push("drop shadow on the end-card logo", "-12 degree rotation while it entered the end card");
        const stretch = Math.abs(aspect - 1);
        severity = stretch > 0.05 || clip60 > 0.02 ? "HIGH" : stretch > 0.02 || clip60 > 0.005 ? "MEDIUM" : "LOW";
        void clip300;
      } else {
        alterations.push("logo-only videos used the template hero mark with a rounded clip and glow shadow (when it was drawn as a hero)");
        severity = "LOW";
      }
      void ratio;
    }
    rows.push({ video: v.id.slice(0, 8), title: v.title, product: p?.name ?? "?", where, renderedBy, logo: `${logo.id.slice(0, 8)} sha ${logo.sha256.slice(0, 12)} ${logo.width}x${logo.height} ${logo.mimeType}`, source: logo.sourceUrl ?? logo.originalName ?? logo.storagePath, altered: gated ? "NO (rendered under the integrity gate)" : alterations.length ? "YES" : "NO", alterations, severity });
  }
  for (const r of rows) console.log(`${r.severity.padEnd(6)} ${r.product.padEnd(16)} ${r.video} ${r.where.slice(0, 60).padEnd(60)} logo ${r.logo} :: ${r.altered}${r.alterations.length ? " :: " + r.alterations.join("; ") : ""}`);
  console.log(`${rows.length} videos audited: ${rows.filter((r) => r.severity === "HIGH").length} HIGH, ${rows.filter((r) => r.severity === "MEDIUM").length} MEDIUM, ${rows.filter((r) => r.severity === "LOW").length} LOW`);
  if (process.argv.includes("--save")) await setSetting("logo_audit_2026_11_08", { at: new Date().toISOString(), rows }, "logo-audit", db);
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
