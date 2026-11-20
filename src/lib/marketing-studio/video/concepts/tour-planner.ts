/**
 * AI-assisted concept planning for live product tours, grounded in Product Truth. The model is given a BRIEF (a subject and a customer question, never a script), what the real site
 * says and offers (the corpus), the verified facts, what must never be claimed, and the product's creative history. It plans a video: hook, story, narration and a sequence of real
 * interactions. It can only choose lines, links, buttons and fields that exist on the real site, and every plan is checked by deterministic gates BEFORE anything is rendered:
 * script rules, Product Truth grounding of every claim, narration against what is shown, real interactions that exist, and the similarity gate against the creative history. A plan
 * that fails is NOT left blocked: the exact problems are fed back and the model replans, a bounded number of times, internally. Nothing failed reaches the owner.
 */
import type { StudioDb } from "../../db";
import { askJson, parseJson } from "./ai";
import { blockById, controlById, type Corpus } from "./corpus";
import type { ExplainerDef, ExplainerNode, ExplainerScene } from "./explainer";
import { fingerprintOfConcept, similarityProblems, content, jaccard, type CreativeFingerprint } from "./similarity";
import { hookProblems, scriptProblems } from "./validate";
import { BANNED } from "../demo/qa";
import { OUTCOME_WORD } from "./standard";
import { conceptFromExplainer } from "./explainer";
import type { TourStep } from "./tour";

/** A flagship brief asks for the long format: six scenes that between them cover the pages in `mustCover`. */
export type Brief = { flagship?: boolean; mustCover?: string[]; /** a flagship's story, scene by scene: the pages each scene is about */ storyScenes?: string[][]; angleId: string; key: string; role: "A" | "B" | "C"; title: string; goal: string; audience: string; coreBenefit: string; features: string[]; ctaText: string; ctaUrl: string; funnel: string };
export type PlanContext = { corpus: Corpus; facts: string[]; prohibited: string[]; history: CreativeFingerprint[]; brand: ExplainerDef["brand"]; slug: string; productName: string; origin: string; ctaHost: string };
export type Planned = { ok: true; def: ExplainerDef; yt: { title: string; description: string }; attempts: number; repairs?: number } | { ok: false; problems: string[]; attempts: number };

type RawNode = { step?: string; block?: string; say?: string; fact?: number };
type RawStep = { node?: number; do?: string; target?: string; value?: string; shows?: string };
type RawScene = { heading?: string; nodes?: RawNode[]; tour?: RawStep[] };
type Raw = { hook?: string; problem?: string; benefit?: string; yt?: { title?: string; description?: string }; scenes?: RawScene[]; endLine?: string; endCaption?: string; endHeadline?: string };

const SYSTEM = `You plan one 25 second vertical marketing video for a software product. The viewer watches the REAL product website being used while a narrator speaks. You return ONE JSON object and nothing else.

You are given: a BRIEF (a subject and a customer question; it is not a script), the real website as numbered TEXT BLOCKS and CONTROLS, the VERIFIED FACTS, what must NEVER be claimed, and HISTORY (the product's earlier videos: do not repeat their hooks, wording, closing lines or sequence of screens).

Rules:
- The video has exactly 2 scenes. Each scene has exactly 3 nodes. Spoken lines: scene 1 node 1 is replaced by the HOOK (spoken first), every other node has its own "say" line. Then one closing line.
- Each node points at ONE text block (its "block" id) that is on the real site: that is the thing on screen when the node is spoken. The "say" line must be about what that block (and the page around it) shows, in your own words; it may not claim anything the verified facts and the site do not support. Never invent numbers, results, customers, speed or savings. NEVER use these words or ideas: best, #1, only, guarantee, instantly, seconds, minutes, hours, fastest, forever, risk-free, percent figures, "this page", "this screen", "overview", "solution", "platform", "feature", "dashboard".
- Every "say" line must clearly connect to its block: reuse at least half of the block's key words (its nouns and verbs) in your own sentence, so what is spoken is what the viewer is looking at. Do not describe anything the block does not show.
- Every block you are shown is already backed by a verified fact; your "say" line must not go beyond what the block and the facts say.
- "tour" lists the real interactions of the scene in order. Each step: node (1, 2 or 3: the node whose line it accompanies), do ("open" (a page path; the first step of a scene always opens a page, and a later "open" moves to another page), then "scroll", "click" or "type"), target (scroll: a block id; click: a control id; type: a field control id; open: a page path), value (type only: use the product's own name or website address, nothing personal), shows (a block id that is VISIBLE on the screen after the step; for a click on a link it must be on the page the link opens). Every node needs at least one step; the scene's first step is "open" with node 1. Use more than two interactions across the video, mix scroll, click and type, and keep to real pages and controls from the list.
- Write like a person who wants the viewer to try the product: a specific hook with real tension (a question or a "you"), a point of view, a payoff, short spoken lines (4 to 14 words), no documentation language, no "Welcome", "Introducing", "In this video". Each video must sound individually written: vary the structure, the rhythm and the closing. Avoid stock phrases such as "does the work automatically" or "nothing publishes until you approve" unless the HISTORY shows they are unused.
- The closing line (endLine) invites the viewer and ends with the words "Gravy Block dot com" (how the voice says the site). endCaption is the same invitation written with "gravyblock.com". endHeadline is a short on-screen line (max 6 words). The closing and headline must not repeat any earlier video's.
Return: {"hook","problem","benefit","yt":{"title","description"},"scenes":[{"heading","nodes":[{"step","block","say"}x3],"tour":[{"node","do","target","value","shows"}...]}x2],"endLine","endCaption","endHeadline"}
"step" is a 1 to 2 word label in capitals. "heading" is a 2 to 5 word on-screen heading. problem and benefit are one plain sentence each.`;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
const trim90 = (s: string) => (s.length > 90 ? s.slice(0, 90).replace(/\s+\S*$/, "") : s);

