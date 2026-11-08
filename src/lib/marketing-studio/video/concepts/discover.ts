/**
 * Discovers what a product can SAFELY and REALLY demonstrate, by using it: for each public page, the in-page control groups (tabs, accordions, filter
 * chips, toggles) are clicked in turn, and what the page newly shows after each click is recorded verbatim. Nothing is submitted or signed into, a click
 * that navigates away or tries to send data is discarded, and nothing is invented: the later script can only say what a probe actually saw.
 */
import { openBrowsed, openPage, pageBlocks, tagControls, tagLinks, textIn } from "./browse";
import type { PageDiscovery, ProbedGroup, ProbedLink, ProbedSearch } from "./types";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export async function discoverProduct(origin: string, paths: string[], log: (m: string) => void = () => {}): Promise<PageDiscovery[]> {
  const b = await openBrowsed(origin);
  const out: PageDiscovery[] = [];
  try {
    const { page } = b;
    for (const path of paths.slice(0, 7)) {
      const url = new URL(path, origin).toString();
      try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (!res || res.status() >= 400) {
          log(`  ${path}: skipped (${res?.status() ?? "no response"})`);
          continue;
        }
        await openPage(page, url);
      } catch (e) {
        log(`  ${path}: ${(e as Error).message.slice(0, 80)}`);
        continue;
      }
      const lines = [...new Set((await page.evaluate(() => document.body.innerText)).split("\n").map(clean).filter((l) => l.length >= 3 && l.length <= 400))].slice(0, 220);
      const ctas = (await page.evaluate((host) => {
        const seen = new Set<string>();
        const res: Array<{ text: string; url: string }> = [];
        for (const a of [...document.querySelectorAll("main a[href], a[class*=btn], a[class*=button]")] as HTMLAnchorElement[]) {
          const r = a.getBoundingClientRect();
          const t = (a.innerText || "").replace(/\s+/g, " ").trim();
          if (r.width < 40 || r.height < 24 || t.length < 4 || t.length > 40 || seen.has(t)) continue;
          try {
            const u = new URL(a.href);
            if (u.host.replace(/^www\./, "") !== host.replace(/^www\./, "") || u.hash || /login|log in|sign in|privacy|terms|cookie/i.test(t + u.pathname)) continue;
            seen.add(t);
            res.push({ text: t, url: u.toString() });
          } catch {
            /* ignore */
          }
        }
        return res.slice(0, 10);
      }, new URL(origin).host)) as Array<{ text: string; url: string }>;

      const groups: ProbedGroup[] = [];
      const tagged = await tagControls(page);
      log(`  ${path}: ${tagged.length} control group(s), ${lines.length} lines`);
      for (const g of tagged.slice(0, 4)) {
        // a fresh load for every group, so one probe never leaves the page in a state the next one inherits
        await openPage(page, url);
        const again = (await tagControls(page)).find((x) => x.heading === g.heading && x.controls.map((c) => c.name).join("|") === g.controls.map((c) => c.name).join("|"));
        if (!again) continue;
        const ctrls = again.controls.slice(0, 6);
        const order = [...ctrls.map((c) => c.index), ctrls[0].index];
        const readGroup = () => page.evaluate((id) => {
          const el = document.querySelector(`[data-gbg="${id}"]`);
          const root = el?.parentElement ?? el ?? document.body;
          return ((root as HTMLElement).innerText || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 3);
        }, again.id);
        let prev = new Set(await readGroup());
        const sequence: ProbedGroup["sequence"] = [];
        const before = b.blocked.count;
        let ok = true;
        for (const idx of order) {
          try {
            await page.locator(`[data-gbc="${idx}"]`).first().click({ timeout: 4000 });
            await page.waitForTimeout(380);
          } catch {
            ok = false;
            break;
          }
          if (page.url() !== url) {
            ok = false;
            break;
          }
          const now = await readGroup();
          const fresh = now.filter((l) => !prev.has(l));
          sequence.push({ control: idx, newText: fresh.map(clean).join(" | ").slice(0, 480) });
          prev = new Set(now);
        }
        if (!ok || b.blocked.count > before) {
          log(`    group "${g.heading}": discarded (${ok ? "tried to send data" : "not a safe in-page control"})`);
          continue;
        }
        groups.push({ id: `${path}#${g.id}`, path, heading: g.heading, controls: ctrls, sequence });
      }
      // ---- links: really open the most promising internal links and record what the destination shows ----
      await openPage(page, url);
      const tl = await tagLinks(page);
      const links: ProbedLink[] = [];
      for (const l of tl.links.slice(0, 5)) {
        try {
          const res = await page.goto(l.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
          if (!res || res.status() >= 400) continue;
          await openPage(page, l.href);
          const blocks = await pageBlocks(page);
          const heading = blocks.find((b) => b.tag === "h1")?.t ?? "";
          const top = textIn(blocks, 0, 900).slice(0, 14);
          const lower = textIn(blocks, 700, 900).filter((t) => !top.includes(t)).slice(0, 14);
          if (top.length >= 3) links.push({ index: l.index, text: l.text, href: l.href, destTitle: await page.title(), destHeading: heading, top, lower });
        } catch {
          /* skip a destination that will not load */
        }
      }
      // ---- searches: really search (GET only) with a term the page itself shows, then open the first result ----
      await openPage(page, url);
      const tl2 = await tagLinks(page);
      const searches: ProbedSearch[] = [];
      // terms the page itself shows: short link labels and single-word items such as category chips or listed names
      const UI = /^(search|sign|menu|home|login|log|more|close|filter|filters|submit|next|back|cart|help|about|contact|pricing|price|terms|privacy|apply|reset|clear|view|show|learn|read|start|find|browse|explore|today|tonight|tomorrow)$/i;
      const terms = [...new Set([...tl2.links.map((l) => l.text), ...lines].filter((t) => /^[A-Z][a-z]{3,13}( [A-Z][a-z]{2,12})?$/.test(t) && !UI.test(t.split(" ")[0])))].slice(0, 3);
      for (const inp of tl2.inputs.slice(0, 1)) {
        for (const term of terms) {
          try {
            await openPage(page, url);
            await tagLinks(page);
            const before = await page.evaluate(() => document.body.innerText.length);
            const box = page.locator(`[data-gbs="${inp.index}"]`).first();
            await box.fill(term, { timeout: 4000 });
            const b0 = b.blocked.count;
            await Promise.all([page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {}), box.press("Enter")]);
            await page.waitForTimeout(900);
            if (b.blocked.count > b0) continue;
            const blocks = await pageBlocks(page);
            const resultLines = textIn(blocks, 0, 1100).filter((t) => t.toLowerCase() !== term.toLowerCase()).slice(0, 14);
            const after = await page.evaluate(() => document.body.innerText.length);
            if (resultLines.length < 3 || (page.url() === url && Math.abs(after - before) < 60)) continue;
            const resultUrl = page.url();
            const rl = await tagLinks(page);
            const first = rl.links.find((x) => new URL(x.href).pathname !== new URL(resultUrl).pathname);
            let result: ProbedSearch["result"];
            if (first) {
              await page.goto(first.href, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
              await openPage(page, first.href).catch(() => {});
              const db2 = await pageBlocks(page);
              const destLines = textIn(db2, 0, 900).slice(0, 14);
              if (destLines.length >= 3) result = { text: first.text, href: first.href, destLines };
            }
            searches.push({ input: inp.index, label: inp.label, term, resultUrl, resultLines, result });
            break;
          } catch {
            /* try the next term */
          }
        }
      }
      log(`    ${links.length} openable link(s), ${searches.length} working search`);
      out.push({ path, url, title: await page.title().catch(() => ""), lines, groups, links, searches, ctas, discoveredAt: new Date().toISOString() });
    }
  } finally {
    await b.close();
  }
  return out;
}
