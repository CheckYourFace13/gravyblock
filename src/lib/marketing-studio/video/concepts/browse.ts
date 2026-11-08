/**
 * Shared, read-only browsing of a live product page for discovery and capture: a phone-sized context that only ever sends GET requests, refuses analytics,
 * never signs in and never submits anything. The page is tagged with data attributes so the same controls are found again on every load.
 */
import type { BrowserContext, Page } from "playwright-core";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, VIEW } from "../demo/plates";

/** Labels that are never clicked: accounts, money, messages, deletion, consent and site chrome. */
export const UNSAFE_LABEL = /log ?in|sign ?(in|up|out)|register|buy|checkout|cart|delete|remove|pay\b|submit|subscribe|send|book\b|reserve|order|download|install|account|cookie|accept|decline|reject|close|dismiss|menu|navigation|search|share|copy|print|upload|post\b|comment|donate|join|create/i;

/** Runs in the page. Tags every safe, visible control with data-gbc and every group of controls with data-gbg. Returns the groups. */
export const TAG_SCRIPT = `(() => {
  const UNSAFE = new RegExp(${JSON.stringify(UNSAFE_LABEL.source)}, "i");
  document.querySelectorAll("[data-gbc],[data-gbg]").forEach((e) => { e.removeAttribute("data-gbc"); e.removeAttribute("data-gbg"); });
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width >= 24 && r.height >= 20 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const label = (e) => ((e.innerText || e.textContent || e.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim());
  let list = [...document.querySelectorAll("button, [role=tab], [role=switch], summary, [aria-expanded], [aria-pressed], [role=button]")].filter((e) => {
    if (e.closest("nav, header, footer, [role=navigation], [role=dialog], [aria-modal=true]")) return false;
    if (e.matches("[type=submit], [disabled], [aria-disabled=true], a[href]") || e.closest("a[href]")) return false;
    const f = e.closest("form");
    if (f && (f.method || "get").toLowerCase() === "post") return false;
    const n = label(e);
    return n.length >= 1 && n.length <= 48 && !UNSAFE.test(n) && vis(e);
  });
  list = list.filter((e) => !list.some((o) => o !== e && e.contains(o)));
  list.forEach((e, i) => e.setAttribute("data-gbc", String(i)));
  const groups = new Map();
  list.forEach((e, i) => {
    let a = e.parentElement, hit = null;
    for (let d = 0; a && d < 5; d++, a = a.parentElement) { if (list.filter((o) => a.contains(o)).length >= 2) { hit = a; break; } }
    if (!hit) return;
    const key = hit.getAttribute("data-gbg") ?? String(groups.size);
    hit.setAttribute("data-gbg", key);
    if (!groups.has(key)) groups.set(key, { id: key, heading: "", controls: [], el: hit });
    groups.get(key).controls.push({ index: i, name: label(e) });
  });
  const heads = [...document.querySelectorAll("h1, h2, h3, h4")].filter(vis);
  const out = [];
  for (const g of groups.values()) {
    if (g.controls.length < 2 || g.controls.length > 12) continue;
    const first = list[g.controls[0].index];
    let h = "";
    for (const x of heads) { if (x.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) h = (x.innerText || "").replace(/\\s+/g, " ").trim(); }
    out.push({ id: g.id, heading: h.slice(0, 80), controls: g.controls });
  }
  return out;
})()`;

export type Browsed = { page: Page; ctx: BrowserContext; blocked: { count: number }; close: () => Promise<void> };

/** A phone-sized, GET-only context. The caller closes it. */
export async function openBrowsed(origin: string): Promise<Browsed> {
  const handle = await launchBrowser();
  const host = new URL(origin).hostname;
  const ctx = await handle.browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: VIEW.dpr, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, serviceWorkers: "block" });
  const blocked = { count: 0 };
  await ctx.route("**/*", (route) => {
    const req = route.request();
    let h = "";
    try {
      h = new URL(req.url()).hostname;
    } catch {
      /* ignore */
    }
    if (req.method() !== "GET") {
      blocked.count++;
      return route.abort();
    }
    if (h !== host || /plausible|analytics|gtag|googletagmanager|posthog|clarity|hotjar/i.test(req.url())) return route.abort();
    return route.continue();
  });
  // the TypeScript runner wraps named functions in a helper the page does not have
  await ctx.addInitScript("window.__name = function (f) { return f; };");
  const page = await ctx.newPage();
  return { page, ctx, blocked, close: () => handle.close() };
}

/** Loads a page, waits for fonts, freezes animation and scrolls through it once so lazy content is present. */
export async function openPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.addStyleTag({ content: "*{animation:none !important;transition:none !important;scroll-behavior:auto !important}" });
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

export type TaggedGroup = { id: string; heading: string; controls: Array<{ index: number; name: string }> };
export const tagControls = (page: Page): Promise<TaggedGroup[]> => page.evaluate(TAG_SCRIPT) as Promise<TaggedGroup[]>;