/** The verified fact that backs a block of site text: the one that says the same thing, or null. Product Truth grounding is decided here, not by the model. */
export function factFor(text: string, facts: string[]): string | null {
  let best: { f: string; s: number } | null = null;
  for (const f of facts) {
    const s = norm(f).includes(norm(text)) || norm(text).includes(norm(f)) ? 1 : jaccard(content(f), content(text));
    if (!best || s > best.s) best = { f, s };
  }
  return best && best.s >= 0.34 ? best.f : null;
}

/** Only text that a verified fact backs is offered to the planner, so a plan cannot rest on a claim Product Truth does not support. */
export function groundedCorpus(c: Corpus, facts: string[]): Corpus {
  return { ...c, pages: c.pages.map((p) => ({ ...p, blocks: p.blocks.filter((b) => factFor(b.text, facts) && !BANNED.test(b.text)) })) };
}

const SWAPS: Array<[string, string]> = [["best", "right"], ["only", "just"], ["instantly", "quickly"], ["this page", "here"], ["this screen", "here"], ["business hours", "opening times"], ["opening hours", "opening times"]];

/** Pure: a hook that runs past 12 words is cut back to its first complete thought (a sentence or clause that fits), keeping a question a question. */
export function fitHook(hook: string): string {
  const h = hook.trim().replace(/\s+/g, " ");
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  if (count(h) <= 12) return h;
  const sentences = h.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [];
  const fit = sentences.find((x) => count(x) <= 12 && count(x) >= 4);
  if (fit) return fit;
  const clauses = h.split(/(?<=[,;:])\s+/);
  let acc = "";
  for (const c of clauses) {
    const next = acc ? acc + " " + c : c;
    if (count(next) > 12) break;
    acc = next;
  }
  const base = (acc || h.split(" ").slice(0, 12).join(" ")).replace(/[,;:\s]+$/, "");
  return /[.!?]$/.test(base) ? base : base + (h.includes("?") ? "?" : ".");
}
export function swapWords(text: string): string {
  let out = text;
  for (const [from, to] of SWAPS) {
    const re = new RegExp("(^|[^a-z])" + from + "(?![a-z])", "gi");
    out = out.replace(re, (_m, pre: string) => pre + to);
  }
  return out;
}

/** Scenes in a flagship explainer, and the length window (in seconds) each format must land in. */
export const FLAGSHIP_SCENES = 6;
export const lengthWindow = (flagship?: boolean) => (flagship ? { lo: 60, hi: 90 } : { lo: 23, hi: 32 });

/** The system prompt for a brief: the short format as written, or the flagship format (a long story over six scenes that explains the whole product). */
export function systemFor(b: Brief): string {
  if (!b.flagship) return SYSTEM;
  return (
    SYSTEM.replace("one 25 second vertical marketing video", "one 75 second vertical flagship explainer video")
      .replace("The video has exactly 2 scenes. Each scene has exactly 3 nodes.", `The video has exactly ${FLAGSHIP_SCENES} scenes. Each scene has exactly 3 nodes.`)
      .replace("}x2],\"endLine\"", `}x${FLAGSHIP_SCENES}],"endLine"`) +
    `

FLAGSHIP EXPLAINER (this overrides the 2-scene and 25-second wording above). This is the main video on the homepage: a visitor who has never heard of the product must be able to explain what it does after watching. It runs 60 to 90 seconds (about 18 spoken lines of 6 to 14 words, plus the hook and the closing line), over exactly ${FLAGSHIP_SCENES} scenes, one for each part of the story, in this order:
1. The hook and what the product is and who it is for.
2. How it finds the opportunities: the real free scan (type a business website into the real scan field) and what a real scan report shows.
3. How it learns the business and only uses current, verified company information.
4. What it does automatically (execution), with real examples of the work, and that it does the eligible work instead of handing over a list of tasks.
5. How completed work is checked and recorded (proof), and how little the owner has to do and what the owner controls.
6. Marketing Studio (ongoing marketing videos made from the real website, reviewed before publication), the offer, and what to do next.
${b.storyScenes?.length ? `\nSCENE PLAN (follow it exactly: the blocks of each scene's three nodes must be blocks of the page or pages named for that scene, and the scene's tour must open them):\n${b.storyScenes.map((p, i) => `Scene ${i + 1}: ${p.join(" then ")}`).join("\n")}\n` : ""}Every scene must show the real site being used (scroll, click, type), not a still page. The scenes together must visit every page in the brief's MUST COVER list. Do not describe anything the site and the verified facts do not show. Spoken lines are short, energetic, warm and specific: not corporate and not hyped.`
  );
}

export function renderPrompt(b: Brief, ctx: PlanContext, feedback: string[], prev?: unknown): string {
  const pages = ctx.corpus.pages
    .map((p) => `PAGE ${p.path} (${p.title})\n${p.blocks.map((x) => `[${x.id}] ${x.text}`).join("\n")}\nCONTROLS:\n${p.controls.map((c) => `[${c.id}] ${c.kind} "${c.text}"${c.to ? ` opens ${c.to}` : ""}`).join("\n")}`)
    .join("\n\n");
  const used = [...new Set(ctx.history.map((h) => h.hook.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase()).filter(Boolean))];
  const openings = used.length ? `Hook openings already used (start your hook with different words): ${used.map((u) => `"${u}..."`).join(", ")}` : "";
  const hist = ctx.history.length ? ctx.history.map((h) => `- hook: "${h.hook}" | closing: "${h.closing}" | screens: ${h.visual.slice(0, 8).join(", ") || "n/a"}`).join("\n") : "(none yet)";
  return `BRIEF
Subject: ${b.title}
Customer question to answer: ${b.goal}
Audience: ${b.audience}
Core benefit: ${b.coreBenefit}
Features it may touch: ${b.features.join(", ")}
Closing invitation leads to: ${b.ctaUrl} (button: "${b.ctaText}")

VERIFIED FACTS
${ctx.facts.map((f, i) => `${i}: ${f}`).join("\n")}

MUST NEVER CLAIM
${ctx.prohibited.length ? ctx.prohibited.map((p) => `- ${p}`).join("\n") : "(none)"}

HISTORY (do not repeat)
${hist}
${openings}

THE REAL SITE
${pages}
${feedback.length ? `\nYOUR PREVIOUS PLAN WAS REFUSED. Fix exactly these problems, differently where it says repeated:\n${feedback.map((f) => `- ${f}`).join("\n")}\n${prev ? `\nTHE PREVIOUS PLAN (change ONLY what the problems name and return the whole JSON again with everything else exactly as it was):\n${JSON.stringify(prev)}\n` : ""}` : ""}`;
}

