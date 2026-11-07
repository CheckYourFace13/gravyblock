/**
 * Captures REAL states of the SendFable public marketing page at phone width. Read-only: GET requests to sendfable.com only (analytics hosts and
 * every non-GET request are refused, so the capture is not a visitor and nothing is submitted). The only interaction is clicking the page's own
 * goal chips, which swap the suggestion shown in the browser. No account is created and nobody signs in.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, rectByText, round, union, VIEW } from "./plates";
import type { Manifest, PlateManifest, Rect } from "./types";

export const SF_ORIGIN = "https://sendfable.com";

export async function captureSendFablePlates(outDir: string, logoFile: string): Promise<Manifest> {
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
    await page.goto(SF_ORIGIN + "/", { waitUntil: "networkidle", timeout: 60_000 });
    await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important}" });
    // Walk the page once so every scroll-triggered section is on screen and rendered, then come back to the top.
    const total = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < total; y += 500) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const text = await page.evaluate(() => document.body.innerText);
    const shot = async (file: string, clip: { y: number; h: number }) => {
      const buf = await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: clip.y, width: VIEW.w, height: clip.h } });
      await writeFile(path.join(outDir, file), buf);
      return file;
    };
    const plate = async (id: string, h: number, states: PlateManifest["states"], rects: PlateManifest["rects"]) => {
      plates[id] = { id, url: SF_ORIGIN + "/", title: await page.title(), capturedAt: new Date().toISOString(), text, w: VIEW.w, h, states, rects };
    };
    const chip = (name: string) => page.locator("main button", { hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    const bottomOf = (r: Rect) => r[1] + r[3];

    // ---- goal picker: the real chips, the suggestion changes ------------------------------------------------------------
    {
      const head = await rectByText(page, "Not sure what to write?", { maxExtra: 5 });
      const startBtn = await rectByText(page, "Start with this goal", { maxExtra: 5 });
      const y0 = Math.max(0, Math.round(head[1] - 50));
      const h = Math.round(bottomOf(startBtn) + 50 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      const states: PlateManifest["states"] = {};
      states.s0 = { file: await shot("goals-s0.jpg", { y: y0, h }), label: "Goal picker as it loads: Announce something" };
      const rects: PlateManifest["rects"] = {
        head: off(head),
        chips: off(union(await rectByText(page, "Announce something", { maxExtra: 5 }), await rectByText(page, "Welcome new subscribers", { maxExtra: 5 }))),
        chipPromo: off(await rectByText(page, "Promote a sale or event", { maxExtra: 5 })),
        chipBack: off(await rectByText(page, "Bring customers back", { maxExtra: 5 })),
      };
      const result = async () => (await page.locator("main section").filter({ hasText: "Not sure what to write?" }).first().innerText()).replace(/\s+/g, " ");
      await chip("Promote a sale or event").click();
      await page.waitForTimeout(350);
      states.g1 = { file: await shot("goals-g1.jpg", { y: y0, h }), label: "Goal chosen: Promote a sale or event", result: await result() };
      const subject1 = await rectByText(page, "This weekend only", { maxExtra: 40 });
      await chip("Bring customers back").click();
      await page.waitForTimeout(350);
      states.g2 = { file: await shot("goals-g2.jpg", { y: y0, h }), label: "Goal chosen: Bring customers back", result: await result() };
      rects.card = off(union(subject1, startBtn));
      rects.subject = off(subject1);
      await chip("Announce something").click();
      await page.waitForTimeout(200);
      await plate("goals", h, states, rects);
    }

    // ---- Scribe: the page's own three-step example (a fictional cafe, labelled as an example on the page) --------------
    {
      const head = await rectByText(page, "Your website changes.", { maxExtra: 120 });
      const choose = await rectByText(page, "Approve & schedule", { maxExtra: 40, card: true });
      const y0 = Math.max(0, Math.round(head[1] - 40));
      const h = Math.round(bottomOf(choose) + 40 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      const content = await rectByText(page, "harborandrye.example/specials", { maxExtra: 400, card: true });
      const look = await rectByText(page, "Subject: Weekend Special is here", { maxExtra: 600, card: true });
      await plate("scribe", h, { s0: { file: await shot("scribe.jpg", { y: y0, h }), label: "Scribe example: content, drafted campaign, you choose" } }, { head: off(head), content: off(content), look: off(look), choose: off(choose) });
    }

    // ---- Send Confidence: step three of the page's own "How it works" ------------------------------------------------------
    {
      const head = await rectByText(page, "Send your story", { maxExtra: 5 });
      const last = await rectByText(page, "One link looks thin", { maxExtra: 40 });
      const unsub = await rectByText(page, "Unsubscribe link present", { maxExtra: 10 });
      const score = await rectByText(page, "Ready to send", { maxExtra: 5 });
      const y0 = Math.max(0, Math.round(head[1] - 40));
      const h = Math.round(bottomOf(last) + 60 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      await plate("confidence", h, { s0: { file: await shot("confidence.jpg", { y: y0, h }), label: "Send Confidence check before sending" } }, { head: off(head), checks: off(union(score, last)), unsub: off(unsub), score: off(score) });
    }

    // ---- pricing: the Free plan ----------------------------------------------------------------------------------------
    {
      const head = await rectByText(page, "Clear pricing. Start free.", { maxExtra: 5 });
      const contacts = await rectByText(page, "Up to 500 contacts", { maxExtra: 5 });
      const emails = await rectByText(page, "Up to 1,000 emails/month", { maxExtra: 5 });
      const startBtn = await page.locator("main a", { hasText: /^\s*Start writing free\s*$/ }).first().boundingBox();
      if (!startBtn) throw new Error("capture: Free plan button not found");
      const sy = await page.evaluate(() => window.scrollY);
      const btn: Rect = [round(startBtn.x), round(startBtn.y + sy), round(startBtn.width), round(startBtn.height)];
      const y0 = Math.max(0, Math.round(head[1] - 40));
      const h = Math.round(bottomOf(btn) + 60 - y0);
      const off = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
      await plate("pricing", h, { s0: { file: await shot("pricing.jpg", { y: y0, h }), label: "Free plan" } }, { head: off(head), card: off(union(contacts, emails, btn)), contacts: off(contacts), emails: off(emails), button: off(btn) });
    }
    await ctx.close();
  } finally {
    await handle.close();
  }
  const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
