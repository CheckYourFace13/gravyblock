/**
 * Captures REAL states of the DrinkKnird public site at phone width. Read-only: GET requests to drinkknird.com only (third-party ad and
 * analytics hosts are refused, so the capture shows the product, not its ads, and does not count as a visitor). The only input ever typed is
 * into the site's own scalers and converters, which compute in the browser. No form is submitted and nothing is saved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { boxOf, MOBILE_UA, rectByText, round, union, VIEW } from "./plates";
import type { Manifest, PlateManifest, Rect } from "./types";

export const DK_ORIGIN = "https://drinkknird.com";

/** Box of the first link or button in <main> whose text matches (apostrophes in the site's copy may be straight or curly). */
async function controlBox(page: Page, name: RegExp, offsetY = 0): Promise<Rect> {
  const loc = page.locator("main a, main button").filter({ hasText: name }).first();
  const b = await loc.boundingBox();
  if (!b) throw new Error(`capture: no control matching ${name} on ${page.url()}`);
  const sy = await page.evaluate(() => window.scrollY);
  return [round(b.x), round(b.y + sy - offsetY), round(b.width), round(b.height)];
}

export async function captureDrinkKnirdPlates(outDir: string, logoFile: string): Promise<Manifest> {
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
      if (req.method() !== "GET" || host !== "drinkknird.com" || /plausible|analytics|gtag|doubleclick|adsbygoogle/i.test(req.url())) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();

    const open = async (pathname: string) => {
      await page.goto(DK_ORIGIN + pathname, { waitUntil: "networkidle", timeout: 45_000 });
      await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
      // Third-party ads are refused above; collapse the empty slots they would have filled so the capture is the page, not a blank hole.
      await page.addStyleTag({ content: ".ad-reserve{display:none !important}" });
      await page.waitForTimeout(600);
    };
    const shot = async (file: string, clip?: { y: number; h: number }) => {
      const buf = await page.screenshot(clip ? { type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: clip.y, width: VIEW.w, height: clip.h } } : { type: "jpeg", quality: 92 });
      await writeFile(path.join(outDir, file), buf);
      return file;
    };
    const textOf = () => page.evaluate(() => document.body.innerText);
    const finish = async (id: string, pathname: string, h: number, states: PlateManifest["states"], rects: PlateManifest["rects"]) => {
      plates[id] = { id, url: DK_ORIGIN + pathname, title: await page.title(), capturedAt: new Date().toISOString(), text: await textOf(), w: VIEW.w, h, states, rects };
    };

    // ---- tools index: evidence for what the converter is described as (not shown in the video) ----------------------
    await open("/tools");
    await finish("tools", "/tools", VIEW.h, { s0: { file: await shot("tools.jpg"), label: "Tools index" } }, {});

    // ---- classic Negroni recipe: the real "Scale servings" control, ingredients change live ---------------------------
    {
      await open("/negroni");
      const servings = page.locator("main input[type=number]").first();
      const ingredients = () => page.locator("main li").filter({ hasText: /ml[)]/ }).allInnerTexts().then((t) => t.join(" | ")).catch(() => "");
      const label = await rectByText(page, "Scale servings", { maxExtra: 30 });
      const ice = await rectByText(page, "Ice for stirring", { maxExtra: 80 });
      const y0 = Math.round(label[1] - 210);
      const h = Math.round(ice[1] + ice[3] + 60 - y0);
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("negroni-s0.jpg", { y: y0, h }), label: "Recipe as published: 1 cocktail", result: await ingredients() };
      for (const v of ["2", "4", "8"]) {
        await servings.fill(v);
        await page.waitForTimeout(250);
        states[`v${v}`] = { file: await shot(`negroni-v${v}.jpg`, { y: y0, h }), label: `Servings changed to ${v}`, result: await ingredients() };
      }
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      // Measured while the scaled list is showing (servings 8), which is the list the video highlights.
      const gin = await rectByText(page, "(240 ml) gin", { maxExtra: 60 });
      const campari = await rectByText(page, "(240 ml) Campari", { maxExtra: 20 });
      const vermouth = await rectByText(page, "(240 ml) sweet red vermouth", { maxExtra: 20 });
      const rects: PlateManifest["rects"] = {
        servings: off(await boxOf(page, "main input[type=number]", 0)),
        label: off(label),
        ingredients: off(union(gin, campari, vermouth)),
        gin: off(gin),
        campari: off(campari),
        vermouth: off(vermouth),
      };
      await finish("negroni", "/negroni", h, states, rects);
    }

    // ---- measurement converter: volume and oven temperature, live results ----------------------------------------
    {
      await open("/tools/measurement-converter");
      const results = async () => (await page.locator("main").innerText()).split("\n").filter((l) => l.startsWith("Result:")).join(" | ");
      const title = await rectByText(page, "Kitchen measurement converter", { maxExtra: 10 });
      const tempRes = await page.getByText(/^Result: .*°/).first().boundingBox();
      if (!tempRes) throw new Error("capture: converter temperature result not found");
      const sy0 = await page.evaluate(() => window.scrollY);
      const y0 = Math.round(title[1] - 70);
      const h = Math.round(tempRes.y + sy0 + tempRes.height + 70 - y0);
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("conv-s0.jpg", { y: y0, h }), label: "Converter as it loads: 1 cup to ml", result: await results() };
      await page.locator("main input[type=number]").nth(0).fill("4");
      await page.waitForTimeout(200);
      states.a4 = { file: await shot("conv-a4.jpg", { y: y0, h }), label: "Amount changed to 4", result: await results() };
      await page.locator("main select").nth(1).selectOption({ label: "oz (liquid)" });
      await page.waitForTimeout(200);
      states.oz = { file: await shot("conv-oz.jpg", { y: y0, h }), label: "Converted to ounces", result: await results() };
      await page.locator("main select").nth(2).selectOption({ label: "°C → °F" });
      await page.waitForTimeout(200);
      states.uC = { file: await shot("conv-uC.jpg", { y: y0, h }), label: "Oven temperature unit switched to Celsius", result: await results() };
      await page.locator("main input[type=number]").nth(1).fill("180");
      await page.waitForTimeout(200);
      states.t180 = { file: await shot("conv-t180.jpg", { y: y0, h }), label: "Oven temperature set to 180", result: await results() };
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator("main input[type=number]").nth(0).fill("1");
      await page.locator("main select").nth(1).selectOption({ label: "ml" });
      await page.locator("main select").nth(2).selectOption({ label: "°F → °C" });
      await page.locator("main input[type=number]").nth(1).fill("350");
      await page.waitForTimeout(200);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      const volRes = await rectByText(page, "Result: 236.6 ml", { maxExtra: 10 });
      const tRes = await rectByText(page, "Result: 176.7", { maxExtra: 10 });
      const rects: PlateManifest["rects"] = {
        title: off(title),
        amount: off(await boxOf(page, "main input[type=number]", 0)),
        to: off(await boxOf(page, "main select", 1)),
        volumeResult: off(volRes),
        unit: off(await boxOf(page, "main select", 2)),
        temp: off(await boxOf(page, "main input[type=number]", 1)),
        tempResult: off(tRes),
      };
      await finish("converter", "/tools/measurement-converter", h, states, rects);
    }

    // ---- the story behind the Negroni: a real history page -------------------------------------------------------
    {
      await open("/origins-of-the-negroni");
      const h1 = await boxOf(page, "main h1", 0);
      const intro = await rectByText(page, "Explore the documented origins and disputed stories", { maxExtra: 200 });
      const docs = await rectByText(page, "Documented origin claims", { maxExtra: 5 });
      const disputed = await rectByText(page, "However, some historians and enthusiasts question", { maxExtra: 700 });
      const y0 = Math.round(h1[1] - 90);
      const h = Math.round(disputed[1] + disputed[3] + 50 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      const rects: PlateManifest["rects"] = { title: off(h1), intro: off(intro), docs: off(docs), disputed: off(disputed) };
      await finish("story", "/origins-of-the-negroni", h, { s0: { file: await shot("story.jpg", { y: y0, h }), label: "Origins of the Negroni" } }, rects);
    }

    // ---- home page: recipes, what's hot, events, tools -----------------------------------------------------------
    {
      await open("/");
      const heading = await rectByText(page, "Drink, Cook, Discover Something New", { maxExtra: 5 });
      const read = page.locator("main a", { hasText: /Read the story/ }).first();
      const rb = await read.boundingBox();
      if (!rb) throw new Error("capture: home featured link not found");
      const sy = await page.evaluate(() => window.scrollY);
      const y0 = Math.max(0, Math.round(heading[1] - 160));
      const h = Math.round(rb.y + sy + rb.height + 70 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      const rects: PlateManifest["rects"] = {
        heading: off(heading),
        whatsHot: off(await controlBox(page, /^\s*What.s Hot\s*$/)),
        recipes: off(await controlBox(page, /^\s*Browse recipes\s*$/)),
        events: off(await controlBox(page, /^\s*Events\s*$/)),
        tools: off(await controlBox(page, /^\s*Tools\s*$/)),
      };
      await finish("home", "/", h, { s0: { file: await shot("home.jpg", { y: y0, h }), label: "DrinkKnird home page" } }, rects);
    }
    await ctx.close();
  } finally {
    await handle.close();
  }
  const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
