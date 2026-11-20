/** Homepage flagship explainer. Run: node scripts/website-video/flagship.mjs [--no-capture] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assemble, capture, poster, writeVtt } from "./engine.mjs";
import { endPage, problemPage, studioPage } from "./pages.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const name = "flagship";
const lines = JSON.parse(fs.readFileSync(path.join(here, "scripts", `${name}.lines.json`), "utf8"));
const outDir = path.join(here, "out", name);
const audioDir = path.join(here, "audio", name);
fs.mkdirSync(outDir, { recursive: true });

/** the smallest block that holds a heading and some of its own text: one card of a page */
const rx = (t) => new RegExp("^\\s*" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
const card = (page, title, snippet) => {
  let l = page.locator("div").filter({ has: page.getByText(rx(title)) });
  if (snippet) l = l.filter({ hasText: snippet });
  return l.last();
};
const text = (page, t, o = {}) => (o.exact === false ? page.getByText(t) : page.getByText(rx(t))).first();

const beats = [
  {
    id: "hook",
    pre: async (h) => h.go("/", { first: true }),
    run: async (h) => {
      const { page } = h;
      await h.move(text(page, "Local SEO that does the work for you.").or(page.locator("h1").first()), { ms: 700, dy: 20 });
      await h.click(page.getByRole("link", { name: /Scan my business free/ }).first(), { ms: 900 }).catch(() => {});
    },
  },
  {
    id: "problem",
    run: async (h) => {
      await h.go("/__v/problem");
      await h.sleep(600);
    },
  },
  {
    id: "scan",
    run: async (h) => {
      const { page } = h;
      await h.go("/scan");
      await h.click(text(page, "Website / online business"), { ms: 700 });
      await h.type(page.getByPlaceholder("e.g. gravyblock.com"), "boatingchicago.com", { cps: 12 });
    },
  },
  {
    id: "scanres",
    run: async (h) => {
      const { page } = h;
      await h.type(page.getByPlaceholder("e.g. Acme Marketing Co."), "Boating Chicago", { cps: 14 });
      const btn = page.getByRole("button", { name: "Get free score preview" });
      await h.reveal(btn, { ms: 600, top: 520 });
      await h.click(btn, { ms: 700 });
      await page.waitForURL(/\/report\//, { timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await h.sleep(500);
      await h.spot(card(page, "Overall readiness score"), "Your visibility score", { where: "left" });
      await h.sleep(1000);
      await h.unspot();
      await h.reveal(text(page, "What we found"), { ms: 700, top: 120 });
      await h.spot(page.locator("text=WE FOUND").first().locator("xpath=ancestor::div[2]"), "What is holding you back", { where: "below" }).catch(() => {});
    },
  },
  {
    id: "truth",
    run: async (h) => {
      const { page } = h;
      await h.go("/how-it-works");
      const step = card(page, "It learns your business", "real website");
      await h.reveal(step, { ms: 1000, top: 300 });
      await h.move(step, { ms: 700 });
      await h.spot(step, "A record of verified facts", { where: "below" });
      await h.sleep(3000);
      await h.unspot();
      const claim = text(page, "If your website does not say something, GravyBlock does not claim it.", { exact: false });
      await h.move(claim, { ms: 600 }).catch(() => {});
      await h.spot(claim, "It never claims more than your site says", { pad: 10, where: "below" }).catch(() => {});
    },
  },
  {
    id: "opps",
    run: async (h) => {
      const { page } = h;
      await h.unspot();
      const a = card(page, "It finds growth opportunities", "places local customers");
      await h.reveal(a, { ms: 900, top: 260 });
      await h.move(a, { ms: 600 });
      await h.spot(a, "Opportunities across the web", { where: "below" });
      await h.sleep(2500);
      await h.unspot();
      const b = card(page, "It decides what is worth doing", "ranks the opportunities");
      await h.reveal(b, { ms: 900, top: 260 });
      await h.move(b, { ms: 600 });
      await h.spot(b, "Ranked for your business", { where: "below" });
    },
  },
  {
    id: "exec",
    run: async (h) => {
      const { page } = h;
      await h.unspot();
      await h.go("/features");
      const items = [
        ["Website articles and service pages", "Publishes to your site"],
        ["Google Business Profile posts", "Posts to Google"],
        ["Review replies", "Replies to reviews"],
        ["Authority / link outreach", "Pitches local sites for links"],
      ];
      for (const [t, label] of items) {
        const el = text(page, t);
        await h.reveal(el, { ms: 600, top: 300 });
        await h.move(el, { ms: 380 });
        await h.spot(el, label, { pad: 16, where: "below" });
        await h.sleep(650);
        await h.unspot();
      }
    },
  },
  {
    id: "proof",
    run: async (h) => {
      const { page } = h;
      await h.go("/proof");
      const l1 = card(page, "Level 1: Verified action", "Work confirmed");
      await h.reveal(l1, { ms: 800, top: 380 });
      await h.move(l1, { ms: 600 });
      await h.spot(l1, "Only verified work counts", { where: "below" });
      await h.sleep(2000);
      const l2 = card(page, "Level 2: Search or visibility result", "None recorded yet");
      await h.move(l2, { ms: 600 });
      await h.spot(l2, "Not measured yet: shown as zero", { where: "below" });
      await h.sleep(1100);
      await h.unspot();
    },
  },
  {
    id: "studio",
    run: async (h) => {
      const { page } = h;
      await h.go("/__v/studio");
      await h.sleep(3300);
      await h.go("/marketing-studio");
      const rev = card(page, "You review every video first", "emailed to you");
      await h.reveal(rev, { ms: 800, top: 300 });
      await h.move(rev, { ms: 600 });
      await h.spot(rev, "You approve before it goes public", { where: "below" });
    },
  },
  {
    id: "owner",
    run: async (h) => {
      const { page } = h;
      await h.unspot();
      await h.go("/how-it-works");
      const needs = card(page, "Needs you", "one-time connection");
      await h.reveal(needs, { ms: 1000, top: 380 });
      await h.move(needs, { ms: 700 });
      await h.spot(needs, "Only when it truly needs you", { where: "below" });
    },
  },
  {
    id: "cta",
    run: async (h) => {
      const { page } = h;
      await h.unspot();
      await h.go("/pricing");
      await h.reveal(page.getByText("Monthly", { exact: true }).first(), { ms: 800, top: 300 });
      const m = card(page, "Monthly", "Stop at any time");
      const y = card(page, "Annual", "paid once a year");
      await h.move(m, { ms: 600 });
      await h.spot(m, "14-day free trial", { where: "below" });
      await h.sleep(1200);
      await h.move(y, { ms: 600 });
      await h.spot(y, "Or $299 a year", { where: "below" });
      await h.sleep(1200);
      await h.unspot();
      await h.go("/__v/end");
      await h.sleep(1500);
    },
  },
];

const only = process.env.WV_ONLY?.split(",");
const run = only ? beats.filter((b) => only.includes(b.id)) : beats;
if (only) run[0].pre = async (h) => h.go("/", { first: true });
const routes = { "/__v/problem": problemPage(), "/__v/studio": studioPage(), "/__v/end": endPage() };
const files = { "/__v/studio.mp4": { type: "video/mp4", path: path.join(here, "assets", "studio-inset.mp4") } };

if (!process.argv.includes("--no-capture")) {
  const r = await capture({ name, beats: run, lines, outDir, audioDir, routes, files });
  console.log("captured", r.total.toFixed(1) + "s", r.frames, "frames");
}
const musicWav = path.join(here, "audio", "music.wav");
const final = path.join(outDir, `${name}.mp4`);
const a = assemble({ name, outDir, audioDir, musicWav, final });
console.log("assembled", a);
writeVtt({ lines, outDir, file: path.join(outDir, `${name}.vtt`) });
poster(final, 3, path.join(outDir, `${name}.jpg`));