/** Pure: turns a raw plan into a definition using only things that exist on the real site; reports every problem it finds. */
export function buildDef(raw: Raw, b: Brief, ctx: PlanContext): { def: ExplainerDef | null; problems: string[] } {
  const problems: string[] = [];
  const need = (ok: unknown, m: string) => {
    if (!ok) problems.push(m);
    return Boolean(ok);
  };
  const wantScenes = b.flagship ? FLAGSHIP_SCENES : 2;
  if (!need(raw && Array.isArray(raw.scenes) && raw.scenes.length === wantScenes, `the plan must have exactly ${wantScenes} scenes`)) return { def: null, problems };
  const scenes: ExplainerScene[] = [];
  raw.scenes!.forEach((rs, si) => {
    const tag = `scene ${si + 1}`;
    if (!need(Array.isArray(rs.nodes) && rs.nodes.length === 3, `${tag} needs exactly 3 nodes`)) return;
    const nodes: ExplainerNode[] = [];
    rs.nodes!.forEach((rn, ni) => {
      const hit = rn.block ? blockById(ctx.corpus, rn.block) : null;
      if (!need(hit, `${tag} node ${ni + 1}: block "${rn.block}" is not on the real site`)) return;
      // words the wording gate refuses are swapped for plain ones (site text such as "best legitimate action" invites them), meaning unchanged
      const say = swapWords((rn.say ?? "").trim());
      if (!need(say.split(/\s+/).length >= 3, `${tag} node ${ni + 1}: the spoken line is missing`)) return;
      const fact = factFor(hit!.block.text, ctx.facts);
      if (!need(fact, `${tag} node ${ni + 1}: no verified fact backs the block "${hit!.block.text.slice(0, 40)}"; choose a block that says something verified`)) return;
      nodes.push({ step: (rn.step ?? "STEP").toUpperCase().slice(0, 16), line: hit!.block.text, say, path: hit!.page.path, fact: fact! });
    });
    if (nodes.length !== 3) return;
    // the real interactions
    const steps: TourStep[] = [];
    let page: string | null = null;
    const visited = new Set<string>();
    const pageAfter: Array<string | null> = [];
    // a plan whose first step does not open a page is repaired, not refused: the page of what it shows is opened first
    let rawSteps: RawStep[] = Array.isArray(rs.tour) ? [...rs.tour] : [];
    // a tour that is missing or too short is completed from the nodes themselves: open the page of the first block, then bring each node's own block into view (opening a page when the block is on another)
    if (rawSteps.length < 3) {
      let cur = "";
      rawSteps = [];
      rs.nodes!.forEach((rn, ni) => {
        const h = rn.block ? blockById(ctx.corpus, rn.block) : null;
        if (!h) return;
        if (h.page.path !== cur) {
          rawSteps.push({ node: ni + 1, do: "open", target: h.page.path, shows: h.block.id });
          cur = h.page.path;
          if (ni > 0) return;
        }
        rawSteps.push({ node: ni + 1, do: "scroll", target: h.block.id, shows: h.block.id });
      });
    }
    const firstShows = rawSteps[0]?.shows ? blockById(ctx.corpus, rawSteps[0].shows) : null;
    if (rawSteps[0] && rawSteps[0].do !== "open" && firstShows) rawSteps.unshift({ node: 1, do: "open", target: firstShows.page.path, shows: rawSteps[0].shows });
    rawSteps.forEach((st, k) => {
      const t = `${tag} step ${k + 1}`;
      const n = Math.min(2, Math.max(0, (st.node ?? 1) - 1)) as 0 | 1 | 2;
      let showsHit = st.shows ? blockById(ctx.corpus, st.shows) : null;
      // what a step shows is repaired, not refused, when it is on the wrong page: a scroll shows its own target, a click shows the top of the page it opens, a type shows its field
      if (k > 0 && st.target) {
        const tgtBlock = st.do === "scroll" ? blockById(ctx.corpus, st.target) : null;
        const tgtCtl = st.do === "click" || st.do === "type" ? controlById(ctx.corpus, st.target) : null;
        const destPath = tgtBlock ? tgtBlock.page.path : tgtCtl ? (st.do === "click" && tgtCtl.control.kind === "link" && tgtCtl.control.to ? tgtCtl.control.to : tgtCtl.page.path) : null;
        if (destPath && (!showsHit || showsHit.page.path !== destPath)) {
          const fix = tgtBlock ? tgtBlock.block : (ctx.corpus.pages.find((x) => x.path === destPath)?.blocks[0] ?? null);
          if (fix) showsHit = { page: ctx.corpus.pages.find((x) => x.path === destPath)!, block: fix };
        }
      }
      if (!need(showsHit, `${t}: shows block "${st.shows}" is not on the real site`)) return;
      const shows = trim90(showsHit!.block.text);
      if (k === 0) {
        if (!need(st.do === "open", `${t}: the first step of a scene must open a page`)) return;
        const p = ctx.corpus.pages.find((x) => x.path === st.target);
        if (!need(p, `${t}: page "${st.target}" is not on the real site`)) return;
        need(showsHit!.page.path === p!.path, `${t}: what it shows must be on the page it opens`);
        page = p!.path;
        visited.add(p!.path);
        steps.push({ node: 0, do: "open", path: p!.path, shows });
        pageAfter[steps.length - 1] = page;
        return;
      }
      // a step on a page other than the current one is a move to that page first (a real navigation, shown), not an error
      const need2 = st.target && (st.do === "scroll" ? blockById(ctx.corpus, st.target)?.page.path : st.do === "click" || st.do === "type" ? controlById(ctx.corpus, st.target)?.page.path : undefined);
      if (k > 0 && need2 && need2 !== page) {
        const first = st.do === "scroll" ? blockById(ctx.corpus, st.target!)!.block : (ctx.corpus.pages.find((x) => x.path === need2)?.blocks[0] ?? null);
        if (first) {
          steps.push({ node: n, do: "open", path: need2, shows: trim90(first.text) });
          page = need2;
          visited.add(need2);
        }
      }
      if (st.do === "open") {
        const p = ctx.corpus.pages.find((x) => x.path === st.target);
        if (!need(p, `${t}: page "${st.target}" is not on the real site`)) return;
        need(showsHit!.page.path === p!.path, `${t}: what it shows must be on the page it opens`);
        page = p!.path;
        visited.add(p!.path);
        steps.push({ node: n, do: "open", path: p!.path, shows });
      } else if (st.do === "scroll") {
        const b2 = st.target ? blockById(ctx.corpus, st.target) : null;
        if (!need(b2 && b2.page.path === page, `${t}: scroll target must be a block of the current page`)) return;
        need(showsHit!.page.path === page, `${t}: what it shows must be on the current page`);
        steps.push({ node: n, do: "scroll", text: trim90(b2!.block.text), shows });
      } else if (st.do === "click") {
        const c = st.target ? controlById(ctx.corpus, st.target) : null;
        if (!need(c && c.page.path === page && c.control.kind !== "field", `${t}: click target must be a link or button on the current page`)) return;
        const dest = c!.control.kind === "link" && c!.control.to ? c!.control.to : page;
        need(showsHit!.page.path === dest, `${t}: after this click the page is ${dest}, so what it shows must be on that page`);
        steps.push({ node: n, do: "click", text: c!.control.text, shows });
        page = dest;
        visited.add(dest as string);
      } else if (st.do === "type") {
        const c = st.target ? controlById(ctx.corpus, st.target) : null;
        if (!need(c && c.page.path === page && c.control.kind === "field", `${t}: type target must be a field on the current page`)) return;
        const value = (st.value ?? "").trim();
        need(value.length > 0 && value.length <= 40 && !/[@\d]{4,}/.test(value), `${t}: the typed value must be short and impersonal (the product's own name or site)`);
        need(showsHit!.page.path === page, `${t}: what it shows must be on the current page`);
        steps.push({ node: n, do: "type", field: c!.control.text, value, shows });
      } else need(false, `${t}: unknown action "${st.do}"`);
      pageAfter[steps.length - 1] = page;
    });
    // a node with no interaction of its own gets one: bring its block into view, inserted after the previous node's steps, when that block is on the page then showing
    for (const n of (si === 0 ? [0, 1, 2] : [1, 2]) as Array<0 | 1 | 2>) {
      if (steps.some((x) => x.node === n && x.do !== "open")) continue;
      let at = -1;
      steps.forEach((x, i) => {
        if (x.node < n || (n === 0 && i === 0)) at = i;
      });
      const pageThen = at >= 0 ? pageAfter[at] : null;
      const nd = nodes[n];
      const b3 = rs.nodes![n].block ? blockById(ctx.corpus, rs.nodes![n].block!) : null;
      if (b3 && pageThen === b3.page.path) steps.splice(at + 1, 0, { node: n, do: "scroll", text: trim90(b3.block.text), shows: trim90(b3.block.text) });
      else if (b3 && at === steps.length - 1) {
        // the last node's block is on another page: go there for real (a shown navigation) and bring the block into view
        const top = b3.page.blocks[0];
        steps.push({ node: n, do: "open", path: b3.page.path, shows: trim90(top.text) });
        pageAfter[steps.length - 1] = b3.page.path;
        visited.add(b3.page.path);
        if (top.id !== b3.block.id) {
          steps.push({ node: n, do: "scroll", text: trim90(b3.block.text), shows: trim90(b3.block.text) });
          pageAfter[steps.length - 1] = b3.page.path;
        }
      }
      void nd;
    }
    nodes.forEach((nd, ni) => need(visited.has(nd.path as string), `${tag} node ${ni + 1}: its block is on ${nd.path}, a page this scene never shows`));
    for (const n of [0, 1, 2]) need(steps.some((x) => x.node === n && x.do !== "open") || (n === 0 && steps.length > 0), `${tag}: node ${n + 1} has no interaction on screen while it is spoken`);
    scenes.push({ heading: (rs.heading ?? "").trim().slice(0, 40), nodes: nodes as ExplainerScene["nodes"], tour: steps });
  });
  need(!!raw.hook && raw.hook.trim().length > 8, "a hook is missing");
  problems.splice(0, problems.length, ...[...new Set(problems)]);
  need(!!raw.endLine && /gravy block dot com/i.test(raw.endLine), 'the closing line must end with "Gravy Block dot com"');
  need(!!raw.endCaption && /gravyblock\.com/i.test(raw.endCaption), 'the closing caption must contain "gravyblock.com"');
  need(!!raw.endHeadline && raw.endHeadline.trim().split(/\s+/).length <= 7, "the closing headline is missing or too long");
  need(!!raw.yt?.title && !!raw.yt?.description, "a YouTube title and description are missing");
  if (problems.length || scenes.length !== wantScenes) return { def: null, problems };
  const def: ExplainerDef = {
    ...(b.flagship ? { flagship: true, mustCover: b.mustCover ?? [] } : {}),
    slug: ctx.slug,
    productName: ctx.productName,
    origin: ctx.origin,
    ctaHost: ctx.ctaHost,
    brand: ctx.brand,
    specId: `${ctx.slug}:${b.key}`,
    angle: { id: b.angleId, role: b.role, title: b.title, funnel: b.funnel },
    title: raw.yt!.title!.trim().slice(0, 90),
    hook: fitHook(raw.hook!),
    audience: b.audience,
    problem: (raw.problem ?? b.goal).trim(),
    whyItMatters: (raw.benefit ?? b.coreBenefit).trim(),
    scenes,
    endLine: raw.endLine!.trim(),
    endCaption: raw.endCaption!.trim(),
    endHeadline: raw.endHeadline!.trim(),
    cta: { text: b.ctaText, url: b.ctaUrl, display: b.ctaUrl.replace(/^https?:\/\//, "") },
  };
  return { def, problems };
}

/** Pure: every gate that can be run before the expensive render. */
export function gateDef(def: ExplainerDef, ctx: PlanContext, others: CreativeFingerprint[]): string[] {
  const c = conceptFromExplainer(def);
  const out = [...hookProblems(c.hook, c.productName), ...scriptProblems(c.narration.map((l) => ({ spoken: l.spoken.replace(/\{[^}]*\}/g, "") })), c.onScreen.map((o) => o.text), ctx.prohibited)];
  // the narration is about what is on screen: each spoken line's content must be found in what its node shows (its block, the blocks its steps show, the heading)
  def.scenes.forEach((sc, si) => {
    sc.nodes.forEach((n, ni) => {
      if (si === 0 && ni === 0) return;
      const seen = new Set<string>([...content(n.line), ...content(sc.heading)]);
      for (const st of sc.tour ?? []) if (st.node === ni) for (const w of content(st.shows)) seen.add(w);
      const words = [...content(n.say)];
      const missing = words.filter((w) => !seen.has(w));
      if (words.length >= 3 && missing.length / words.length > 0.5) out.push(`scene ${si + 1} node ${ni + 1}: the line "${n.say}" talks about ${missing.slice(0, 4).join(", ")}, which its screen does not show; say what the screen shows`);
    });
  });
  // the video has to be 20 to 35 seconds, with room either side: judged from the words spoken
  const spokenWords = c.narration.reduce((n, l) => n + l.spoken.replace(/\{[^}]*\}/g, "").split(/\s+/).filter(Boolean).length, 0);
  const win = lengthWindow(def.flagship);
  if (c.estSeconds < win.lo || c.estSeconds > win.hi) out.push(`the video would run about ${c.estSeconds} seconds (${spokenWords} spoken words); it must run ${win.lo} to ${win.hi} seconds: ${c.estSeconds < win.lo ? "add a few words to the lines" : `cut about ${Math.max(4, Math.round((c.estSeconds - (win.hi - 2)) * 2.6))} spoken words in total, from the longest lines`}`);
  // a flagship story must show every part of the product it promises to explain
  if (def.flagship && def.mustCover?.length) {
    const covered = new Set(def.scenes.flatMap((sc) => [...sc.nodes.map((n) => n.path), ...(sc.tour ?? []).filter((t) => t.do === "open").map((t) => t.path)]));
    const missing = def.mustCover.filter((p) => !covered.has(p));
    if (missing.length) out.push(`the story must show these pages and does not: ${missing.join(", ")} (open each in a scene and base a spoken line on one of its blocks)`);
  }
  // a flagship shows the product being used in every scene
  if (def.flagship) {
    const still = def.scenes.map((sc, i) => ({ i, n: (sc.tour ?? []).filter((t) => t.do !== "open").length })).filter((x) => x.n < 3);
    if (still.length) out.push(`scene ${still.map((x) => x.i + 1).join(", ")} does not use the product enough (at least 3 scrolls, clicks or typed entries a scene): add real interactions`);
  }
  // the finished video is refused when fewer than half of its spoken lines name an action or a result: the same test, run on the plan, so a plan that would fail it is never rendered
  const spoken = c.narration.map((l) => l.spoken.replace(/\{[^}]*\}/g, "").trim()).filter(Boolean);
  const lacking = spoken.filter((t) => !OUTCOME_WORD.test(t));
  const needMore = Math.ceil(spoken.length * 0.5) - (spoken.length - lacking.length);
  if (needMore > 0) out.push(`only ${spoken.length - lacking.length} of ${spoken.length} spoken lines name an action or a result: rewrite at least ${needMore} of these so they say what happens on screen, with verbs such as tap, open, find, see, watch, pick, shows, reads, lists, types: ${lacking.slice(0, 4).map((t) => JSON.stringify(t)).join(", ")}`);
  out.push(...similarityProblems(fingerprintOfConcept(c), others));
  return out;
}

