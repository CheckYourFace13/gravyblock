/**
 * Real states of the SendFable public site for the second SendFable video (email, text or both, and what text costs). GET only, nothing submitted, no
 * sign-in, analytics refused. Interactions are the page's own controls: the Monthly/Annual billing switch and the pricing questions (an accordion).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, rectByText, round, union, VIEW } from "./plates";
import type { Manifest, PlateManifest, Rect } from "./types";

const ORIGIN = "https://sendfable.com";

export async function captureSendFableChannelsPlates(outDir: string, logoFile: string): Promise<Manifest> {
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
      if (req.method() !== "GET" || host !== "sendfable.com" || /plausible|analytics|gtag|googletagmanager|posthog|clarity|hotjar/i.test(req.url())) return route.abort();
      return route.continue();
    });
    const page = await ctx.newPage();
    const open = async (p: string) => {
      await page.goto(ORIGIN + p, { waitUntil: "networkidle", timeout: 60_000 });
      await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
      await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important}" });
      const total = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < total; y += 500) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(100);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
    };
    const shot = async (file: string, clip: { y: number; h: number }) => {
      const buf = await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: clip.y, width: VIEW.w, height: clip.h } });
      await writeFile(path.join(outDir, file), buf);
      return file;
    };
    const bb = async (loc: ReturnType<Page["locator"]>): Promise<Rect> => {
      const b = await loc.first().boundingBox();
      if (!b) throw new Error("capture: element not found");
      const sy = await page.evaluate(() => window.scrollY);
      return [round(b.x), round(b.y + sy), round(b.width), round(b.height)];
    };
    const plate = async (id: string, pathname: string, h: number, states: PlateManifest["states"], rects: PlateManifest["rects"]) => {
      const text = await page.evaluate(() => document.body.innerText);
      const seen = Object.values(states).map((x) => x.result ?? "").join(" ");
      plates[id] = { id, url: ORIGIN + pathname, title: await page.title(), capturedAt: new Date().toISOString(), text: `${text} ${seen}`, w: VIEW.w, h, states, rects };
    };
    const off = (y0: number) => (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
    const bottom = (r: Rect) => r[1] + r[3];

    // ---- home: the three channels ----------------------------------------------------------------------------------------------
    await open("/");
    {
      const head = await rectByText(page, "Pick Email, Text, or Both", { maxExtra: 3 });
      const email = await rectByText(page, "Newsletters, offers, and updates with Send Confidence", { maxExtra: 120, card: true });
      const text = await rectByText(page, "Short messages with STOP/HELP built in", { maxExtra: 120, card: true });
      const both = await rectByText(page, "One audience, one campaign: email and text together", { maxExtra: 120, card: true });
      const y0 = Math.max(0, Math.round(head[1] - 50));
      const h = Math.round(bottom(both) + 50 - y0);
      const o = off(y0);
      await plate("channels", "/", h, { s0: { file: await shot("channels.jpg", { y: y0, h }), label: "Pick Email, Text, or Both" } }, { head: o(head), email: o(email), text: o(text), both: o(both) });
    }

    // ---- pricing: the Monthly / Annual switch ---------------------------------------------------------------------------------
    await open("/pricing");
    {
      const head = await rectByText(page, "Pricing that stays readable", { maxExtra: 3 });
      const monthly = page.getByRole("button", { name: "Monthly", exact: true });
      const annual = page.getByRole("button", { name: "Annual", exact: true });
      const toggles = union(await bb(monthly), await bb(annual));
      const free = await rectByText(page, "Up to 1,000 emails/month", { maxExtra: 60, card: true });
      await annual.click();
      await page.waitForTimeout(400);
      const banner = await rectByText(page, "Two months free with annual billing.", { maxExtra: 10 });
      const starter = await rectByText(page, "billed yearly", { maxExtra: 60, card: true });
      const y0 = Math.max(0, Math.round(head[1] - 60));
      const h = Math.round(Math.max(bottom(starter), bottom(free)) + 60 - y0);
      await monthly.click();
      await page.waitForTimeout(400);
      const o = off(y0);
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("billing-s0.jpg", { y: y0, h }), label: "Pricing, Monthly" };
      await annual.click();
      await page.waitForTimeout(400);
      states.annual = { file: await shot("billing-annual.jpg", { y: y0, h }), label: "Pricing, Annual", result: (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 900) };
      await monthly.click();
      await page.waitForTimeout(400);
      states.back = { file: await shot("billing-back.jpg", { y: y0, h }), label: "Pricing, back to Monthly" };
      await plate("billing", "/pricing", h, states, { head: o(head), toggles: o(toggles), annual: o(await bb(annual)), banner: o(banner), card: o(union(banner, starter)), starter: o(starter) });
    }

    // ---- pricing: the text messaging plans -------------------------------------------------------------------------------------
    {
      const head = await rectByText(page, "Text messaging plans", { maxExtra: 3 });
      const entry = await rectByText(page, "Text Entry", { maxExtra: 260, card: true });
      const price = await rectByText(page, "$19.99/month", { maxExtra: 10 });
      const y0 = Math.max(0, Math.round(head[1] - 40));
      const h = Math.round(bottom(entry) + 60 - y0);
      const o = off(y0);
      await plate("textplans", "/pricing", h, { s0: { file: await shot("textplans.jpg", { y: y0, h }), label: "Text messaging plans" } }, { head: o(head), entry: o(entry), price: o(price) });
    }

    // ---- pricing questions: the page's own accordion -----------------------------------------------------------------------------
    {
      const head = await rectByText(page, "Pricing questions", { maxExtra: 3 });
      const smsQ = page.getByRole("button", { name: "How does SMS pricing work?" });
      const cancelQ = page.getByRole("button", { name: "Can I cancel anytime?" });
      const smsRect = await bb(smsQ);
      const cancelRect0 = await bb(cancelQ);
      await smsQ.click();
      await page.waitForTimeout(400);
      const answer = await rectByText(page, "Text messaging is a separate paid add-on.", { maxExtra: 260 });
      const cancelRect1 = await bb(cancelQ);
      const y0 = Math.max(0, Math.round(head[1] - 30));
      const h = Math.round(cancelRect1[1] + cancelRect1[3] + 140 - y0);
      await smsQ.click();
      await page.waitForTimeout(400);
      const o = off(y0);
      const section = () => page.locator("main section").filter({ hasText: "Pricing questions" }).last().innerText().then((t) => t.replace(/\s+/g, " "));
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("faq-s0.jpg", { y: y0, h }), label: "Pricing questions, all closed" };
      await smsQ.click();
      await page.waitForTimeout(400);
      states.sms = { file: await shot("faq-sms.jpg", { y: y0, h }), label: "How does SMS pricing work? open", result: await section() };
      await cancelQ.click();
      await page.waitForTimeout(400);
      states.cancel = { file: await shot("faq-cancel.jpg", { y: y0, h }), label: "Can I cancel anytime? open", result: await section() };
      await plate("faq", "/pricing", h, states, { head: o(head), smsQ: o(smsRect), answer: o(answer), cancelQ: o(cancelRect1), cancelClosed: o(cancelRect0) });
    }
    await ctx.close();
  } finally {
    await handle.close();
  }
  const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
