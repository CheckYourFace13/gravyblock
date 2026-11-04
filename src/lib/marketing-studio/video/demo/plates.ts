/**
 * Captures REAL states of the RentalNoodle public interface at phone width. Read-only: GET requests to the product's own domain, no
 * accounts, no form submission. The only input ever typed is into the free calculators, which compute in the browser. Analytics requests
 * are blocked so the capture does not count as a visitor.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { PLATE_CSS_W, type Manifest, type PlateManifest, type Rect } from "./types";

const ORIGIN = "https://rentalnoodle.com";
const VIEW = { w: PLATE_CSS_W, h: 844, dpr: 3 };
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 GravyBlockStudioCapture";

const round = (n: number) => Math.round(n * 10) / 10;

/** Finds the smallest element containing the text and returns its box (or its card's box) in page coordinates. */
async function rectByText(page: Page, text: string, opts: { card?: boolean; offsetY?: number; maxExtra?: number } = {}): Promise<Rect> {
  const r = await page.evaluate(
    ({ text, card, maxExtra }) => {
      const els = [...document.querySelectorAll("main *")].filter((e) => {
        const t = (e.textContent || "").replace(/\s+/g, " ").trim();
        return t.includes(text) && t.length < text.length + maxExtra;
      });
      const e = els.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
      if (!e) return null;
      let box: Element = e;
      if (card) for (let i = 0; i < 6 && box.parentElement; i++) {
        const b = box.getBoundingClientRect();
        if (b.width >= 280 && b.height >= 56) break;
        box = box.parentElement;
      }
      const b = box.getBoundingClientRect();
      return [b.x, b.y + window.scrollY, b.width, b.height];
    },
    { text, card: Boolean(opts.card), maxExtra: opts.maxExtra ?? 90 },
  );
  if (!r) throw new Error(`capture: could not find "${text}" on ${page.url()}`);
  return [round(r[0]), round(r[1] - (opts.offsetY ?? 0)), round(r[2]), round(r[3])];
}

async function boxOf(page: Page, selector: string, nth = 0, offsetY = 0): Promise<Rect> {
  const b = await page.locator(selector).nth(nth).boundingBox();
  if (!b) throw new Error(`capture: no box for ${selector}[${nth}] on ${page.url()}`);
  const sy = await page.evaluate(() => window.scrollY);
  return [round(b.x), round(b.y + sy - offsetY), round(b.width), round(b.height)];
}

const union = (...rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r[0]));
  const y = Math.min(...rs.map((r) => r[1]));
  const x2 = Math.max(...rs.map((r) => r[0] + r[2]));
  const y2 = Math.max(...rs.map((r) => r[1] + r[3]));
  return [x, y, x2 - x, y2 - y];
};