export type Ask = (system: string, user: string, attempt: number) => Promise<string>;

export const MAX_PLAN_ATTEMPTS = 3;

/**
 * Plans, gates, and on any failure FIRST repairs what failed without paying (deterministic repairs, up to four passes), and only then asks the model again, with the previous plan and the exact
 * problems so only those parts change. A plan that cannot be repaired is refused with its problems. Pure of side effects except the (injectable) model call.
 */
export async function planTour(b: Brief, ctx: PlanContext, others: CreativeFingerprint[], ask: Ask, maxAttempts = MAX_PLAN_ATTEMPTS, seedFeedback: string[] = []): Promise<Planned> {
  let feedback: string[] = [...seedFeedback];
  let prev: Raw | null = null;
  let repairs = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: Raw | null = null;
    let reply = "";
    try {
      reply = await ask(systemFor(b), renderPrompt(b, ctx, feedback, prev), attempt);
      raw = parseLoose(reply);
    } catch (e) {
      return { ok: false, problems: [`the model step failed: ${e instanceof Error ? e.message : e}`], attempts: attempt, repairs } as Planned;
    }
    if (!raw) {
      feedback = [`the reply was not valid JSON in the requested shape (${reply.length} characters, ends with: ${JSON.stringify(reply.slice(-60))})`];
      prev = null;
      continue;
    }
    let problems: string[] = [];
    let built: { def: ExplainerDef | null; problems: string[] } = { def: null, problems: [] };
    for (let pass = 0; pass < 5; pass++) {
      built = buildDef(raw, b, ctx);
      problems = built.def ? gateDef(built.def, ctx, others) : built.problems;
      if (!problems.length) break;
      const fixed = repairRaw(raw, problems, ctx, b);
      if (!fixed.changed) break;
      raw = fixed.raw;
      repairs++;
    }
    if (!problems.length && built.def) {
      return { ok: true, def: built.def, yt: { title: (raw.yt?.title ?? b.title).trim(), description: `${raw.hook!.trim()} ${(raw.yt?.description ?? b.goal).trim()}\n\n${b.ctaText}: ${b.ctaUrl}` }, attempts: attempt, repairs };
    }
    feedback = problems.slice(0, 8);
    prev = raw;
  }
  return { ok: false, problems: feedback, attempts: maxAttempts, repairs } as Planned;
}

