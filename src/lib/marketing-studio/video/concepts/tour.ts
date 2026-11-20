/**
 * LIVE PRODUCT TOUR (owner directive 2026-11-15, permanent for GravyBlock's own videos): the video uses the REAL product. A scene is a sequence of verified interactions on the live
 * site, as many as the narration has time for: open a page, scroll to something, click a link or a tab, type into a field, submit (only where a step names the one request that is allowed).
 * Every step produces a real screenshot of the live page in the state the step leaves it in, and the capture REFUSES to go on when the picture would be bad: the page did not load, it is
 * black or blank, the text the step is supposed to show is not on it, or it is an error page. Nothing is drawn; nothing is faked.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, round, VIEW } from "../demo/plates";
import { PLATE_CSS_W, type Manifest, type PlateManifest, type Rect } from "../demo/types";
import { visibleText } from "./browse";
import type { Concept } from "./types";

export type TourStep = {
  /** which of the scene's three narration lines this step belongs to; the steps of one line are spread over the time that line is spoken */
  node: 0 | 1 | 2;
  do: "open" | "scroll" | "click" | "type" | "submit";
  /** open: the page of the product */
  path?: string;
  /** scroll / click / submit: the visible text of the element (a link, a button, a heading, a paragraph) */
  text?: string;
  /** type: the label or the placeholder of the field */
  field?: string;
  value?: string;
  /** what the focus chip says on screen */
  label?: string;
  /** text that must be on the screen after this step: the proof that the real product UI is showing */
  shows: string;
  /** submit: the one request (a URL fragment) that is allowed to leave the page */
  allowPost?: string;
};
export type TourScene = { steps: TourStep[] };
export const PLATE_H = 1000;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Pure: how a picture is judged. Black, flat and unreadable pictures are never used. */
export function judgePicture(p: { meanLuma: number; stdev: number; textChars: number; status: number | null; title: string; heading: string }): string | null {
  if (p.status !== null && p.status >= 400) return `the page failed to load (HTTP ${p.status})`;
  if (/\b404\b|not found|something went wrong|application error/i.test(`${p.title} ${p.heading}`)) return `the page is an error page ("${(p.heading || p.title).slice(0, 40)}")`;
  if (p.meanLuma < 28) return `the picture is black (brightness ${Math.round(p.meanLuma)} of 255)`;
  if (p.stdev < 8) return `the picture is blank or one flat colour`;
  if (p.textChars < 40) return `the page shows almost no text (${p.textChars} characters), so it did not really load`;
  return null;
}

/** A context for the product's OWN site only: GET requests, no analytics, nothing leaves the site. A POST is let through only for the step that names it. */
async function openTourBrowser(origin: string) {
  const handle = await launchBrowser();
  const host = new URL(origin).hostname;
  const ctx = await handle.browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: VIEW.dpr, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, serviceWorkers: "block" });
  const gate = { allowPost: "" };
  await ctx.route("**/*", (route) => {
    const req = route.request();
    let h = "";
    try {
      h = new URL(req.url()).hostname;
    } catch {
      /* ignore */
    }
    if (req.method() !== "GET" && !(gate.allowPost && req.url().includes(gate.allowPost) && h === host)) return route.abort();
    if (/plausible|analytics|gtag|googletagmanager|posthog|clarity|hotjar|doubleclick|facebook|segment|mixpanel|hubspot/i.test(req.url())) return route.abort();
    if (h !== host && !["image", "font", "stylesheet", "media"].includes(req.resourceType())) return route.abort();
    return route.continue();
  });
  await ctx.addInitScript("window.__name = function (f) { return f; };");
  return { page: await ctx.newPage(), gate, close: () => handle.close() };
}

async function settleTour(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important}" }).catch(() => {});
  // a cookie or consent prompt never belongs in a video
  await page.getByRole("button", { name: /^(reject|decline|deny)( all| optional| non-essential)?( cookies)?$/i }).first().click({ timeout: 1500 }).catch(() => {});
  await page.evaluate(() => {
    for (const e of Array.from(document.querySelectorAll("body *"))) {
      const cs = getComputedStyle(e);
      if ((cs.position === "fixed" || cs.position === "sticky") && /cookie|consent/i.test((e as HTMLElement).innerText || "") && (e as HTMLElement).innerText.length < 900) (e as HTMLElement).style.display = "none";
    }
  });
  await page.waitForTimeout(350);
}

