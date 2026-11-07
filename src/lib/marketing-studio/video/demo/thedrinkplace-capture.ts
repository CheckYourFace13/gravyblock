/**
 * Captures REAL states of the TheDrinkPlace public site at phone width. Read-only: GET requests to thedrinkplace.com only (analytics, the search
 * click-tracker and every third-party host such as map tiles are refused, so the capture is not a visitor and nothing is submitted). The site's own
 * 21+ age confirmation is clicked once, exactly as an adult visitor does. The only other input is typing into the site's own drink search, which
 * runs as a plain GET search. No account is created and nobody signs in.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, rectByText, round, union, VIEW } from "./plates";
import type { Manifest, PlateManifest, Rect } from "./types";

export const TDP_ORIGIN = "https://thedrinkplace.com";

/** Box of the card that holds an element: the nearest ancestor that is wide and tall enough to be a card and contains `needle`. */
async function cardAround(page: Page, anchorText: string, needle: string): Promise<Rect> {
  const r = await page.evaluate(
    ({ anchorText, needle }) => {
      const a = [...document.querySelectorAll("main a, main button")].find((e) => (e.textContent || "").trim() === anchorText);
      if (!a) return null;
      let el: Element | null = a;
      for (let i = 0; i < 8 && el; i++) {
        const b = el.getBoundingClientRect();
        if (b.width >= 280 && b.height >= 120 && (el.textContent || "").includes(needle)) return [b.x, b.y + window.scrollY, b.width, b.height];
        el = el.parentElement;
      }
      return null;
    },
    { anchorText, needle },
  );
  if (!r) throw new Error(`capture: no card around "${anchorText}"`);
  return [round(r[0]), round(r[1]), round(r[2]), round(r[3])];
}