/** The production model call: cached and counted against the monthly cap by askJson. A higher temperature on a replan, so the second plan really is different. */
export const aiAsk = (db: StudioDb, specId: string): Ask => async (system, user, attempt) =>
  (await askJson(db, { specId, purpose: attempt === 1 ? "tour_plan" : `tour_replan_${attempt}`, system, user, maxTokens: 14000, temperature: Math.min(1, 0.7 + attempt * 0.08) })).text;

// ---- free repairs ---------------------------------------------------------------------------------------------------------------------

/** Pure: a reply cut off mid-way (the model ran out of room) is closed with the missing quote and brackets, so a nearly complete plan is not paid for twice. */
export function parseLoose(text: string): Raw | null {
  const direct = parseJson<Raw>(text);
  if (direct) return direct;
  const start = text.indexOf("{");
  if (start < 0) return null;
  let body = text.slice(start);
  const end = body.lastIndexOf("}");
  if (end > 0) {
    const whole = parseJson<Raw>(body.slice(0, end + 1));
    if (whole) return whole;
  }
  // close an unterminated string, drop a dangling key or comma, then close the open brackets in order
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of body) {
    if (esc) esc = false;
    else if (ch === "\\") esc = inStr;
    else if (ch === '"') inStr = !inStr;
    else if (!inStr && (ch === "{" || ch === "[")) stack.push(ch === "{" ? "}" : "]");
    else if (!inStr && (ch === "}" || ch === "]")) stack.pop();
  }
  if (inStr) body += '"';
  body = body.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  return parseJson<Raw>(body + stack.reverse().join(""));
}

