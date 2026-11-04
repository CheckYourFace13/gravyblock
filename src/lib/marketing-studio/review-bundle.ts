/**
 * Private owner-review bundle: the representative images, the pilot videos and a plain index.html with captions, CTAs and Product
 * Truth sources. It is built on demand for the signed-in operator only and is never stored or served publicly.
 */
import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { STUDIO_DIRS } from "./config";
import { requireStudioDb, ms, type StudioDb } from "./db";
import { zipStore } from "./publishing/export";
import { loadReview, type FactRef, type ReviewCreative, type ReviewProduct, type ReviewVideo } from "./review";
import type { OwnerScope } from "./scope";
import { safeJoin } from "./storage";

const esc = (s: string | null | undefined) => (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "item";

function factsHtml(facts: FactRef[]): string {
  if (!facts.length) return `<p class="muted">No matching Product Truth fact found.</p>`;
  return `<ul class="facts">${facts
    .map((f) => `<li><b>${esc(f.key.replaceAll("_", " "))}</b>: ${esc(f.value.slice(0, 220))}<br><span class="muted">${esc(f.sourceKind.replaceAll("_", " "))}${f.sourceUrl ? ` · ${esc(f.sourceUrl)}` : ""} · ${f.verified ? "verified" : "NOT verified"}</span></li>`)
    .join("")}</ul>`;
}

function imageCard(c: ReviewCreative, file: string): string {
  return `<article class="card">
<img src="${file}" alt="${esc(c.headline)}">
<div class="meta"><span class="tag">${esc(c.family.replaceAll("_", " "))}</span> <span class="tag">${c.sizeKey} ${c.width}x${c.height} (${esc(c.aspect)})</span> <span class="tag ${c.qa.passed ? "ok" : "bad"}">QA ${c.qa.passed ? "passed" : "failed"} (${c.qa.checks} checks)</span></div>
<h3>${esc(c.headline)}</h3>${c.subhead ? `<p>${esc(c.subhead)}</p>` : ""}
<p><b>Caption:</b> ${esc(c.caption)}</p>
<p><b>CTA:</b> ${esc(c.ctaText ?? "none")}${c.ctaUrl ? ` &rarr; ${esc(c.ctaUrl)}` : ""}</p>
<details><summary>Product Truth used (${c.facts.length})</summary>${factsHtml(c.facts)}</details>
</article>`;
}

function videoCard(v: ReviewVideo, file: string): string {
  return `<article class="card video">
<video src="${file}" controls preload="metadata" playsinline></video>
<div class="meta"><span class="tag">${v.durationSec ?? "?"}s</span> <span class="tag">${v.width ?? "?"}x${v.height ?? "?"}</span> <span class="tag ${v.qa.passed ? "ok" : "bad"}">QA ${v.qa.passed ? "passed" : "failed"} (${v.qa.checks} checks)</span></div>
<h3>${esc(v.title)}</h3>
${v.postCaption ? `<p><b>Post caption:</b> ${esc(v.postCaption)}</p>` : ""}
${v.endCard ? `<p><b>End card:</b> ${esc(v.endCard.headline)}${v.endCard.ctaText ? ` &middot; CTA: ${esc(v.endCard.ctaText)}` : ""}${v.endCard.ctaUrl ? ` &rarr; ${esc(v.endCard.ctaUrl)}` : ""}</p>` : ""}
<p><b>On-screen captions:</b> ${v.captions.length ? v.captions.map(esc).join(" / ") : "none (title and feature cards carry the text)"}</p>
<details><summary>Scenes (${v.scenes.length})</summary><ol>${v.scenes.map((s) => `<li>${s.kind} ${s.seconds}s: ${esc(s.text)}${s.detail ? ` <span class="muted">(${esc(s.detail)})</span>` : ""}</li>`).join("")}</ol></details>
<details><summary>Source assets (${v.sources.length})</summary><ul>${v.sources.map((a) => `<li>${esc(a.name)} <span class="muted">${esc(a.kind)} · ${esc(a.provenance)}${a.sourceUrl ? ` · ${esc(a.sourceUrl)}` : ""}</span></li>`).join("")}</ul></details>
<details><summary>Product Truth used (${v.facts.length})</summary>${factsHtml(v.facts)}</details>
</article>`;
}

export function renderIndexHtml(sections: Array<{ product: ReviewProduct; images: Array<{ c: ReviewCreative; file: string }>; video: { v: ReviewVideo; file: string } | null }>, generatedAt: Date): string {
  const body = sections
    .map(
      (s) => `<section><h2>${esc(s.product.name)} <span class="muted">(${esc(s.product.kind.replaceAll("_", " "))})</span></h2>
<div class="grid">${s.images.map((i) => imageCard(i.c, i.file)).join("")}</div>
${s.video ? `<h3>Pilot video</h3><div class="grid">${videoCard(s.video.v, s.video.file)}</div>` : `<p class="muted">No pilot video available.</p>`}</section>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Marketing Studio owner review</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:24px;background:#fafafa;color:#18181b}h1{margin:0 0 4px}h2{margin-top:36px;border-bottom:1px solid #d4d4d8;padding-bottom:6px}.muted{color:#71717a;font-size:12px}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:12px}.card img,.card video{width:100%;border-radius:8px;border:1px solid #e4e4e7;background:#000}.card.video{max-width:340px}.tag{display:inline-block;background:#f4f4f5;border-radius:99px;padding:1px 8px;font-size:11px;margin:2px 2px 0 0}.ok{background:#d1fae5;color:#065f46}.bad{background:#fee2e2;color:#991b1b}.facts{padding-left:18px;margin:6px 0}h3{margin:8px 0 4px}p{margin:4px 0}</style></head><body>
<h1>Marketing Studio owner review</h1>
<p class="muted">Generated ${esc(generatedAt.toISOString())}. For owner review only. Nothing here has been published, scheduled or sent anywhere.</p>
${body}
</body></html>`;
}

async function readAsset(db: StudioDb, assetId: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const [a] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, assetId)).limit(1);
  if (!a) return null;
  const bytes = await fs.readFile(safeJoin(STUDIO_DIRS.media, ...a.storagePath.split("/")));
  const ext = a.mimeType === "video/mp4" ? "mp4" : a.mimeType === "image/jpeg" ? "jpg" : a.mimeType === "image/webp" ? "webp" : "png";
  return { bytes, ext };
}

