/**
 * Replays a concept's real interaction path on the live product and records three states per plate (before, after the first step, after the second),
 * with the rectangles the camera, cursor and focus use. Steps are real and read-only: click an in-page control, open an internal link, search (GET) and
 * open the first result, or scroll to where the destination itself says something. Nothing is submitted, signed into or changed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { round, union, VIEW } from "../demo/plates";
import type { Manifest, PlateManifest, Rect } from "../demo/types";
import { openBrowsed, openPage, pageBlocks, tagControls, tagFields, tagLinks, textIn, visibleText, type Block } from "./browse";
import type { Concept, PlatePlan, Step } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const PLATE_H = 1000;

async function rectOf(page: Page, sel: string): Promise<Rect> {
  const r = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height];
  }, sel);
  if (!r) throw new Error(`capture: ${sel} not found on ${page.url()}`);
  return [round(r[0]), round(r[1]), round(r[2]), round(r[3])];
}

/** The box around the blocks of text a window shows, in the window's own coordinates. */
function boxOfBlocks(blocks: Block[], y0: number, h: number, n = 4): Rect {
  const inWin = blocks.filter((b) => b.y >= y0 - 4 && b.y + Math.min(b.h, 40) <= y0 + h && b.w > 30).slice(0, n);
  if (!inWin.length) return [20, 60, 350, 200];
  const r = union(...inWin.map((b): Rect => [b.x, b.y - y0, b.w, b.h]));
  return [Math.max(0, r[0]), Math.max(0, r[1]), Math.min(VIEW.w - 20, r[2]), Math.min(r[3], 420)];
}

const MAP_SELECTOR = ".leaflet-container, .mapboxgl-map, .maplibregl-map, .gm-style";

/** The map on the page, if there is one, and whether it has drawn any tiles. Waits for tiles in flight to land. */
async function settleMap(page: Page): Promise<{ rect: Rect | null; drawn: boolean }> {
  await page
    .waitForFunction(() => {
      const t = Array.from(document.querySelectorAll(".leaflet-tile"));
      return !t.length || (t.every((i) => (i as HTMLImageElement).complete) && !document.querySelector(".leaflet-tile-loading"));
    }, null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(350);
  const r = await page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    const tiles = document.querySelectorAll(".leaflet-tile-loaded, .mapboxgl-canvas, .maplibregl-canvas, .gm-style img").length;
    return { rect: [b.x, b.y + window.scrollY, b.width, b.height], tiles };
  }, MAP_SELECTOR);
  if (!r) return { rect: null, drawn: true };
  return { rect: [round(r.rect[0]), round(r.rect[1]), round(r.rect[2]), round(r.rect[3])], drawn: r.tiles > 0 };
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important}" });
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  // a cookie banner never belongs in a video: take the privacy-preserving choice (this browser only, nothing is sent anywhere else)
  await page.getByRole("button", { name: /^(reject|decline|deny)( all| optional| non-essential)?( cookies)?$/i }).first().click({ timeout: 4000 }).catch(() => {});
  // anything fixed to the screen that is still a cookie or consent prompt (a banner that re-renders, or one with no reject button) is hidden for the picture only
  await page.evaluate(() => {
    for (const e of Array.from(document.querySelectorAll("body *"))) {
      const cs = getComputedStyle(e);
      if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent/i.test((e as HTMLElement).innerText || "") && (e as HTMLElement).innerText.length < 900) (e as HTMLElement).style.display = "none";
    }
  });
  await page.waitForTimeout(300);
}

/** What is really inside each screenshot, read from the page at the moment it was taken (keyed by file), so the finished video can be checked against it. */
const lastVisible: Record<string, string> = {};

async function shotAt(page: Page, outDir: string, file: string, y0: number, h: number) {
  await writeFile(path.join(outDir, file), await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: Math.max(0, y0), width: VIEW.w, height: h } }));
  lastVisible[file] = await visibleText(page, Math.max(0, y0), h).catch(() => "");
  return file;
}

