/**
 * PRODUCT EXPLAINER / WORKFLOW VISUALIZATION (owner directive 2026-11-10). Some products, GravyBlock first, do their work out of sight, so there is no control to click. For those the video
 * shows HOW THE PRODUCT WORKS as an animated flow: a card per step that lights up in turn, in the product's own words. It is still held to the truth rules:
 *   - every card's text is a verbatim piece of Product Truth, and when it came from a public page the capture re-reads that LIVE page and refuses to render if the page no longer says it;
 *   - nothing is invented: no customer results, no dashboards that do not exist, no fake screens, metrics or actions. A step that has no verified fact behind it cannot be written;
 *   - the same ten desirability checks, the logo-integrity gate, QA and the owner's review email apply as for every other video. Only the visual mode differs.
 * An explainer is stored as an ordinary Concept (with `explainer` set), so the renderer, voice, QA, review and publishing pipeline are unchanged.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PLATE_CSS_W, type Manifest, type PlateManifest, type Rect } from "../demo/types";
import { VIEW } from "../demo/plates";
import { openBrowsed, openPage } from "./browse";
import type { Concept, PlatePlan } from "./types";

export type ExplainerNode = {
  /** small label above the step ("READS", "DOES", "PROVES") */
  step: string;
  /** what the card shows: a verbatim fragment of Product Truth */
  line: string;
  /** what the narrator says for this step; it must restate the card, not add claims */
  say: string;
  /** the public page the line was taken from; the capture checks the live page still says it. Absent only for an owner-provided fact. */
  path?: string;
  /** a fragment of the verified fact that supports it (resolved to fact ids at render time) */
  fact: string;
};
export type ExplainerScene = { heading: string; nodes: [ExplainerNode, ExplainerNode, ExplainerNode] };
export type ExplainerDef = {
  specId: string;
  slug: string;
  productName: string;
  origin: string;
  ctaHost: string;
  angle: { id: string; role: "A" | "B" | "C"; title: string; funnel: string };
  title: string;
  hook: string;
  scenes: ExplainerScene[];
  endLine: string;
  cta: { text: string; url: string; display: string };
  endHeadline: string;
  brand: { name: string; accent: string; dark: string; light: string };
  audience: string;
  problem: string;
  whyItMatters: string;
};
export type ExplainerData = { scenes: ExplainerScene[] };

