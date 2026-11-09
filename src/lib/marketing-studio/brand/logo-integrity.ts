/**
 * Logo fidelity, permanent hard rule (owner directive 2026-11-08). A customer's logo is immutable source material. The ONLY presentation changes allowed are
 * uniform scaling, positioning and whitespace around the untouched asset. Anything else (recolour, new shape, crop, stretch, effect, redraw, AI regeneration) is a
 * HARD QA failure that stops the video before the owner ever sees it.
 *
 * Four independent checks, none of which can be loosened by a template:
 *   1. source:  the bytes handed to the renderer hash to the canonical asset's sha256, and that asset is an approved logo with known dimensions.
 *   2. rules:   the stage's own CSS and script give the logo no radius, shadow, filter, mask, blend, rotation, skew, border, background or non-uniform scale.
 *   3. aspect:  measured in the live render, the logo's displayed proportions equal the source's.
 *   4. pixels:  the logo as it appears in the render, compared with the source resampled to the same size, differs only by normal resampling.
 */
import { createHash } from "node:crypto";

export type CanonicalLogo = {
  assetId: string;
  sha256: string;
  sourceUrl: string | null;
  sourceFile: string | null;
  provenance: string;
  mimeType: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** what the artwork's own background looks like: part of the logo, never removed or added */
  background: "transparent" | "opaque" | "mixed";
  canonicalizedAt: string;
};

export type LogoCheck = { id: string; ok: boolean; severity: "fail"; detail: string };

export const sha256 = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function canonicalizeLogo(asset: { id: string; sha256: string; sourceUrl: string | null; originalName: string | null; provenance: string; mimeType: string; width: number | null; height: number | null }, bytes: Buffer): Promise<CanonicalLogo> {
  if (sha256(bytes) !== asset.sha256) throw new Error("The stored logo file no longer matches its recorded hash; it will not be used");
  const sharp = (await import("sharp")).default;
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? asset.width ?? 0;
  const height = meta.height ?? asset.height ?? 0;
  if (!width || !height) throw new Error("The logo's dimensions could not be read");
  const hasAlpha = Boolean(meta.hasAlpha);
  let background: CanonicalLogo["background"] = "opaque";
  if (hasAlpha) {
    const { data, info } = await sharp(bytes).ensureAlpha().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    let clear = 0;
    for (let i = 3; i < data.length; i += info.channels) if (data[i] < 8) clear++;
    const share = clear / (data.length / info.channels);
    background = share > 0.97 ? "transparent" : share < 0.005 ? "opaque" : "mixed";
  }
  return { assetId: asset.id, sha256: asset.sha256, sourceUrl: asset.sourceUrl, sourceFile: asset.originalName, provenance: asset.provenance, mimeType: asset.mimeType, width, height, hasAlpha, background, canonicalizedAt: new Date().toISOString() };
}

// ---- 2. the renderer may not decorate the logo -------------------------------------------------------------------------------------------------

const LOGO_SELECTOR = /\.(?:blogo|elogo)\b/;
const FORBIDDEN_PROPS = ["border-radius", "box-shadow", "filter", "backdrop-filter", "clip", "clip-path", "mask", "mask-image", "mix-blend-mode", "outline", "border", "background", "background-color", "background-image", "padding", "text-shadow", "rotate", "skew"];

/** Pure: reasons the stage HTML would alter a logo. Empty means every rule that touches a logo only sizes it. */
export function logoRuleViolations(html: string): string[] {
  const bad: string[] = [];
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((s) => s[1]).join("\n") || html;
  for (const m of css.matchAll(/([^{}<>]*)\{([^{}]*)\}/g)) {
    if (!LOGO_SELECTOR.test(m[1])) continue;
    const sel = m[1].trim().split(/\s+/).pop() ?? "";
    const decls = Object.fromEntries(m[2].split(";").map((d) => d.split(":").map((x) => x.trim())).filter((p) => p.length >= 2).map(([k, ...v]) => [k.toLowerCase(), v.join(":").toLowerCase()]));
    for (const p of FORBIDDEN_PROPS) if (p in decls && decls[p] !== "none" && decls[p] !== "0" && decls[p] !== "transparent") bad.push(`${sel} sets ${p}`);
    if ("opacity" in decls && Number(decls.opacity) < 1) bad.push(`${sel} sets opacity below 1`);
    if ("transform" in decls && !/^scale\(\s*[\d.]+\s*\)$/.test(decls.transform)) bad.push(`${sel} sets a transform that is not a uniform scale`);
    if ("object-fit" in decls && decls["object-fit"] !== "contain") bad.push(`${sel} sets object-fit ${decls["object-fit"]}`);
    const w = decls.width ?? "auto";
    const h = decls.height ?? "auto";
    if (w !== "auto" && h !== "auto" && decls["object-fit"] !== "contain") bad.push(`${sel} fixes both width and height without object-fit: contain (it can stretch)`);
  }
  // script that animates a logo: only a uniform scale
  for (const m of html.matchAll(/\b(?:elogo|blogo)\.style\.(\w+)\s*=\s*([^;\n]*)/g)) {
    if (m[1] !== "transform") bad.push(`script sets logo style ${m[1]}`);
    else if (/rotate|skew|translate|matrix|perspective|scale(?:X|Y|3d)/i.test(m[2]) || /scale\([^)]*,[^)]*\)/.test(m[2])) bad.push("script transforms the logo with more than a uniform scale");
  }
  return bad;
}

// ---- 3 and 4. what the live render actually did ------------------------------------------------------------------------------------------------