/** The box of the smallest element whose text contains the given line (the result a calculator shows). */
let lastFontPx = 0;
async function rectOfText(page: Page, needle: string): Promise<Rect | null> {
  const r = await page.evaluate((n) => {
    const want = n.toLowerCase().replace(/\s+/g, " ").trim();
    let best: Element | null = null;
    let bestLen = Infinity;
    for (const e of Array.from(document.querySelectorAll("body *"))) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(e.tagName)) continue;
      const t = ((e as HTMLElement).innerText || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (t.length < bestLen && t.includes(want)) {
        const b = e.getBoundingClientRect();
        if (b.width > 8 && b.height > 8) {
          best = e;
          bestLen = t.length;
        }
      }
    }
    if (!best) return null;
    const b = (best as Element).getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height, parseFloat(getComputedStyle(best as Element).fontSize)];
  }, needle);
  lastFontPx = r ? r[4] : 0;
  return r ? [round(r[0]), round(r[1]), round(r[2]), round(r[3])] : null;
}

const has = (texts: string[], want: string) => norm(texts.join(" ")).includes(norm(want));

async function finish(page: Page, pl: PlatePlan, url: string, states: PlateManifest["states"], bodies: string[], rects: Record<string, Rect>, h: number): Promise<PlateManifest> {
  const seen = Object.values(states).map((s) => s.result ?? "").join(" ");
  rects.both = union(rects.cA, rects.boxB);
  for (const s of Object.values(states)) s.visible = lastVisible[s.file] ?? "";
  return { id: pl.id, url, title: await page.title(), capturedAt: new Date().toISOString(), text: `${bodies.join(" ")} ${seen}`, w: VIEW.w, h, states, rects };
}