const shortLine = (text: string) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= 14) return text.trim();
  const cut = words.slice(0, 14).join(" ");
  const at = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(";"), cut.lastIndexOf(" and "));
  return (at > 20 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "") + ".";
};
const WORD_FIX: Record<string, string> = { hours: "a short time", minutes: "a short time", seconds: "a short time" };
const count = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** The block of the corpus whose words best match a spoken line (what the line is about), optionally limited to some pages. Only blocks a verified fact backs are in a grounded corpus. */
function bestBlock(ctx: PlanContext, say: string, pages?: string[]): string | null {
  let best: { id: string; s: number } | null = null;
  for (const pg of ctx.corpus.pages) {
    if (pages && !pages.includes(pg.path)) continue;
    for (const bl of pg.blocks) {
      const sc = jaccard(content(say), content(bl.text));
      if (!best || sc > best.s) best = { id: bl.id, s: sc };
    }
  }
  return best?.id ?? null;
}

/**
 * Pure: repairs a refused plan from the problems themselves, with no model call. It fixes the parts that failed and leaves the rest alone: a hook that is too long, a block that is not on the real
 * site or has no verified fact, a line about something its screen does not show (it says the screen's own words instead), a node with no interaction or whose page the scene never shows,
 * an interaction that does not exist on the page (it is dropped), a word the wording gate refuses, and a script that runs long (the longest lines lose their trailing clause).
 * What cannot be repaired this way (a repeated hook, a script that is too short) is left for the model.
 */
/** Pure: a scene's tour rebuilt from its own nodes: each node's block is opened (when the page changes) and scrolled to, and a typed entry the scene had is kept where its page is showing. */
function rebuildTour(sc: RawScene, ctx: PlanContext): void {
  const old = sc.tour ?? [];
  const tour: RawStep[] = [];
  let page: string | null = null;
  (sc.nodes ?? []).forEach((nd, i) => {
    const hit = nd.block ? blockById(ctx.corpus, nd.block) : null;
    if (!hit) return;
    if (hit.page.path !== page) {
      tour.push({ node: i + 1, do: "open", target: hit.page.path, shows: nd.block });
      page = hit.page.path;
    }
    tour.push({ node: i + 1, do: "scroll", target: nd.block, shows: nd.block });
    for (const st of old) {
      if (st.do !== "type" || !st.target) continue;
      const ctl = controlById(ctx.corpus, st.target);
      if (ctl && ctl.page.path === page && !tour.includes(st)) tour.push({ ...st, node: i + 1, shows: nd.block });
    }
  });
  sc.tour = tour;
}

/** Pure: the distinct blocks of some pages that best match the lines a scene's nodes say, one per node. */
function blocksFor(ctx: PlanContext, says: string[], pages: string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  says.forEach((say, i) => {
    const page = pages[Math.min(pages.length - 1, Math.floor((i * pages.length) / Math.max(1, says.length)))];
    const pool = ctx.corpus.pages.find((p) => p.path === page)?.blocks ?? [];
    const ranked = [...pool].filter((b) => !used.has(b.id)).sort((x, y) => jaccard(content(say), content(y.text)) - jaccard(content(say), content(x.text)));
    const pick = ranked[0] ?? pool[0];
    if (pick) {
      used.add(pick.id);
      out.push(pick.id);
    }
  });
  return out;
}