const PLATE_H = 1000;
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Pure: the concept the pipeline renders. Claims ids follow the step-claim convention the alignment checks use (c-pay<scene>a / b). */
export function conceptFromExplainer(d: ExplainerDef): Concept {
  const narration: Concept["narration"] = [];
  const claims: Concept["claims"] = [];
  const onScreen: Concept["onScreen"] = [];
  const sceneMeta: Concept["sceneMeta"] = {};
  const headlines: Concept["headlines"] = {};
  const capturePlan: PlatePlan[] = [];
  const claimsUsed: Concept["claimsUsed"] = [];
  d.scenes.forEach((sc, i) => {
    const n = i + 1;
    const plate = `x${n}`;
    const sid = `a${n}`;
    const ids = [`c-open${n}`, `c-pay${n}a`, `c-pay${n}b`];
    sc.nodes.forEach((node, k) => {
      claims.push({ id: ids[k], text: node.say, facts: [node.fact], sources: [{ plate, quote: node.line }] });
      claimsUsed.push({ id: ids[k], text: node.say, quote: node.line, path: node.path ?? "/" });
    });
    narration.push({ id: `L${n}1`, sceneId: sid, spoken: i === 0 ? d.hook : sc.nodes[0].say, claims: [ids[0]] });
    narration.push({ id: `L${n}2`, sceneId: sid, spoken: `{a${n}}${sc.nodes[1].say}`, claims: [ids[1]] });
    narration.push({ id: `L${n}3`, sceneId: sid, spoken: `{b${n}}${sc.nodes[2].say}`, claims: [ids[2]] });
    headlines[sid] = sc.heading;
    onScreen.push({ sceneId: sid, kind: "headline", text: sc.heading, claim: ids[0] });
    sceneMeta[sid] = { plate, purpose: `Shows step by step how ${d.productName} works: ${sc.nodes.map((x) => x.step.toLowerCase()).join(", ")}`, motion: ["steps light up in order", "slow push-in on the active step"], note: "An animated workflow built only from verified Product Truth; nothing here is a screen of the product." };
    capturePlan.push({
      id: plate,
      path: sc.nodes[0].path ?? "/",
      groupId: `explainer#${plate}`,
      heading: sc.heading,
      prefix: [],
      controls: [],
      clicks: [
        { kind: "scroll", name: sc.nodes[1].step, payoff: sc.nodes[1].line },
        { kind: "scroll", name: sc.nodes[2].step, payoff: sc.nodes[2].line },
      ],
    });
  });
  narration.push({ id: "Lend", sceneId: "end", spoken: d.endLine, claims: [] });
  headlines.end = d.endHeadline;
  onScreen.push({ sceneId: "end", kind: "headline", text: d.endHeadline, claim: "c-cta" });
  onScreen.push({ sceneId: "end", kind: "cta", text: d.cta.text, claim: "c-cta" });
  claims.push({ id: "c-cta", text: d.cta.text, facts: [d.scenes[d.scenes.length - 1].nodes[2].fact], sources: [{ plate: `x${d.scenes.length}`, quote: d.scenes[d.scenes.length - 1].nodes[2].line }] });
  sceneMeta.end = { purpose: "Call to action", motion: ["end card"], note: "Closing card with the call to action." };
  const words = narration.reduce((n, l) => n + l.spoken.replace(/\{[^}]*\}/g, "").split(/\s+/).filter(Boolean).length, 0);
  return {
    version: 1,
    specId: d.specId,
    slug: d.slug,
    productName: d.productName,
    variant: 1,
    angle: d.angle,
    personality: "autonomous_proof",
    hookStyle: "question",
    hook: d.hook,
    audience: d.audience,
    problem: d.problem,
    payoff: d.scenes.flatMap((s) => s.nodes.map((x) => x.line)).slice(0, 4),
    whyItMatters: d.whyItMatters,
    tone: "confident and evidence-led",
    pacing: "steady, one step at a time",
    structure: "problem question, then the steps in order, then the proof, then the call to action",
    cta: d.cta,
    capturePlan,
    claimsUsed,
    title: d.title,
    narration,
    claims,
    facts: [],
    onScreen,
    sceneMeta,
    headlines,
    brand: d.brand,
    origin: d.origin,
    ctaHost: d.ctaHost,
    estSeconds: Math.round(words / 2.6 + d.scenes.length * 2 + 3),
    estFirstTapMs: 1800,
    explainer: { scenes: d.scenes },
  };
}