/** The box (page coordinates) of the smallest visible element whose own text contains the needle. */
async function rectOfText(page: Page, needle: string): Promise<Rect | null> {
  const r = await page.evaluate((n) => {
    const want = n.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
    let best: Element | null = null;
    let bestLen = Infinity;
    for (const e of Array.from(document.querySelectorAll("body *"))) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "HTML", "HEAD"].includes(e.tagName)) continue;
      const t = ((e as HTMLElement).innerText || "").toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
      if (t.length < bestLen && t.includes(want)) {
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        if (b.width > 8 && b.height > 8 && cs.visibility !== "hidden" && cs.display !== "none") {
          best = e;
          bestLen = t.length;
        }
      }
    }
    if (!best) return null;
    const b = (best as Element).getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height];
  }, needle);
  return r ? [round(r[0]), round(r[1]), round(r[2]), round(r[3])] : null;
}

async function rectOfField(page: Page, field: string): Promise<Rect | null> {
  const loc = page.getByLabel(field, { exact: false }).first();
  const box = await loc.boundingBox({ timeout: 4000 }).catch(() => null);
  if (!box) return null;
  const sy = await page.evaluate(() => window.scrollY);
  return [round(box.x), round(box.y + sy), round(box.width), round(box.height)];
}

const clampRect = (r: Rect): Rect => [Math.max(0, r[0]), r[1], Math.min(PLATE_CSS_W - Math.max(0, r[0]), r[2]), r[3]];