export function repairRaw(input: Raw, problems: string[], ctx: PlanContext, brief?: Brief): { raw: Raw; changed: boolean; notes: string[] } {
  const raw: Raw = JSON.parse(JSON.stringify(input));
  const notes: string[] = [];
  const scene = (n: string | number) => raw.scenes?.[Number(n) - 1];
  const nodeOf = (sn: string, nn: string) => scene(sn)?.nodes?.[Number(nn) - 1];
  const sceneStepPages = (sc: RawScene | undefined) => {
    const pages: string[] = [];
    for (const st of sc?.tour ?? []) {
      if (st.do === "open" && st.target) pages.push(st.target);
      else if (st.target) {
        const ctl = controlById(ctx.corpus, st.target);
        const blk = blockById(ctx.corpus, st.target);
        const pg = ctl?.control.kind === "link" && ctl.control.to ? ctl.control.to : (ctl?.page.path ?? blk?.page.path);
        if (pg) pages.push(pg);
      }
    }
    return pages;
  };
  for (const pr of problems) {
    let m: RegExpExecArray | null;
    if ((m = /^the plan must have exactly (\d+) scenes/.exec(pr))) {
      if ((raw.scenes?.length ?? 0) > Number(m[1])) {
        raw.scenes = raw.scenes!.slice(0, Number(m[1]));
        notes.push("extra scenes dropped");
      }
    } else if ((m = /^the story must show these pages and does not: (.+?) \(open each/.exec(pr)) && brief?.storyScenes) {
      // the scenes whose assigned pages are missing take their pages: their nodes move onto blocks of those pages and their tour is rebuilt
      const missing = m[1].split(", ");
      brief.storyScenes.forEach((pages, i) => {
        const sc = raw.scenes?.[i];
        if (!sc || !pages.some((p) => missing.includes(p))) return;
        const ids = blocksFor(ctx, (sc.nodes ?? []).map((n) => n.say ?? ""), pages);
        (sc.nodes ?? []).forEach((n, k) => (ids[k] ? (n.block = ids[k]) : undefined));
        rebuildTour(sc, ctx);
        notes.push(`scene ${i + 1}: moved onto ${pages.join(", ")}`);
      });
    } else if ((m = /^scene ([\d, ]+) does not use the product enough/.exec(pr))) {
      for (const n of m[1].split(",").map((x) => Number(x.trim()))) {
        const sc = raw.scenes?.[n - 1];
        if (sc) {
          rebuildTour(sc, ctx);
          notes.push(`scene ${n}: tour rebuilt from its nodes`);
        }
      }
    } else if ((m = /^the hook is \d+ words/.exec(pr)) && raw.hook) {
      const fit = fitHook(raw.hook);
      if (fit !== raw.hook) {
        raw.hook = fit;
        notes.push("hook shortened");
      }
    } else if ((m = /^scene (\d) node (\d): (?:block "[^"]*" is not on the real site|no verified fact backs the block)/.exec(pr))) {
      const nd = nodeOf(m[1], m[2]);
      if (nd) {
        const id = bestBlock(ctx, nd.say ?? "");
        if (id && id !== nd.block) {
          nd.block = id;
          notes.push(`scene ${m[1]} node ${m[2]}: block replaced`);
        }
      }
    } else if ((m = /^scene (\d) node (\d): the line ".*" talks about/.exec(pr))) {
      const nd = nodeOf(m[1], m[2]);
      const hit = nd?.block ? blockById(ctx.corpus, nd.block) : null;
      if (nd && hit) {
        nd.say = swapWords(shortLine(hit.block.text));
        notes.push(`scene ${m[1]} node ${m[2]}: line says what the screen shows`);
      }
    } else if ((m = /^scene (\d): node (\d) has no interaction on screen/.exec(pr)) || (m = /^scene (\d) node (\d): its block is on (\S+), a page this scene never shows/.exec(pr))) {
      const sc = scene(m[1]);
      const nd = nodeOf(m[1], m[2]);
      const hit = nd?.block ? blockById(ctx.corpus, nd.block) : null;
      if (sc && nd && hit) {
        const visited = sceneStepPages(sc);
        if (!visited.includes(hit.page.path) && Number(m[2]) === 3) {
          // the last node's block is on another page: the tour goes there for real
          sc.tour = [...(sc.tour ?? []), { node: 3, do: "open", target: hit.page.path, shows: nd.block }];
          notes.push(`scene ${m[1]}: tour opens ${hit.page.path} for node 3`);
        } else if (!visited.includes(hit.page.path)) {
          const id = bestBlock(ctx, nd.say ?? "", visited.length ? visited : undefined);
          if (id) {
            nd.block = id;
            notes.push(`scene ${m[1]} node ${m[2]}: block moved to a page the scene shows`);
          }
        } else if (!(sc.tour ?? []).some((st) => (st.node ?? 1) === Number(m![2]) && st.do !== "open")) {
          sc.tour = [...(sc.tour ?? []), { node: Number(m[2]), do: "scroll", target: nd.block, shows: nd.block }];
          notes.push(`scene ${m[1]} node ${m[2]}: scroll step added`);
        }
      }
    } else if (/^only \d+ of \d+ spoken lines name an action or a result/.test(pr)) {
      const need = Number(/rewrite at least (\d+)/.exec(pr)?.[1] ?? 1);
      let done = 0;
      for (const sc of raw.scenes ?? [])
        for (const nd of sc.nodes ?? []) {
          if (done >= need) break;
          const hit = nd.block ? blockById(ctx.corpus, nd.block) : null;
          const own = hit ? swapWords(shortLine(hit.block.text)) : "";
          if (hit && !OUTCOME_WORD.test(nd.say ?? "") && OUTCOME_WORD.test(own) && !BANNED.test(own)) {
            nd.say = own;
            done++;
          }
        }
      if (done) notes.push(`${done} line(s) now say what the screen shows`);
      // still short: the shortest lines without an action word get a short spoken lead-in that points at the screen ("Now, ...", "Look, ..."), a different one each time
      if (done < need) {
        const LEADS = ["Now, ", "Look, ", "See, ", "Here, ", "Watch, "];
        const cands: RawNode[] = [];
        for (const sc of raw.scenes ?? []) for (const nd of sc.nodes ?? []) if (nd.say && !OUTCOME_WORD.test(nd.say) && count(nd.say) <= 11) cands.push(nd);
        cands.sort((x, y) => count(x.say ?? "") - count(y.say ?? ""));
        let k = 0;
        for (const nd of cands) {
          if (done >= need) break;
          const t = (nd.say ?? "").trim();
          nd.say = LEADS[k++ % LEADS.length] + t.charAt(0).toLowerCase() + t.slice(1);
          done++;
        }
        notes.push("short lead-ins added so the lines point at the screen");
      }
    } else if ((m = /^scene (\d) step (\d+): /.exec(pr)) && /(target must be|what it shows must be|is not on the real site|must be a block of the current page)/.test(pr)) {
      const sc = scene(m[1]);
      const idx = Number(m[2]) - 1;
      if (sc?.tour && idx > 0 && idx < sc.tour.length) {
        sc.tour.splice(idx, 1);
        notes.push(`scene ${m[1]}: step ${m[2]} dropped`);
      }
    } else if ((m = /unsupported wording: "([^"]+)"/.exec(pr))) {
      const word = m[1].toLowerCase();
      const to = WORD_FIX[word] ?? "";
      const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      const fix = (t?: string) => (t ? t.replace(re, to).replace(/\s{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").trim() : t);
      raw.hook = fix(raw.hook);
      raw.endLine = fix(raw.endLine);
      for (const sc of raw.scenes ?? []) for (const nd of sc.nodes ?? []) nd.say = fix(nd.say);
      notes.push(`wording: "${word}" replaced`);
    } else if ((m = /cut about (\d+) spoken words/.exec(pr))) {
      let need = Number(m[1]);
      const lines: Array<{ get: () => string; set: (v: string) => void }> = [];
      for (const sc of raw.scenes ?? []) for (const nd of sc.nodes ?? []) lines.push({ get: () => nd.say ?? "", set: (v) => (nd.say = v) });
      lines.sort((x, y) => count(y.get()) - count(x.get()));
      for (const ln of lines) {
        if (need <= 0) break;
        const t = ln.get();
        const next = t.replace(/[,;] [^,;]+$/, "").replace(/ (and|so|then|while|because) [^,;]+$/, "").trim();
        if (next !== t && count(next) >= 4) {
          need -= count(t) - count(next);
          ln.set(/[.?!]$/.test(next) ? next : next + ".");
          notes.push("a long line lost its trailing clause");
        }
      }
    }
  }
  return { raw, changed: JSON.stringify(raw) !== JSON.stringify(input), notes };
}

// ---- freshness ------------------------------------------------------------------------------------------------------------------------

const nrm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Pure: every piece of real site text a plan depends on (the card text and what each step must show), with the page it comes from where that is known. */
export function quotesOf(def: ExplainerDef): Array<{ path?: string; text: string; kind: "block" | "shows" | "click" | "field" | "scroll" }> {
  const out: Array<{ path?: string; text: string; kind: "block" | "shows" | "click" | "field" | "scroll" }> = [];
  for (const sc of def.scenes) {
    for (const n of sc.nodes) out.push({ path: n.path, text: n.line, kind: "block" });
    for (const st of sc.tour ?? []) {
      if (st.shows) out.push({ text: st.shows, kind: "shows" });
      if (st.do === "click" && st.text) out.push({ text: st.text, kind: "click" });
      if (st.do === "scroll" && st.text) out.push({ text: st.text, kind: "scroll" });
      if (st.do === "type" && st.field) out.push({ text: st.field, kind: "field" });
    }
  }
  return out;
}

/**
 * Pure: the quotes of a plan that the live site no longer says (a price, a heading, a button that changed). A plan with any of these is stale and is never rendered: the render would only
 * fail on it, after the expensive part. Block text may have been shortened to 90 characters, so a quote matches when it is the start of a block or contains one.
 */
export function staleQuotes(def: ExplainerDef, corpus: Corpus): string[] {
  const out: string[] = [];
  const allBlocks = corpus.pages.flatMap((p) => p.blocks.map((b) => nrm(b.text)));
  const allControls = corpus.pages.flatMap((p) => p.controls.map((c) => ({ t: nrm(c.text), kind: c.kind })));
  for (const q of quotesOf(def)) {
    const t = nrm(q.text);
    if (!t) continue;
    const inBlocks = (list: string[]) => list.some((b) => b === t || b.startsWith(t) || t.startsWith(b) || b.includes(t));
    let ok = false;
    if (q.kind === "block") ok = q.path ? inBlocks(corpus.pages.find((p) => p.path === q.path)?.blocks.map((b) => nrm(b.text)) ?? []) : inBlocks(allBlocks);
    else if (q.kind === "shows" || q.kind === "scroll") ok = inBlocks(allBlocks) || allControls.some((c) => c.t.includes(t) || t.includes(c.t));
    else if (q.kind === "click") ok = allControls.some((c) => c.t === t || c.t.includes(t) || t.includes(c.t));
    else ok = allControls.some((c) => c.kind === "field" && (c.t === t || c.t.includes(t) || t.includes(c.t)));
    if (!ok) out.push(`${q.kind}: "${q.text.slice(0, 70)}"`);
  }
  return [...new Set(out)];
}