export type ReviewBundle = { fileName: string; zip: Buffer; images: number; videos: number; files: string[] };

export async function buildReviewBundle(scope: OwnerScope, db: StudioDb = requireStudioDb(), now = new Date()): Promise<ReviewBundle> {
  const review = await loadReview(scope, db);
  const files: Array<{ name: string; data: Buffer }> = [];
  const sections: Parameters<typeof renderIndexHtml>[0] = [];
  let images = 0;
  let videos = 0;
  for (const p of review) {
    const section: (typeof sections)[number] = { product: p, images: [], video: null };
    let n = 0;
    for (const c of p.representatives) {
      if (!c.assetId) continue;
      const a = await readAsset(db, c.assetId);
      if (!a) continue;
      n++;
      const name = `${slug(p.slug)}-${String(n).padStart(2, "0")}-${slug(c.family)}-${c.sizeKey}.${a.ext}`;
      files.push({ name, data: a.bytes });
      section.images.push({ c, file: name });
      images++;
    }
    if (p.video?.assetId) {
      const a = await readAsset(db, p.video.assetId);
      if (a) {
        const name = `${slug(p.slug)}-pilot-video.${a.ext}`;
        files.push({ name, data: a.bytes });
        section.video = { v: p.video, file: name };
        videos++;
      }
    }
    sections.push(section);
  }
  files.unshift({ name: "index.html", data: Buffer.from(renderIndexHtml(sections, now), "utf8") });
  const day = now.toISOString().slice(0, 10);
  return { fileName: `marketing-studio-review-${day}.zip`, zip: zipStore(files), images, videos, files: files.map((f) => f.name) };
}