export async function captureTheDrinkPlacePlates(outDir: string, logoFile: string): Promise<Manifest> {
  await mkdir(outDir, { recursive: true });
  const handle = await launchBrowser();
  const capturedAt = new Date().toISOString();
  const plates: Record<string, PlateManifest> = {};
  try {
    const ctx = await handle.browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: VIEW.dpr, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, serviceWorkers: "block" });
    await ctx.route("**/*", (route) => {
      const req = route.request();
      let host = "";
      try {
        host = new URL(req.url()).hostname;
      } catch {
        /* ignore */
      }
      if (req.method() !== "GET" || host !== "thedrinkplace.com" || /plausible|analytics|gtag|googletagmanager|posthog|clarity|hotjar|api\/search\/click|\/api\/(track|events|analytics)/i.test(req.url())) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();
    let gateText = "";
    const open = async (pathname: string) => {
      await page.goto(TDP_ORIGIN + pathname, { waitUntil: "networkidle", timeout: 60_000 });
      await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
      await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important} .leaflet-container{display:none !important}" });
      const gate = page.getByRole("button", { name: "I am 21+" });
      if (await gate.count()) {
        gateText = (await page.evaluate(() => document.body.innerText)).slice(0, 400);
        await gate.first().click();
        await page.waitForTimeout(500);
      }
      // The site offers to use the visitor location; declining is the privacy-preserving choice and keeps the prompt out of the shots.
      const notNow = page.getByRole("button", { name: "Not now" });
      if ((await notNow.count()) && (await notNow.first().isVisible())) await notNow.first().click();
      await page.waitForTimeout(400);
    };
    const shot = async (file: string, clip: { y: number; h: number }) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const buf = await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: clip.y, width: VIEW.w, height: clip.h } });
      await writeFile(path.join(outDir, file), buf);
      return file;
    };
    const plate = async (id: string, pathname: string, h: number, states: PlateManifest["states"], rects: PlateManifest["rects"]) => {
      const text = await page.evaluate(() => document.body.innerText);
      const seen = Object.values(states).map((x) => x.result ?? "").join(" ");
      plates[id] = { id, url: TDP_ORIGIN + pathname, title: await page.title(), capturedAt: new Date().toISOString(), text: `${gateText} ${text} ${seen}`, w: VIEW.w, h, states, rects };
    };
    const mainText = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const off = (y0: number) => (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];

    // ---- home: evidence for the headline (not shown) -----------------------------------------------------------------------
    await open("/");
    await plate("home", "/", VIEW.h, { s0: { file: await shot("home.jpg", { y: 0, h: VIEW.h }), label: "Home page" } }, {});

    // ---- two live searches: type into the site's own drink search, submit, read the results ----------------------------------
    const searchPlate = async (id: string, query: string, rectsFor: (y0: number) => Promise<PlateManifest["rects"]>) => {
      await open("/search");
      const q = page.locator("#q");
      const qb = await q.boundingBox();
      if (!qb) throw new Error("capture: search box not found");
      const sy = await page.evaluate(() => window.scrollY);
      const y0 = Math.max(0, Math.round(qb.y + sy - 150));
      const h = 900;
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot(`${id}-s0.jpg`, { y: y0, h }), label: "Search page as it opens" };
      await q.fill(query);
      await page.waitForTimeout(250);
      states.typed = { file: await shot(`${id}-typed.jpg`, { y: y0, h }), label: `Typed: ${query}` };
      const inputRect: Rect = [round(qb.x), round(qb.y + sy - y0), round(qb.width), round(qb.height)];
      await q.press("Enter");
      await page.waitForURL(/\/search\?/, { timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({ content: "*{animation:none !important;transition:none !important}" });
      await page.waitForTimeout(500);
      states.results = { file: await shot(`${id}-results.jpg`, { y: y0, h }), label: `Results for ${query}`, result: await mainText() };
      const extra = await rectsFor(y0);
      await plate(id, `/search?q=${encodeURIComponent(query)}`, h, states, { input: inputRect, ...extra });
    };
    await searchPlate("search1", "Negroni", async (y0) => {
      const first = await rectByText(page, "Negroni", { maxExtra: 40, card: true });
      const related = await rectByText(page, "Negroni Sbagliato", { maxExtra: 40, card: true });
      const lastRel = await rectByText(page, "Mezcal Negroni", { maxExtra: 40, card: true });
      return { first: off(y0)(first), related: off(y0)(union(related, lastRel)) };
    });
    await searchPlate("search2", "Buffalo Trace", async (y0) => {
      const product = await rectByText(page, "Buffalo Trace · BOURBON", { maxExtra: 30, card: true });
      const brands = await rectByText(page, "Brands", { maxExtra: 8 });
      return { product: off(y0)(product), brands: off(y0)(brands) };
    });

    // ---- a real drink page: what it is, ingredients, how to make it; then where it was seen on a menu ------------------------
    await open("/drink/negroni");
    {
      const h1 = await rectByText(page, "Negroni", { maxExtra: 3 });
      const what = await rectByText(page, "Equal parts gin, Campari, and sweet vermouth.", { maxExtra: 40 });
      const gin = await rectByText(page, "30 ml gin", { maxExtra: 20 });
      const verm = await rectByText(page, "30 ml sweet red vermouth", { maxExtra: 20 });
      const how = await rectByText(page, "Pour gin, Campari, and vermouth over ice in a rocks glass.", { maxExtra: 40 });
      const src = await rectByText(page, "Source: International Bartenders Association", { maxExtra: 30 });
      const y0 = Math.max(0, Math.round(h1[1] - 80));
      const h = Math.round(src[1] + src[3] + 50 - y0);
      const o = off(y0);
      await plate("drink", "/drink/negroni", h, { s0: { file: await shot("drink.jpg", { y: y0, h }), label: "Negroni drink page" } }, { title: o(h1), what: o(what), ingredients: o(union(gin, verm)), how: o(how) });
    }
    {
      const head = await rectByText(page, "Find near you", { maxExtra: 3 });
      const note = await rectByText(page, "A place listed here is a sourced menu observation", { maxExtra: 200 });
      const venue = await cardAround(page, "View place", "Source:");
      const source = await rectByText(page, "Source:", { maxExtra: 80 });
      const y0 = Math.max(0, Math.round(head[1] - 60));
      const h = Math.round(venue[1] + venue[3] + 50 - y0);
      const o = off(y0);
      await plate("where", "/drink/negroni", h, { s0: { file: await shot("where.jpg", { y: y0, h }), label: "Where the drink was seen on a menu" } }, { head: o(head), note: o(note), venue: o(venue), source: o(source) });
    }
    await ctx.close();
  } finally {
    await handle.close();
  }
  const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