/** Captures a scene's steps as states: s0 after the opening step, then t1, t2 ... one per later step. Throws, with a plain reason, when any picture is not usable. */
async function captureScene(page: Page, gate: { allowPost: string }, origin: string, sceneId: string, scene: TourScene, outDir: string, sink: { texts: string[] }): Promise<PlateManifest> {
  const states: PlateManifest["states"] = {};
  const rects: Record<string, Rect> = {};
  const meta: Record<string, number> = { resultFontPx: 16 };
  let status: number | null = null;
  const first = scene.steps[0];
  if (!first || first.do !== "open" || !first.path) throw new Error(`tour: scene ${sceneId} must begin by opening a page`);

  let prevY0: number | null = null;
  const inWindow = (y0: number, r: Rect) => r[1] >= y0 + 40 && r[1] + r[3] <= y0 + PLATE_H - 120;
  /**
   * One picture of the live page after a step. On the same page the window stays where it was while the thing being used is still inside it (so the cursor and the result sit in the same
   * coordinates across states); a new page, or a step that moves out of the window, puts the window where the viewer is looking. `from` is the box the step acted on, in the PREVIOUS picture.
   */
  const shot = async (key: string, step: TourStep, from: Rect | null, label: string, navigated: boolean, result?: string) => {
    const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    const shown = await rectOfText(page, step.shows);
    const anchor = shown ?? from;
    const clampY = (y: number) => Math.max(0, Math.min(Math.round(y), Math.max(0, pageH - PLATE_H)));
    const y0 = !navigated && prevY0 !== null && anchor && inWindow(prevY0, anchor) ? prevY0 : navigated && !anchor ? 0 : clampY((anchor ? anchor[1] : 0) - 230);
    const file = `${sceneId}-${key}.jpg`;
    const buf = await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: y0, width: PLATE_CSS_W, height: PLATE_H } });
    await writeFile(path.join(outDir, file), buf);
    const visible = await visibleText(page, y0, PLATE_H).catch(() => "");
    const body = await page.evaluate(() => document.body.innerText);
    sink.texts.push(body);
    const sharp = (await import("sharp")).default;
    const st = await sharp(buf).stats();
    const ch = st.channels.slice(0, 3);
    const heading = await page.evaluate(() => (document.querySelector("h1")?.textContent ?? "").trim());
    const bad = judgePicture({ meanLuma: ch.reduce((a, c) => a + c.mean, 0) / ch.length, stdev: ch.reduce((a, c) => a + c.stdev, 0) / ch.length, textChars: visible.length, status, title: await page.title(), heading });
    if (bad) throw new Error(`tour: ${sceneId} ${key} (${label}): ${bad}`);
    if (!norm(`${visible} ${body}`).includes(norm(step.shows))) throw new Error(`tour: ${sceneId} ${key} (${label}): the live page does not show "${step.shows.slice(0, 60)}", so the expected product UI is missing`);
    // the text the step is meant to show must be inside THIS picture, not just somewhere on the page
    if (!norm(visible).includes(norm(step.shows))) throw new Error(`tour: ${sceneId} ${key} (${label}): "${step.shows.slice(0, 60)}" is on the page but not inside the picture`);
    states[key] = { file, label, visible, ...(result ? { result } : {}) };
    const n = key === "s0" ? 0 : Number(key.slice(1));
    const fromY = navigated ? (prevY0 ?? 0) : y0;
    const f: Rect = from ? [from[0], from[1] - fromY, from[2], from[3]] : shown ? [shown[0], shown[1] - y0, shown[2], shown[3]] : [0, 300, PLATE_CSS_W, 160];
    rects[`f${n}`] = clampRect([f[0], round(f[1]), f[2], f[3]]);
    const r: Rect = shown ? [shown[0], shown[1] - y0, shown[2], Math.min(shown[3], 420)] : f;
    rects[`r${n}`] = clampRect([r[0], round(r[1]), r[2], r[3]]);
    if (navigated) meta[`nav${n}`] = 1;
    prevY0 = y0;
    return y0;
  };

  const go = async (p: string) => {
    const resp = await page.goto(new URL(p, origin).toString(), { waitUntil: "networkidle", timeout: 60_000 });
    status = resp?.status() ?? null;
    await settleTour(page);
    await page.evaluate(() => window.scrollTo(0, 0));
  };

  await go(first.path);
  await shot("s0", first, null, first.label ?? "The real page", true);

  for (let k = 1; k < scene.steps.length; k++) {
    const s = scene.steps[k];
    const label = s.label ?? s.text ?? s.field ?? s.do;
    let focus: Rect | null = null;
    let navigated = false;
    if (s.do === "open") {
      if (!s.path) throw new Error(`tour: ${sceneId} step ${k} opens nothing`);
      await go(s.path);
      navigated = true;
    } else if (s.do === "scroll") {
      if (!s.text) throw new Error(`tour: ${sceneId} step ${k} scrolls to nothing`);
      focus = await rectOfText(page, s.text);
      if (!focus) throw new Error(`tour: ${sceneId} step ${k}: "${s.text.slice(0, 50)}" is no longer on ${page.url()}`);
      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 230)), focus[1]);
      await page.waitForTimeout(250);
    } else if (s.do === "type") {
      if (!s.field || s.value === undefined) throw new Error(`tour: ${sceneId} step ${k} types nothing`);
      focus = await rectOfField(page, s.field);
      if (!focus) throw new Error(`tour: ${sceneId} step ${k}: the field "${s.field}" is no longer on ${page.url()}`);
      const loc = page.getByLabel(s.field, { exact: false }).first();
      await loc.click({ timeout: 5000 });
      await loc.fill(s.value, { timeout: 5000 });
      await page.waitForTimeout(450);
    } else {
      if (!s.text) throw new Error(`tour: ${sceneId} step ${k} clicks nothing`);
      const el = page.getByRole("link", { name: s.text, exact: false }).or(page.getByRole("button", { name: s.text, exact: false })).or(page.getByRole("tab", { name: s.text, exact: false })).first();
      const box = await el.boundingBox({ timeout: 5000 }).catch(() => null);
      if (!box) throw new Error(`tour: ${sceneId} step ${k}: "${s.text.slice(0, 50)}" is no longer a control on ${page.url()}`);
      await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      const b2 = (await el.boundingBox().catch(() => null)) ?? box;
      const sy = await page.evaluate(() => window.scrollY);
      focus = [round(b2.x), round(b2.y + sy), round(b2.width), round(b2.height)];
      if (s.do === "submit") {
        if (!s.allowPost) throw new Error(`tour: ${sceneId} step ${k} submits without naming the one request that is allowed`);
        gate.allowPost = s.allowPost;
      }
      const before = page.url();
      await el.click({ timeout: 6000 });
      await page.waitForTimeout(500);
      if (page.url() !== before) {
        navigated = true;
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await settleTour(page);
        await page.evaluate(() => window.scrollTo(0, 0));
      } else await page.waitForTimeout(400);
      gate.allowPost = "";
    }
    await shot(`t${k}`, s, focus, `${label}`, navigated, s.shows);
  }
  return { id: sceneId, url: new URL(first.path, origin).toString(), title: await page.title(), capturedAt: new Date().toISOString(), text: sink.texts.join("\n"), w: PLATE_CSS_W, h: PLATE_H, states, rects, meta };
}