async function capturePlate(page: Page, c: Concept, pl: PlatePlan, outDir: string): Promise<PlateManifest> {
  const url = new URL(pl.path, c.origin).toString();
  const [a, b] = pl.clicks;
  const states: PlateManifest["states"] = {};
  const bodies: string[] = [];
  const body = async () => bodies.push(await page.evaluate(() => document.body.innerText));
  const rects: Record<string, Rect> = {};
  const h = PLATE_H;

  // ---- two clicks on one control group ----
  if (a.kind === "click" && b.kind === "click") {
    const gid = pl.groupId.split("#").pop() as string;
    const click = async (idx: number) => {
      await page.locator(`[data-gbc="${idx}"]`).first().click({ timeout: 5000 });
      await page.waitForTimeout(420);
    };
    const load = async () => {
      await openPage(page, url);
      const g = (await tagControls(page)).find((x) => x.id === gid);
      if (!g) throw new Error(`capture: the control group "${pl.heading}" is no longer on ${url}`);
      for (const st of [a, b]) {
        const f = g.controls.find((x) => x.index === st.control);
        if (!f || norm(f.name) !== norm(st.name)) throw new Error(`capture: control "${st.name}" moved or changed on ${url}`);
      }
      for (const idx of pl.prefix) await click(idx);
    };
    await load();
    const box0 = await rectOf(page, `[data-gbg="${gid}"]`);
    const cA = await rectOf(page, `[data-gbc="${a.control}"]`);
    await click(a.control);
    const boxA = await rectOf(page, `[data-gbg="${gid}"]`);
    const cB = await rectOf(page, `[data-gbc="${b.control}"]`);
    await click(b.control);
    const boxB = await rectOf(page, `[data-gbg="${gid}"]`);
    const mapInfo = await settleMap(page);
    if (mapInfo.rect && !mapInfo.drawn) throw new Error("capture: the map on this page never drew its tiles, so the picture would be blank");
    // a map just below the controls is part of the payoff: it goes in the crop
    const mapR = mapInfo.rect && mapInfo.rect[1] >= box0[1] - 20 && mapInfo.rect[1] - (box0[1] + box0[3]) < 400 ? mapInfo.rect : null;
    const head = pl.heading
      ? await page.evaluate((hh) => {
          const e = [...document.querySelectorAll("h1,h2,h3,h4")].find((x) => ((x as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().startsWith(hh));
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return [r.x, r.y + window.scrollY, r.width, r.height];
        }, pl.heading.slice(0, 60))
      : null;
    const headR: Rect = head ? [round(head[0]), round(head[1]), round(head[2]), round(head[3])] : cA;
    const y0 = Math.max(0, Math.round(Math.min(headR[1], box0[1], cA[1]) - 50));
    // the result line (a count, a caption) can sit below the control group: the crop reaches it and the first result card under it, so the viewer SEES the change
    const resB = await rectOfText(page, b.payoff);
    const belowGroup = resB && resB[1] > boxB[1] + boxB[3] - 4 && resB[1] - (boxB[1] + boxB[3]) < 500 ? resB : null;
    const listBottom = belowGroup ? belowGroup[1] + belowGroup[3] + 360 : 0;
    const hh = Math.min(1150, Math.round(Math.max(box0[1] + box0[3], boxA[1] + boxA[3], boxB[1] + boxB[3], mapR ? mapR[1] + mapR[3] + 24 : 0, listBottom) + 60 - y0));
    await load();
    const readLines = () =>
      page.evaluate((id) => {
        const el = document.querySelector(`[data-gbg="${id}"]`);
        const root = el?.parentElement ?? el ?? document.body;
        return ((root as HTMLElement).innerText || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 3);
      }, gid);
    const readAllLines = async () => new Set((await page.evaluate(() => document.body.innerText)).split("\n").map(clean).filter((l) => l.length >= 3 && l.length <= 300));
    let prevAll = await readAllLines();
    let prev = new Set(await readLines());
    if (mapR) await settleMap(page);
    states.s0 = { file: await shotAt(page, outDir, `${pl.id}-s0.jpg`, y0, hh), label: `${pl.heading || "Page"}, before` };
    await body();
    for (const [key, st] of [["a", a], ["b", b]] as const) {
      await click(st.control);
      if (mapR) await settleMap(page);
      const now = await readLines();
      const nowAll = await readAllLines();
      let fresh = now.filter((l) => !prev.has(l)).map(clean);
      // the controls themselves showed nothing new: the result is elsewhere on the page (a counts line, a list, a map caption)
      if (!fresh.length) fresh = [...nowAll].filter((l) => !prevAll.has(l)).slice(0, 6);
      const result = fresh.join(" | ");
      prev = new Set(now);
      prevAll = nowAll;
      if (!has([result], st.payoff)) throw new Error(`capture: after "${st.name}" the page no longer shows "${st.payoff.slice(0, 50)}"`);
      states[key] = { file: await shotAt(page, outDir, `${pl.id}-${key}.jpg`, y0, hh), label: `After ${st.name}`, result };
      await body();
    }
    const o = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
    // with a result line below the controls, the focus is that line plus the first result under it
    const listR: Rect | null = belowGroup ? [0, belowGroup[1] - 14, VIEW.w, belowGroup[3] + 14 + 340] : null;
    Object.assign(rects, { head: o(headR), cA: o(cA), cB: o(cB), boxA: o(listR ?? boxA), boxB: o(mapR ?? listR ?? boxB) });
    return finish(page, pl, url, states, bodies, rects, hh);
  }

  // ---- a live calculator: demonstration values go into the real fields and the result changes in place (nothing is submitted) ----
  if (a.kind === "fill" && b.kind === "fill") {
    type F = { field: number; name: string; value: string; select?: boolean };
    const all: F[] = [...(pl.prefixFills ?? []), a, b];
    const load = async () => {
      await openPage(page, url);
      const tf = await tagFields(page);
      for (const st of all) {
        const f = tf.fields.find((x) => x.index === st.field);
        if (!f || norm(f.label) !== norm(st.name)) throw new Error(`capture: the field "${st.name}" moved or changed on ${url}`);
      }
    };
    const apply = async (st: F) => {
      const loc = page.locator(`[data-gbf="${st.field}"]`).first();
      if (st.select) await loc.selectOption({ label: st.value }, { timeout: 5000 });
      else await loc.fill(st.value, { timeout: 5000 });
      await page.waitForTimeout(450);
    };
    const lines = async () => new Set((await page.evaluate(() => document.body.innerText)).split("\n").map(clean).filter((l) => l.length >= 3));
    await load();
    for (const st of pl.prefixFills ?? []) await apply(st);
    const cA = await rectOf(page, `[data-gbf="${a.field}"]`);
    const cB = await rectOf(page, `[data-gbf="${b.field}"]`);
    const span = (await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll("[data-gbf]")).map((e) => e.getBoundingClientRect());
      return [Math.min(...r.map((x) => x.top)) + window.scrollY, Math.max(...r.map((x) => x.bottom)) + window.scrollY];
    })) as [number, number];
    await apply(a);
    const rA = await rectOfText(page, a.payoff);
    const fontA = lastFontPx;
    await apply(b);
    const rB = await rectOfText(page, b.payoff);
    const fontB = lastFontPx;
    if (!rA || !rB) throw new Error("capture: the calculator's result is not on the page after the change");
    const head = pl.heading
      ? await page.evaluate((hh) => {
          const e = Array.from(document.querySelectorAll("h1,h2,h3,h4")).find((x) => ((x as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().startsWith(hh));
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return [r.x, r.y + window.scrollY, r.width, r.height];
        }, pl.heading.slice(0, 60))
      : null;
    const headR: Rect = head ? [round(head[0]), round(head[1]), round(head[2]), round(head[3])] : cA;
    const y0 = Math.max(0, Math.round(Math.min(headR[1], span[0]) - 30));
    const yEnd = Math.max(rA[1] + rA[3], rB[1] + rB[3], span[1]) + 70;
    const hh = Math.max(560, Math.min(1150, Math.round(yEnd - y0)));
    await load();
    for (const st of pl.prefixFills ?? []) await apply(st);
    let prev = await lines();
    states.s0 = { file: await shotAt(page, outDir, `${pl.id}-s0.jpg`, y0, hh), label: `${pl.heading || "Calculator"}, before` };
    await body();
    for (const [key, st] of [["a", a], ["b", b]] as const) {
      await apply(st);
      const now = await lines();
      const result = [...now].filter((l) => !prev.has(l)).join(" | ");
      prev = now;
      if (!has([result], st.payoff)) throw new Error(`capture: after entering "${st.value}" for "${st.name}" the page no longer shows "${st.payoff.slice(0, 50)}"`);
      states[key] = { file: await shotAt(page, outDir, `${pl.id}-${key}.jpg`, y0, hh), label: `After ${st.name} ${st.value}`, result };
      await body();
    }
    const o = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
    const pad = (r: Rect): Rect => [Math.max(8, r[0] - 12), r[1] - 12, Math.min(VIEW.w - 16, r[2] + 24), r[3] + 56];
    Object.assign(rects, { head: o(headR), cA: o(cA), cB: o(cB), boxA: o(pad(rA)), boxB: o(pad(rB)) });
    const done = await finish(page, pl, url, states, bodies, rects, hh);
    done.meta = { resultFontPx: Math.min(fontA, fontB) };
    return done;
  }

  await openPage(page, url);
  const tl = await tagLinks(page);

  // ---- open an internal link, then scroll to the part of the destination that carries the second payoff ----
  if (a.kind === "link" && b.kind === "scroll") {
    const f = tl.links.find((l) => l.href === a.href) ?? tl.links.find((l) => norm(l.text) === norm(a.name));
    if (!f) throw new Error(`capture: the link "${a.name}" is no longer on ${url}`);
    const cA = await rectOf(page, `[data-gbl="${f.index}"]`);
    const y0 = Math.max(0, Math.round(cA[1] - 360));
    states.s0 = { file: await shotAt(page, outDir, `${pl.id}-s0.jpg`, y0, h), label: `Before opening ${a.name}` };
    await body();
    await page.locator(`[data-gbl="${f.index}"]`).first().click({ timeout: 6000 });
    await page.waitForTimeout(500);
    await settle(page);
    await body();
    const blocks = await pageBlocks(page);
    const top = textIn(blocks, 0, h);
    if (!has(top, a.payoff)) throw new Error(`capture: the destination of "${a.name}" no longer shows "${a.payoff.slice(0, 50)}"`);
    states.a = { file: await shotAt(page, outDir, `${pl.id}-a.jpg`, 0, h), label: `${a.name} opened`, result: top.join(" | ") };
    const target = blocks.find((x) => norm(x.t).includes(norm(b.payoff)));
    if (!target) throw new Error(`capture: the destination no longer shows "${b.payoff.slice(0, 50)}" further down`);
    const y1 = Math.max(0, Math.round(target.y - 280));
    states.b = { file: await shotAt(page, outDir, `${pl.id}-b.jpg`, y1, h), label: "Further down the page", result: textIn(blocks, y1, h).join(" | ") };
    const cAo: Rect = [cA[0], round(cA[1] - y0), cA[2], cA[3]];
    Object.assign(rects, { head: cAo, cA: cAo, boxA: boxOfBlocks(blocks, 0, h, 3), cB: [20, round(h * 0.62), VIEW.w - 40, 120], boxB: [round(target.x), round(target.y - y1), round(Math.min(VIEW.w - 20, target.w)), round(Math.min(target.h, 300))] });
    return finish(page, pl, url, states, bodies, rects, h);
  }

  // ---- search (GET), then open the first result ----
  if (a.kind === "search" && b.kind === "link") {
    const inp = tl.inputs.find((i) => i.index === a.input) ?? tl.inputs[0];
    if (!inp) throw new Error(`capture: the search box is no longer on ${url}`);
    const cA = await rectOf(page, `[data-gbs="${inp.index}"]`);
    const y0 = Math.max(0, Math.round(cA[1] - 300));
    states.s0 = { file: await shotAt(page, outDir, `${pl.id}-s0.jpg`, y0, h), label: "The search box" };
    await body();
    const box = page.locator(`[data-gbs="${inp.index}"]`).first();
    await box.fill(a.term, { timeout: 4000 });
    await Promise.all([page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {}), box.press("Enter")]);
    await page.waitForTimeout(900);
    await settle(page);
    await body();
    let blocks = await pageBlocks(page);
    const res = textIn(blocks, 0, h);
    if (!has(res, a.payoff)) throw new Error(`capture: searching "${a.term}" no longer shows "${a.payoff.slice(0, 50)}"`);
    states.a = { file: await shotAt(page, outDir, `${pl.id}-a.jpg`, 0, h), label: `Results for ${a.term}`, result: res.join(" | ") };
    const rl = await tagLinks(page);
    const f = rl.links.find((l) => l.href === b.href);
    if (!f) throw new Error(`capture: the first result "${b.name}" is no longer on the results page`);
    const cB = await rectOf(page, `[data-gbl="${f.index}"]`);
    if (cB[1] > h - 80) throw new Error("capture: the first result is below the visible window");
    const boxA = boxOfBlocks(blocks, 0, h, 4);
    await page.locator(`[data-gbl="${f.index}"]`).first().click({ timeout: 6000 });
    await page.waitForTimeout(500);
    await settle(page);
    await body();
    blocks = await pageBlocks(page);
    const dest = textIn(blocks, 0, h);
    if (!has(dest, b.payoff)) throw new Error(`capture: the result page no longer shows "${b.payoff.slice(0, 50)}"`);
    states.b = { file: await shotAt(page, outDir, `${pl.id}-b.jpg`, 0, h), label: `${b.name} opened`, result: dest.join(" | ") };
    const cAo: Rect = [cA[0], round(cA[1] - y0), cA[2], cA[3]];
    Object.assign(rects, { head: cAo, cA: cAo, boxA, cB, boxB: boxOfBlocks(blocks, 0, h, 3) });
    return finish(page, pl, url, states, bodies, rects, h);
  }
  throw new Error(`capture: unsupported step combination ${a.kind} then ${b.kind}`);
}

export function captureConcept(c: Concept) {
  return async (outDir: string, logoFile: string): Promise<Manifest> => {
    await mkdir(outDir, { recursive: true });
    const b = await openBrowsed(c.origin);
    const capturedAt = new Date().toISOString();
    const plates: Record<string, PlateManifest> = {};
    try {
      for (const pl of c.capturePlan) plates[pl.id] = await capturePlate(b.page, c, pl, outDir);
    } finally {
      await b.close();
    }
    const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  };
}
