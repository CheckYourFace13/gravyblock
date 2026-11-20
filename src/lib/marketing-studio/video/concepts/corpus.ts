/**
 * What the real site says and offers, read live: for each public page the visible text blocks, the links and buttons that can be clicked, and the fields that can be typed into.
 * The AI concept planner may only choose from this list (it cannot invent a line, a control or a screen), so every spoken claim and every interaction in a planned video exists on the real product.
 */
import type { StudioDb } from "../../db";
import { getSetting, setSetting } from "../../runtime";
import { openBrowsed, openPage } from "./browse";

export type CorpusBlock = { id: string; text: string };
export type CorpusControl = { id: string; kind: "link" | "button" | "field"; text: string; /** links: the internal path it opens */ to?: string };
export type CorpusPage = { path: string; title: string; blocks: CorpusBlock[]; controls: CorpusControl[] };
export type Corpus = { origin: string; at: string; pages: CorpusPage[] };

const KEY = (origin: string) => `video_site_corpus_${new URL(origin).hostname}`;
const MAX_AGE_MS = 6 * 3_600_000;

/** Runs in the page: readable text blocks (not site chrome), clickable controls and fields. */
const READ = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 8 && r.height > 8 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const chrome = (e) => e.closest("nav, header, footer, [role=navigation], [role=contentinfo], [role=dialog]");
  const blocks = [];
  const seen = new Set();
  for (const e of document.querySelectorAll("h1,h2,h3,h4,p,li,summary,dt,dd,figcaption,td,span,div")) {
    if (chrome(e) || !vis(e)) continue;
    if (e.matches("span,div") && e.children.length > 0) continue;
    const t = clean(e.innerText);
    if (t.length < 14 || t.length > 260 || seen.has(t)) continue;
    seen.add(t);
    blocks.push(t);
    if (blocks.length >= 70) break;
  }
  const controls = [];
  const seenC = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    if (chrome(a) && !/^(free scan|scan free)/i.test(clean(a.innerText))) continue;
    let u; try { u = new URL(a.href); } catch { continue; }
    if (u.host !== location.host || /login|signin|checkout|privacy|terms|contact|staff|\\.(png|jpe?g|svg|pdf)$/i.test(u.pathname)) continue;
    const t = clean(a.innerText).replace(/[→↗]/g, "").trim();
    if (t.length < 4 || t.length > 70 || seenC.has(t) || !vis(a)) continue;
    seenC.add(t);
    controls.push({ kind: "link", text: t, to: u.pathname });
    if (controls.length >= 14) break;
  }
  for (const b of document.querySelectorAll("button, [role=tab]")) {
    if (chrome(b) || b.disabled || b.type === "submit" || !vis(b)) continue;
    const t = clean(b.innerText);
    if (t.length < 3 || t.length > 70 || seenC.has(t)) continue;
    seenC.add(t);
    controls.push({ kind: "button", text: t });
  }
  for (const i of document.querySelectorAll("input[type=text], input:not([type])")) {
    if (chrome(i) || i.disabled || !vis(i)) continue;
    const l = i.labels && i.labels[0] ? clean(i.labels[0].innerText) : "";
    if (l && l.length < 50 && !/email|password|phone|card|coupon|promo/i.test(l)) controls.push({ kind: "field", text: l });
  }
  return { title: document.title, blocks, controls };
})()`;

export async function readCorpus(origin: string, paths: string[]): Promise<Corpus> {
  const b = await openBrowsed(origin);
  const pages: CorpusPage[] = [];
  try {
    for (let p = 0; p < paths.length; p++) {
      const path = paths[p];
      try {
        await openPage(b.page, new URL(path, origin).toString());
        const r = (await b.page.evaluate(READ)) as { title: string; blocks: string[]; controls: Array<Omit<CorpusControl, "id">> };
        if (/\b404\b|not found/i.test(r.title) || r.blocks.length < 4) continue;
        pages.push({ path, title: r.title, blocks: r.blocks.map((text, i) => ({ id: `p${p}.b${i}`, text })), controls: r.controls.map((c, i) => ({ ...c, id: `p${p}.c${i}` })) });
      } catch {
        /* a page that does not load is simply not offered to the planner */
      }
    }
  } finally {
    await b.close();
  }
  return { origin, at: new Date().toISOString(), pages };
}

/** The corpus, read live at most every six hours. */
export async function siteCorpus(db: StudioDb, origin: string, paths: string[], force = false, maxAgeMs = MAX_AGE_MS): Promise<Corpus> {
  const have = await getSetting<Corpus | null>(KEY(origin), null, db);
  if (!force && have && Date.now() - Date.parse(have.at) < maxAgeMs && paths.every((p) => have.pages.some((x) => x.path === p) || true)) return have;
  const fresh = await readCorpus(origin, paths);
  await setSetting(KEY(origin), fresh, "tour-planner", db, { audited: false });
  return fresh;
}

export const blockById = (c: Corpus, id: string): { page: CorpusPage; block: CorpusBlock } | null => {
  for (const page of c.pages) {
    const block = page.blocks.find((b) => b.id === id);
    if (block) return { page, block };
  }
  return null;
};
export const controlById = (c: Corpus, id: string): { page: CorpusPage; control: CorpusControl } | null => {
  for (const page of c.pages) {
    const control = page.controls.find((x) => x.id === id);
    if (control) return { page, control };
  }
  return null;
};