export type LogoProbe = { selector: string; naturalW: number; naturalH: number; boxW: number; boxH: number; objectFit: string; radius: string; shadow: string; filter: string; clip: string; opacity: string; transform: string };

/** Pure: compares the logo's displayed proportions with the source's. With object-fit: contain the picture keeps its own ratio whatever the box is. */
export function aspectProblems(canon: Pick<CanonicalLogo, "width" | "height">, probes: LogoProbe[]): string[] {
  const out: string[] = [];
  const want = canon.width / canon.height;
  for (const p of probes) {
    if (!p.naturalW || !p.naturalH) out.push(`${p.selector} did not load the logo image`);
    else if (Math.abs(p.naturalW / p.naturalH - want) / want > 0.005) out.push(`${p.selector} shows a picture of a different shape than the source (${p.naturalW}x${p.naturalH} vs ${canon.width}x${canon.height})`);
    const shown = p.objectFit === "contain" ? p.naturalW / (p.naturalH || 1) : p.boxW / (p.boxH || 1);
    if (Math.abs(shown - want) / want > 0.015) out.push(`${p.selector} is displayed at a different aspect ratio than the source (${shown.toFixed(3)} vs ${want.toFixed(3)})`);
    if (p.radius && p.radius !== "0px") out.push(`${p.selector} is clipped with rounded corners`);
    if (p.shadow && p.shadow !== "none") out.push(`${p.selector} has a shadow`);
    if (p.filter && p.filter !== "none") out.push(`${p.selector} has a filter`);
    if (p.clip && p.clip !== "none" && p.clip !== "auto") out.push(`${p.selector} is clipped`);
  }
  return out;
}

/**
 * Pure-ish: the logo as screenshotted from the render against the source resampled to the displayed size. Only pixels the source draws fully opaque are compared, so the
 * background behind a transparent logo (which is the video's, not the logo's) never counts. Returns the mean absolute channel difference (0..255) and the share of pixels
 * that differ strongly, which catches recolours and substitutions that a mean alone could hide.
 */
export async function comparePixels(source: Buffer, shot: Buffer, box: { w: number; h: number }, natural: { w: number; h: number }): Promise<{ mean: number; strongShare: number; compared: number }> {
  const sharp = (await import("sharp")).default;
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const cw = Math.max(2, Math.round(natural.w * scale));
  const ch = Math.max(2, Math.round(natural.h * scale));
  const src = await sharp(source).ensureAlpha().resize(cw, ch, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const shotMeta = await sharp(shot).metadata();
  const left = Math.max(0, Math.round(((shotMeta.width ?? cw) - cw) / 2));
  const top = Math.max(0, Math.round(((shotMeta.height ?? ch) - ch) / 2));
  const got = await sharp(shot).removeAlpha().extract({ left, top, width: Math.min(cw, (shotMeta.width ?? cw) - left), height: Math.min(ch, (shotMeta.height ?? ch) - top) }).raw().toBuffer({ resolveWithObject: true });
  const w = Math.min(src.info.width, got.info.width);
  const h = Math.min(src.info.height, got.info.height);
  let sum = 0;
  let strong = 0;
  let n = 0;
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const si = (y * src.info.width + x) * src.info.channels;
      if (src.data[si + 3] < 255) continue;
      const gi = (y * got.info.width + x) * got.info.channels;
      const d = (Math.abs(src.data[si] - got.data[gi]) + Math.abs(src.data[si + 1] - got.data[gi + 1]) + Math.abs(src.data[si + 2] - got.data[gi + 2])) / 3;
      sum += d;
      if (d > 48) strong++;
      n++;
    }
  return { mean: n ? sum / n : 0, strongShare: n ? strong / n : 0, compared: n };
}

export type LogoQaInput = {
  canonical: CanonicalLogo | null;
  /** the exact bytes written for the renderer */
  writtenBytes: Buffer | null;
  stageHtml: string;
  probes: LogoProbe[] | null;
  pixels: { mean: number; strongShare: number; compared: number } | null;
};

/** The logo-integrity QA checks. Every one is severity "fail": a logo-integrity failure is a hard QA failure. */
export function logoIntegrityChecks(i: LogoQaInput): LogoCheck[] {
  const out: LogoCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => out.push({ id: `logo_${id}`, ok, severity: "fail", detail });
  if (!i.canonical) {
    add("source", false, "NEEDS BRAND ASSET: no verified source logo is on record, so no logo is shown (the product name may appear as plain text)");
    return out;
  }
  const c = i.canonical;
  add("source", Boolean(i.writtenBytes) && sha256(i.writtenBytes as Buffer) === c.sha256, `the rendered logo is the canonical asset ${c.assetId.slice(0, 8)} (sha256 ${c.sha256.slice(0, 12)}, ${c.width}x${c.height}, ${c.background} background)`);
  const rules = logoRuleViolations(i.stageHtml);
  add("rules", rules.length === 0, rules.length ? rules.join("; ") : "the stage only scales and positions the logo: no radius, shadow, filter, mask, rotation, border or background");
  const asp = i.probes ? aspectProblems(c, i.probes) : ["the logo was not measured in the render"];
  add("aspect", asp.length === 0, asp.length ? asp.join("; ") : "the logo is displayed at the source's proportions, unclipped and without effects");
  const px = i.pixels;
  add("pixels", Boolean(px) && px!.compared > 40 && px!.mean <= 14 && px!.strongShare <= 0.04, px ? `${px.compared} opaque source pixels compared with the render: mean difference ${px.mean.toFixed(1)}/255, ${(px.strongShare * 100).toFixed(1)}% strongly different (limit 14 and 4%)` : "the rendered logo was not compared with the source");
  return out;
}