/** One plate's page: heading and three step cards. `lit` is how many cards are on; the rest are dimmed, never hidden, so the viewer sees where the flow is going. */
export function plateHtml(c: Concept, scene: ExplainerScene, lit: 1 | 2 | 3): string {
  const { accent, dark, light } = c.brand;
  const card = (n: ExplainerNode, i: number) => `
    <div class="card n${i + 1} ${i < lit ? "on" : "off"} ${i === lit - 1 ? "now" : ""}" data-n="${i + 1}">
      <div class="step"><span class="num">${i + 1}</span>${esc(n.step)}</div>
      <div class="line">${esc(n.line)}</div>
    </div>${i < 2 ? `<div class="arrow ${i + 1 < lit ? "on" : "off"}"><svg width="28" height="34" viewBox="0 0 28 34"><path d="M14 2v24M5 18l9 10 9-10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${PLATE_CSS_W}px;height:${PLATE_H}px;background:${dark};color:${light};font-family:Inter,"Segoe UI",system-ui,sans-serif;overflow:hidden}
.wrap{padding:34px 22px 0}
h1{margin:0 0 22px;font-size:25px;line-height:1.15;letter-spacing:.02em;text-transform:uppercase;color:${accent}}
.card{border-radius:20px;padding:22px 20px;background:linear-gradient(160deg,${dark} 0%,#00000030 100%),#ffffff0d;border:2px solid #ffffff22;transition:none}
.card.on{border-color:${accent};background:linear-gradient(160deg,#ffffff14,#ffffff06)}
.card.now{box-shadow:0 0 0 4px ${accent}33,0 12px 40px #00000066}
.card.off{opacity:.28}
.step{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;letter-spacing:.12em;color:${accent};margin-bottom:10px}
.num{display:inline-flex;width:28px;height:28px;border-radius:50%;align-items:center;justify-content:center;background:${accent};color:${dark};font-size:15px}
.line{font-size:27px;font-weight:700;line-height:1.22}
.arrow{display:flex;justify-content:center;height:40px;align-items:center;color:${accent}}.arrow.off{opacity:.25}
</style></head><body><div class="wrap"><h1 id="head">${esc(scene.heading)}</h1>${scene.nodes.map(card).join("")}</div></body></html>`;
}

/** Re-reads each public page the cards came from and refuses to render if the page no longer says the line. */
async function verifyLive(c: Concept, scenes: ExplainerScene[]): Promise<Record<string, string>> {
  const b = await openBrowsed(c.origin);
  const texts: Record<string, string> = {};
  try {
    for (const sc of scenes)
      for (const n of sc.nodes) {
        if (!n.path) continue;
        // the page the line was taken from first, then the product's other public pages: a line that is on none of them is no longer true to say
        let found = false;
        for (const p of [...new Set([n.path, "/", "/scan", "/proof"])]) {
          const url = new URL(p as string, c.origin).toString();
          if (!texts[url]) {
            await openPage(b.page, url);
            texts[url] = norm(await b.page.evaluate(() => document.body.innerText));
          }
          if (texts[url].includes(norm(n.line))) {
            found = true;
            break;
          }
        }
        if (!found) throw new Error(`The live site no longer says "${n.line.slice(0, 70)}" on any public page. Not rendering a claim the product does not make.`);
      }
  } finally {
    await b.close();
  }
  return texts;
}

export function captureExplainer(c: Concept) {
  return async (outDir: string, logoFile: string): Promise<Manifest> => {
    const ex = c.explainer;
    if (!ex) throw new Error("not an explainer concept");
    await mkdir(outDir, { recursive: true });
    await verifyLive(c, ex.scenes);
    const b = await openBrowsed(c.origin);
    const capturedAt = new Date().toISOString();
    const plates: Record<string, PlateManifest> = {};
    try {
      for (let i = 0; i < ex.scenes.length; i++) {
        const sc = ex.scenes[i];
        const id = `x${i + 1}`;
        const states: PlateManifest["states"] = {};
        const rects: Record<string, Rect> = {};
        const keys = ["s0", "a", "b"] as const;
        for (let k = 0; k < 3; k++) {
          await b.page.setContent(plateHtml(c, sc, (k + 1) as 1 | 2 | 3), { waitUntil: "load" });
          if (k === 0) {
            const r = await b.page.evaluate(() => {
              const box = (e: Element | null) => {
                const x = e?.getBoundingClientRect();
                return x ? ([Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)] as [number, number, number, number]) : null;
              };
              return { head: box(document.getElementById("head")), n1: box(document.querySelector(".n1")), n2: box(document.querySelector(".n2")), n3: box(document.querySelector(".n3")) };
            });
            if (!r.head || !r.n1 || !r.n2 || !r.n3) throw new Error("explainer plate did not lay out");
            Object.assign(rects, { head: r.head, cA: r.n1, boxA: r.n2, cB: r.n2, boxB: r.n3 });
          }
          const file = `${id}-${keys[k]}.jpg`;
          await writeFile(path.join(outDir, file), await b.page.screenshot({ type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: PLATE_CSS_W, height: PLATE_H } }));
          const shown = [sc.heading, ...sc.nodes.slice(0, k + 1).flatMap((n) => [n.step, n.line])].join(" ");
          states[keys[k]] = { file, label: k === 0 ? `${sc.heading}, first step` : `${sc.heading}, ${sc.nodes[k].step.toLowerCase()}`, visible: shown, ...(k > 0 ? { result: sc.nodes[k].line } : {}) } as PlateManifest["states"][string];
        }
        plates[id] = { id, url: c.origin, title: `${sc.heading} ${c.hook}`, capturedAt, text: sc.nodes.map((n) => n.line).join("\n"), w: PLATE_CSS_W, h: PLATE_H, states, rects, meta: { resultFontPx: 27 } };
      }
    } finally {
      await b.close();
    }
    const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  };
}
