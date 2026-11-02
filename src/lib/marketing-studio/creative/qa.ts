/**
 * Automated creative QA. A creative may enter READY_FOR_REVIEW only if every "fail" check passes. Checks are deliberately
 * mechanical: dimensions, decode integrity, blank image, text overflow, minimum size, safe area, contrast, logo distortion,
 * missing assets, text traceable to Product Truth, prohibited claims, placeholder text, obvious duplicates, CTA URL validity.
 */
import sharp from "sharp";
import type { Measure } from "./render";
import { contrastPairs, type Theme } from "./theme";
import { NEUTRAL_PATTERNS, STRUCTURAL_LABELS, type BuiltCreative } from "./templates";

export type QaCheck = { id: string; ok: boolean; severity: "fail" | "warn"; detail: string };
export type QaFact = { id: string; key: string; value: string; verified: boolean };

export type QaInput = {
  png: Buffer;
  width: number;
  height: number;
  measure: Measure;
  built: BuiltCreative;
  theme: Theme;
  productName: string;
  facts: QaFact[];
  prohibited: string[];
  ctaFactValues: string[];
  ctaUrl: string | null;
  allowedUrlHosts: string[];
  /** HTTP status of a live check, null when it could not be checked. */
  urlStatus: number | null;
  requiredAssets: Array<{ id: string; approved: boolean; present: boolean }>;
  conceptId: string;
  otherHashes: Array<{ conceptId: string; dhash: string }>;
};

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const PLACEHOLDER = /lorem|ipsum|\btodo\b|\btbd\b|\bxxx+\b|\[[^\]]*\]|\{\{|\}\}|undefined|\bnull\b|your (text|logo|brand|name) here|placeholder|sample (text|product)/i;

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export async function dhash(png: Buffer): Promise<string> {
  const raw = await sharp(png).resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += raw[y * 9 + x] > raw[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** Is this rendered text traceable to Product Truth (or a fixed structural or neutral string)? */
export function traceText(block: BuiltCreative["textBlocks"][number], i: Pick<QaInput, "facts" | "productName" | "ctaFactValues" | "ctaUrl">): { ok: boolean; why: string } {
  const text = norm(block.text);
  const s = block.src;
  switch (s.kind) {
    case "fact": {
      const fact = i.facts.find((f) => f.id === s.factId);
      if (!fact) return { ok: false, why: "cites a fact that does not exist" };
      if (!fact.verified) return { ok: false, why: "cites a fact that is not verified" };
      return norm(fact.value).includes(text) ? { ok: true, why: "" } : { ok: false, why: `is not contained in fact "${fact.key}"` };
    }
    case "product":
      return text === norm(i.productName) ? { ok: true, why: "" } : { ok: false, why: "is not the product name" };
    case "label":
      return (STRUCTURAL_LABELS as readonly string[]).some((l) => norm(l) === text) ? { ok: true, why: "" } : { ok: false, why: "is not an allowed structural label" };
    case "cta":
      return i.ctaFactValues.some((v) => norm(v) === text) || text === "learn more" ? { ok: true, why: "" } : { ok: false, why: "is not an approved call to action" };
    case "url":
      return i.ctaUrl && norm(hostPath(i.ctaUrl)) === text ? { ok: true, why: "" } : { ok: false, why: "is not the approved URL" };
    case "neutral":
      return NEUTRAL_PATTERNS.some((p) => norm(p.replace("{product}", i.productName)) === text) ? { ok: true, why: "" } : { ok: false, why: "is not an approved neutral phrase" };
  }
}

export async function runCreativeQa(i: QaInput): Promise<{ passed: boolean; checks: QaCheck[]; dhash: string }> {
  const checks: QaCheck[] = [];
  const add = (id: string, ok: boolean, detail: string, severity: "fail" | "warn" = "fail") => checks.push({ id, ok, severity, detail: ok ? detail : detail });

  // 1. dimensions and file integrity
  let hash = "";
  try {
    const meta = await sharp(i.png).metadata();
    add("dimensions", meta.width === i.width && meta.height === i.height && meta.format === "png", `${meta.width}x${meta.height} ${meta.format}, expected ${i.width}x${i.height} png`);
    const stats = await sharp(i.png).stats();
    const flat = stats.channels.slice(0, 3).every((c) => c.stdev < 2);
    add("not_blank", !flat, flat ? "image is a single flat color" : "image has content");
    hash = await dhash(i.png);
    add("file_integrity", true, `decoded fully (${i.png.length} bytes)`);
  } catch (e) {
    add("file_integrity", false, `image failed to decode: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. text: fit, minimum size, safe area
  const over = i.measure.texts.filter((t) => t.overflow);
  add("text_fits", over.length === 0, over.length ? `text overflows its box: ${over.map((t) => `${t.role} "${t.text.slice(0, 30)}"`).join("; ")}` : "all text fits its box");
  const small = i.measure.texts.filter((t) => t.fs < Math.max(24, t.min));
  add("text_readable_size", small.length === 0, small.length ? `text below minimum size: ${small.map((t) => `${t.role} ${t.fs}px`).join("; ")}` : "all text meets its minimum size");
  const { l, r, t: top, b } = i.built.safe;
  const outside = i.measure.texts.filter((x) => x.rect.x < l - 2 || x.rect.x + x.rect.w > r + 2 || x.rect.y < top - 2 || x.rect.y + x.rect.h > b + 2);
  add("safe_area", outside.length === 0, outside.length ? `text outside the safe area: ${outside.map((x) => x.role).join(", ")}` : "all text inside the safe area");
  const rendered = new Map(i.measure.texts.map((x) => [x.idx, norm(x.text)]));
  const mismatched = i.built.textBlocks.filter((blk, idx) => rendered.get(idx) !== norm(blk.text));
  add("text_rendered_as_planned", mismatched.length === 0, mismatched.length ? `rendered text differs from the plan: ${mismatched.map((m) => m.role).join(", ")}` : "rendered text equals planned text");

  // 3. contrast, from the theme itself
  const lowContrast = contrastPairs(i.theme).filter((p) => {
    // Pairings the template does not use are not checked.
    const used = i.built.textBlocks.length > 0;
    return used && contrastRatio(p.fg, p.bg) < p.min;
  });
  add("contrast", lowContrast.length === 0, lowContrast.length ? `low contrast: ${lowContrast.map((p) => p.role).join("; ")}` : "all text colors meet 4.5:1");

  // 4. logo and assets
  const logos = i.measure.images.filter((x) => x.role === "logo");
  const distorted = logos.filter((x) => x.rect.h > 0 && x.natural.h > 0 && Math.abs(x.rect.w / x.rect.h - x.natural.w / x.natural.h) / (x.natural.w / x.natural.h) > 0.02);
  add("logo_not_distorted", distorted.length === 0, distorted.length ? "logo aspect ratio was changed" : logos.length ? "logo keeps its aspect ratio" : "no logo used");
  const upscaled = logos.filter((x) => x.natural.w > 0 && x.rect.w / x.natural.w > 2.5);
  add("logo_resolution", upscaled.length === 0, upscaled.length ? "logo is enlarged more than 2.5x and may look blurry" : "logo resolution is adequate", "warn");
  const broken = i.measure.images.filter((x) => !x.ok);
  add("images_loaded", broken.length === 0, broken.length ? "an image failed to load" : "all images loaded");
  const missing = i.requiredAssets.filter((a) => !a.present || !a.approved);
  add("assets_present_and_approved", missing.length === 0, missing.length ? `missing or unapproved assets: ${missing.map((a) => a.id).join(", ")}` : "all required assets are present and approved");

  // 5. every visible string traces to Product Truth
  const untraced = i.built.textBlocks.map((blk) => ({ blk, res: traceText(blk, i) })).filter((x) => !x.res.ok);
  add("claims_grounded_in_product_truth", untraced.length === 0, untraced.length ? `unsupported text: ${untraced.map((u) => `"${u.blk.text.slice(0, 40)}" ${u.res.why}`).join("; ")}` : "every text traces to a verified Product Truth fact");
  const allText = i.built.textBlocks.map((x) => norm(x.text)).join(" | ");
  const hit = i.prohibited.map(norm).filter((p) => p.length >= 4 && allText.includes(p));
  add("no_prohibited_claims", hit.length === 0, hit.length ? `contains prohibited claim: ${hit.join("; ")}` : "no prohibited claims");
  const ph = i.built.textBlocks.filter((x) => PLACEHOLDER.test(x.text));
  add("no_placeholder_text", ph.length === 0, ph.length ? `placeholder text: ${ph.map((x) => `"${x.text.slice(0, 30)}"`).join(", ")}` : "no placeholder text");

  // 6. duplicates
  if (hash) {
    const dup = i.otherHashes.filter((o) => o.conceptId !== i.conceptId && hamming(o.dhash, hash) <= 3);
    add("not_a_duplicate", dup.length === 0, dup.length ? "visually near-identical to another creative of this product" : "visually distinct from other creatives");
  }

  // 7. CTA URL
  if (i.ctaUrl) {
    let host = "";
    let https = false;
    try {
      const u = new URL(i.ctaUrl);
      host = u.host;
      https = u.protocol === "https:";
    } catch {
      /* invalid */
    }
    add("cta_url_valid", https && i.allowedUrlHosts.includes(host), https ? (i.allowedUrlHosts.includes(host) ? `https URL on approved host ${host}` : `host ${host} is not an approved Product Truth URL`) : "CTA URL is not a valid https URL");
    if (i.urlStatus === null) add("cta_url_live", false, "the CTA URL could not be checked right now", "warn");
    else add("cta_url_live", i.urlStatus < 400, `CTA URL answered ${i.urlStatus}`);
  }

  const passed = checks.every((c) => c.ok || c.severity === "warn");
  return { passed, checks, dhash: hash };
}

function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