export function captureTour(c: Concept) {
  return async (outDir: string, logoFile: string): Promise<Manifest> => {
    const tour = c.tour;
    if (!tour) throw new Error("not a tour concept");
    await mkdir(outDir, { recursive: true });
    const b = await openTourBrowser(c.origin);
    const capturedAt = new Date().toISOString();
    const plates: Record<string, PlateManifest> = {};
    try {
      for (let i = 0; i < tour.scenes.length; i++) plates[`x${i + 1}`] = await captureScene(b.page, b.gate, c.origin, `x${i + 1}`, tour.scenes[i], outDir, { texts: [] });
    } finally {
      await b.close();
    }
    const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  };
}

/**
 * A dry run of a tour on the LIVE site, before any render: the same pages are opened and the same scrolls, field entries and clicks are made (GET only, nothing is submitted, no picture is taken), and every
 * step is checked the way the capture checks it: the text to scroll to is found, the control exists and works, the text the step must show is on the page afterwards. It costs seconds and no money, and it
 * catches the one thing a snapshot of the site cannot: text the capture cannot locate on the page as it really loads. `bad` lists the texts that failed, so they are not offered to a planner again.
 */
export async function dryRunTour(origin: string, scenes: Array<{ tour?: TourStep[] }>): Promise<{ problems: string[]; bad: string[] }> {
  const problems: string[] = [];
  const bad: string[] = [];
  const b = await openTourBrowser(origin);
  try {
    for (let i = 0; i < scenes.length; i++) {
      const steps = scenes[i].tour ?? [];
      const page = b.page;
      for (let k = 0; k < steps.length; k++) {
        const s = steps[k];
        const tag = `scene ${i + 1} step ${k + 1}`;
        try {
          if (s.do === "open") {
            await page.goto(new URL(s.path ?? "/", origin).toString(), { waitUntil: "networkidle", timeout: 60_000 });
            await settleTour(page);
          } else if (s.do === "scroll") {
            if (!s.text || !(await rectOfText(page, s.text))) {
              problems.push(`${tag}: "${(s.text ?? "").slice(0, 60)}" cannot be found on ${page.url()}`);
              if (s.text) bad.push(s.text);
              continue;
            }
          } else if (s.do === "type") {
            const loc = page.getByLabel(s.field ?? "", { exact: false }).first();
            await loc.click({ timeout: 5000 });
            await loc.fill(s.value ?? "", { timeout: 5000 });
          } else {
            const name = s.text ?? "";
            const el = page.getByRole("link", { name, exact: false }).or(page.getByRole("button", { name, exact: false })).or(page.getByRole("tab", { name, exact: false })).first();
            const box = await el.boundingBox({ timeout: 5000 }).catch(() => null);
            if (!box) {
              problems.push(`${tag}: "${name.slice(0, 60)}" is not a control on ${page.url()}`);
              bad.push(name);
              continue;
            }
            const before = page.url();
            await el.click({ timeout: 6000 });
            await page.waitForTimeout(500);
            if (page.url() !== before) {
              await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
              await settleTour(page);
            }
          }
          if (s.shows) {
            const body = await page.evaluate(() => document.body.innerText);
            if (!norm(body).includes(norm(s.shows))) {
              problems.push(`${tag}: the live page does not show "${s.shows.slice(0, 60)}"`);
              bad.push(s.shows);
            }
          }
        } catch (e) {
          problems.push(`${tag}: ${String(e instanceof Error ? e.message : e).slice(0, 100)}`);
        }
      }
    }
  } finally {
    await b.close();
  }
  return { problems, bad };
}
