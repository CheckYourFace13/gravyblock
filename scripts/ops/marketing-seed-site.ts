// Creates current, verified Product Truth for a House site straight from the LIVE site. Nothing is typed in by hand: a headless browser (GET only, no forms
// submitted, no sign-in) reads the site's public pages and every fact is a verbatim piece of what the page itself shows (headings, paragraphs, button
// labels and their addresses, plan prices, navigation). Facts are stored as verified because each one was read from the live page at this moment, and
// re-checked against the page text again at render time. The product, a logo and a brand colour are created too. Read-only toward the site. Idempotent.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-seed-site.ts <slug|all>
import sharp from "sharp";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
import { fetchPublicImage } from "../../src/lib/marketing-studio/remote-import";
import { addClaim, addFact, approveAsset, createProduct, listAssets, listFacts, listProducts, saveBrandProfile, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { storeImageAsset } from "../../src/lib/marketing-studio/uploads";

const ACTOR = "portfolio-seed (live site read, owner directive 2026-11-08)";
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

type Site = { slug: string; name: string; kind: "website" | "saas"; home: string; pages: string[]; prohibited: string[] };
const SITES: Site[] = [
  { slug: "micstage", name: "MicStage", kind: "website", home: "https://micstage.com/", pages: ["/", "/find-open-mics", "/map", "/locations", "/host"], prohibited: ["guaranteed stage time", "best open mic", "number one"] },
  { slug: "leaguepour", name: "LeaguePour", kind: "saas", home: "https://leaguepour.com/", pages: ["/", "/demo", "/find"], prohibited: ["gambling", "guaranteed attendance", "number one"] },
  { slug: "outbreakthreat", name: "OutbreakThreat", kind: "website", home: "https://outbreakthreat.com/", pages: ["/", "/map"], prohibited: ["government agency", "medical advice", "diagnoses", "predicts outbreaks"] },
  { slug: "gravyblock", name: "GravyBlock", kind: "saas", home: "https://gravyblock.com/", pages: ["/", "/scan", "/proof", "/examples/sample-local-growth-report"], prohibited: ["guaranteed rankings", "number one on google", "instant results", "official google partner"] },
  { slug: "boatingchicago", name: "BoatingChicago", kind: "website", home: "https://boatingchicago.com/", pages: ["/", "/weather", "/marinas", "/boat-launches", "/storage"], prohibited: ["safety guarantee", "operates boats", "guaranteed availability", "weather forecast guarantee"] },
  { slug: "venuesprocket", name: "VenueSprocket", kind: "saas", home: "https://venuesprocket.com/", pages: ["/", "/demo", "/tools", "/templates"], prohibited: ["guaranteed bookings", "number one"] },
  { slug: "seestew", name: "SeeStew", kind: "website", home: "https://seestew.com/", pages: ["/", "/articles"], prohibited: ["fiction", "fake stories", "number one"] },
  { slug: "iscreamstudio", name: "iScream Studio", kind: "website", home: "https://iscreamstudio.com/", pages: ["/"], prohibited: ["guaranteed rankings", "number one"] },
];

type Fact = { key: string; value: string; url: string };

async function main() {
  const which = process.argv[2];
  if (!which) throw new Error("usage: marketing-seed-site.ts <slug|all>");
  const sites = which === "all" ? SITES : SITES.filter((s) => s.slug === which);
  if (!sites.length) throw new Error(`unknown site ${which}`);
  const db = requireStudioDb();
  const handle = await launchBrowser();
  const summary: string[] = [];
  try {
    for (const site of sites) {
      const host = new URL(site.home).host.replace(/^www\./, "");
      const ctx = await handle.browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "GravyBlockStudioProductTruth" });
      await ctx.route("**/*", (route) => (route.request().method() === "GET" ? route.continue() : route.abort()));
      // the TypeScript runner wraps named functions in a helper the page does not have
      await ctx.addInitScript("window.__name = function (f) { return f; };");
      const page = await ctx.newPage();
      const facts: Fact[] = [];
      let meta: { title: string; description: string; theme: string; icons: string[] } | null = null;
      for (const p of site.pages) {
        const url = new URL(p, site.home).toString();
        const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => null);
        if (!res || res.status() >= 400) {
          console.log(`  ${site.slug}${p}: skipped (${res?.status() ?? "no response"})`);
          continue;
        }
        const got = await page.evaluate((hostName) => {
          const text = (e: Element) => (e as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ?? "";
          const visible = (e: Element) => {
            const r = (e as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const out: Array<{ key: string; value: string }> = [];
          const h1 = document.querySelector("h1");
          if (h1 && text(h1).length >= 8) out.push({ key: "headline", value: text(h1) });
          for (const h of [...document.querySelectorAll("h2, h3")].filter(visible).slice(0, 40)) {
            const t = text(h);
            if (t.length >= 6 && t.length <= 110) out.push({ key: "section", value: t });
          }
          for (const el of [...document.querySelectorAll("main p, p")].filter(visible).slice(0, 80)) {
            const t = text(el);
            if (t.length >= 40 && t.length <= 260 && !/cookie|privacy policy|all rights reserved/i.test(t)) out.push({ key: "capability", value: t });
          }
          for (const li of [...document.querySelectorAll("main li, li")].filter(visible).slice(0, 60)) {
            const t = text(li);
            if (t.length >= 25 && t.length <= 200 && !li.querySelector("a[href]")) out.push({ key: "capability", value: t });
          }
          const seenCta = new Set<string>();
          for (const a of [...document.querySelectorAll("main a[href], a.btn, a[class*=button], button")].filter(visible)) {
            const t = text(a);
            const href = (a as HTMLAnchorElement).href;
            if (t.length < 3 || t.length > 45 || !href || seenCta.has(t)) continue;
            try {
              const u = new URL(href);
              if (u.host.replace(/^www\./, "") !== hostName || u.hash || /login|log in|sign in|privacy|terms|cookie/i.test(t + u.pathname)) continue;
              seenCta.add(t);
              out.push({ key: "cta", value: t });
              out.push({ key: "cta_url", value: u.toString() });
            } catch {
              /* ignore */
            }
            if (seenCta.size >= 6) break;
          }
          for (const el of [...document.querySelectorAll("h3, h4, p, span, div")].filter(visible)) {
            const t = text(el);
            if (t.length <= 80 && /\$\s?\d/.test(t) && el.children.length <= 3) out.push({ key: "plan", value: t });
          }
          const md = (n: string) => document.querySelector(`meta[name="${n}"]`)?.getAttribute("content") ?? "";
          const icons = [...document.querySelectorAll("link[rel~=icon], link[rel=apple-touch-icon]")].map((l) => (l as HTMLLinkElement).href);
          const og = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
          if (og) icons.push(new URL(og, location.href).toString());
          return { facts: out, title: document.title, description: md("description"), theme: md("theme-color"), icons };
        }, host);
        if (!meta) meta = { title: got.title, description: got.description, theme: got.theme, icons: got.icons };
        for (const f of got.facts) facts.push({ ...f, url });
        const pageText = await page.evaluate(() => document.body.innerText);
        if (p === "/") facts.push({ key: "page_title", value: got.title, url });
        void pageText;
      }
      await ctx.close();
      if (meta?.description) facts.unshift({ key: "description", value: meta.description.trim(), url: site.home });
      facts.unshift({ key: "website_url", value: site.home, url: site.home }, { key: "product_name", value: site.name, url: site.home });

      const existing = await listProducts(INTERNAL_SCOPE, db);
      let product = existing.find((p) => p.slug === site.slug);
      if (!product) product = await createProduct(INTERNAL_SCOPE, ACTOR, { name: site.name, kind: site.kind, slug: site.slug, publicUrl: site.home, ownerKind: "house" }, db);
      const have = new Set((await listFacts(INTERNAL_SCOPE, product.id, db)).map((f) => norm(f.factValue)));
      let added = 0;
      for (const f of facts) {
        const n = norm(f.value);
        if (!n || have.has(n)) continue;
        have.add(n);
        if (added >= 90) break;
        const row = await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: f.key, factValue: f.value.slice(0, 500), sourceKind: "public_page", sourceUrl: f.url }, db);
        if (!row.verifiedAt) await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, row.id, db);
        added++;
      }
      for (const text of site.prohibited) await addClaim(INTERNAL_SCOPE, ACTOR, product.id, { kind: "prohibited", text, rationale: "Not stated by the product, or contradicted by its own page" }, db).catch(() => {});

      // logo: the best icon the site itself publishes, rasterised to a 512 px PNG (an SVG is never uploaded as is)
      const assets = await listAssets(INTERNAL_SCOPE, product.id, db);
      let logoNote = "logo already present";
      if (!assets.some((a) => a.kind === "logo")) {
        logoNote = "no usable logo found";
        const candidates = (meta?.icons ?? []).sort((a, b) => Number(/apple-touch|png/i.test(b)) - Number(/apple-touch|png/i.test(a)));
        for (const src of candidates) {
          try {
            const fetched = await fetchPublicImage(src);
            const png = await sharp(fetched.bytes, { density: 384 }).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
            const a = await storeImageAsset(INTERNAL_SCOPE, ACTOR, product.id, { bytes: png, originalName: `${site.slug}-logo.png`, kind: "logo", provenance: "public_fetch", sourceUrl: src }, db);
            await approveAsset(INTERNAL_SCOPE, ACTOR, product.id, a.id, "Public icon from the product's own site, used under the owner's portfolio directive.", db);
            logoNote = `logo from ${src}`;
            break;
          } catch {
            /* try the next candidate */
          }
        }
      }
      if (meta?.theme && /^#[0-9a-f]{3,8}$/i.test(meta.theme)) await saveBrandProfile(INTERNAL_SCOPE, ACTOR, product.id, { colors: { primary: meta.theme } }, db);
      const total = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt).length;
      summary.push(`${site.name}: ${added} new verified facts (${total} total), ${logoNote}`);
      console.log(summary[summary.length - 1]);
    }
  } finally {
    await handle.close();
  }
  console.log("\n" + summary.join("\n"));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