export async function capturePlates(outDir: string, logoFile: string): Promise<Manifest> {
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
      if (req.method() !== "GET" || host !== "rentalnoodle.com" || /plausible|analytics|gtag/i.test(req.url())) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();

    const open = async (pathname: string) => {
      await page.goto(ORIGIN + pathname, { waitUntil: "networkidle", timeout: 45_000 });
      await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
      await page.waitForTimeout(500);
    };
    const shot = async (file: string, clip?: { y: number; h: number }) => {
      const p = path.join(outDir, file);
      const buf = await page.screenshot(clip ? { type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: clip.y, width: VIEW.w, height: clip.h } } : { type: "jpeg", quality: 92 });
      await writeFile(p, buf);
      return file;
    };
    const textOf = () => page.evaluate(() => document.body.innerText);
    const finish = async (id: string, pathname: string, w: number, h: number, states: PlateManifest["states"], rects: PlateManifest["rects"]) => {
      plates[id] = { id, url: ORIGIN + pathname, title: await page.title(), capturedAt: new Date().toISOString(), text: await textOf(), w, h, states, rects };
    };

    // ---- tools index: kept as evidence for what the calculators are described as (not shown in the video) ---------------
    {
      await open("/tools");
      await finish("tools", "/tools", VIEW.w, VIEW.h, { s0: { file: await shot("tools.jpg"), label: "Calculators index" } }, {});
    }

    // ---- prorated rent calculator: real typing, live result ------------------------------------------------------
    {
      await open("/tools/prorated-rent");
      const rent = page.getByRole("textbox").nth(0);
      const startDay = page.getByRole("textbox").nth(3);
      const result = () => page.getByText(/Prorated rent:/).first().locator("xpath=..").innerText().catch(() => "");
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("prorate-s0.jpg"), label: "Calculator as it loads", result: await result() };
      await rent.click({ clickCount: 3 });
      let typed = "";
      for (const ch of "2150") {
        await page.keyboard.type(ch);
        typed += ch;
        states[`t${typed}`] = { file: await shot(`prorate-t${typed}.jpg`), label: `Monthly rent typed: ${typed}`, result: await result() };
      }
      await startDay.fill("20");
      states.d20 = { file: await shot("prorate-d20.jpg"), label: "Occupancy start day changed to 20", result: await result() };
      // The page may have scrolled when an input took focus; the plate is the top of the page, so measure from a known scroll position.
      await page.evaluate(() => window.scrollTo(0, 0));
      const rects: PlateManifest["rects"] = {
        rent: await boxOf(page, "input", 0),
        startDay: await boxOf(page, "input", 3),
        result: union(await rectByText(page, "Prorated rent:"), await rectByText(page, "Daily rate", { maxExtra: 140 })),
        title: await rectByText(page, "Prorated rent calculator"),
      };
      await finish("prorate", "/tools/prorated-rent", VIEW.w, VIEW.h, states, rects);
    }

    // ---- rent increase calculator -----------------------------------------------------------------------------
    {
      await open("/tools/rent-increase");
      const rentIn = page.getByRole("textbox").nth(0);
      const pctIn = page.getByRole("textbox").nth(1);
      const result = () => page.getByText(/New rent:/).first().locator("xpath=..").innerText().catch(() => "");
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("rentinc-s0.jpg"), label: "Calculator as it loads", result: await result() };
      await pctIn.fill("8");
      states.p8 = { file: await shot("rentinc-p8.jpg"), label: "Percent increase changed to 8", result: await result() };
      await rentIn.fill("1850");
      states.r1850 = { file: await shot("rentinc-r1850.jpg"), label: "Current rent changed to 1850", result: await result() };
      await page.evaluate(() => window.scrollTo(0, 0));
      const rects: PlateManifest["rects"] = {
        rent: await boxOf(page, "input", 0),
        pct: await boxOf(page, "input", 1),
        result: union(await rectByText(page, "New rent:"), await rectByText(page, "Change:")),
        title: await rectByText(page, "Rent increase calculator"),
      };
      await finish("rentinc", "/tools/rent-increase", VIEW.w, VIEW.h, states, rects);
    }

    // ---- landlord page: one record per rental (tall plate, panned) ---------------------------------------------
    {
      await open("/manage");
      const y0 = (await rectByText(page, "One rental record connects everything"))[1] - 90;
      const last = await rectByText(page, "Income, expenses, summaries", { card: true });
      const y1 = last[1] + last[3] + 60;
      const rect = async (t: string, card = true) => rectByText(page, t, { card, offsetY: y0 });
      const rects: PlateManifest["rects"] = {
        heading: await rect("One rental record connects everything", false),
        property: await rect("Address, type, and status"),
        tenant: await rect("Who lives there"),
        lease: await rect("Build, upload, sign electronically"),
        rent: await rect("Track payments manually"),
        maintenance: await rect("Requests, status, photos"),
        inspections: await rect("Move-in/out condition"),
        documents: await rect("Leases, reports, and receipts"),
        finances: await rect("Income, expenses, summaries"),
      };
      const h = Math.round(y1 - y0);
      await finish("manage", "/manage", VIEW.w, h, { s0: { file: await shot("manage.jpg", { y: Math.round(y0), h }), label: "Landlord page, one rental record" } }, rects);
    }

    // ---- pricing: the Free plan card -----------------------------------------------------------------------------
    {
      await open("/pricing");
      const card = await rectByText(page, "Everything you need to start", { card: true });
      const y0 = card[1] - 70;
      const h = Math.round(card[3] + 140);
      const rect = async (t: string, c = false) => rectByText(page, t, { card: c, offsetY: y0 });
      const rects: PlateManifest["rects"] = {
        card: [card[0], round(card[1] - y0), card[2], card[3]],
        price: await rect("$0"),
        property: await rect("1 active listing"),
        esign: await rect("Lease upload, storage, and electronic signing"),
        maintenance: await rect("Maintenance, inspections, and documents"),
        tenants: await rect("Add existing tenants"),
      };
      // "1 property" appears twice (summary line and checklist); the first checklist entry is the one shown.
      rects.property = await rect("1 property");
      await finish("pricing", "/pricing", VIEW.w, h, { s0: { file: await shot("pricing.jpg", { y: Math.round(y0), h }), label: "Free plan card" } }, rects);
    }

    // ---- tenant page: the free tenant portal ---------------------------------------------------------------------
    {
      await open("/tenant");
      const heading = await rectByText(page, "What you can do in the tenant portal");
      const free = await rectByText(page, "Yes. Tenant portal access is always free.", { card: true });
      const y0 = heading[1] - 80;
      const y1 = free[1] + free[3] + 60;
      const h = Math.round(y1 - y0);
      const rect = async (t: string, c = true) => rectByText(page, t, { card: c, offsetY: y0 });
      const rects: PlateManifest["rects"] = {
        heading: await rect("What you can do in the tenant portal", false),
        lease: await rect("View your lease"),
        rent: await rect("Rent due dates & history"),
        pay: await rect("Pay by ACH when enabled"),
        maintenance: await rect("Submit maintenance requests"),
        message: await rect("Message your landlord"),
        free: await rect("Yes. Tenant portal access is always free."),
      };
      await finish("tenant", "/tenant", VIEW.w, h, { s0: { file: await shot("tenant.jpg", { y: Math.round(y0), h }), label: "Tenant portal page" } }, rects);
    }
    await ctx.close();
  } finally {
    await handle.close();
  }
  const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
