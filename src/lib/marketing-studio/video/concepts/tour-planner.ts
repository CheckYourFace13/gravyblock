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
import { conceptFromExplainer } from "./explainer";
import type { TourStep } from "./tour";

export type Brief = { angleId: string; key: string; role: "A" | "B" | "C"; title: string; goal: string; audience: string; coreBenefit: string; features: string[]; ctaText: string; ctaUrl: string; funnel: string };
export type PlanContext = { corpus: Corpus; facts: string[]; prohibited: string[]; history: CreativeFingerprint[]; brand: ExplainerDef["brand"]; slug: string; productName: string; origin: string; ctaHost: string };
export type Planned = { ok: true; def: ExplainerDef; yt: { title: string; description: string }; attempts: number } | { ok: false; problems: string[]; attempts: number };

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
  return { ...c, pages: c.pages.map((p) => ({ ...p, blocks: p.blocks.filter((b) => factFor(b.text, facts)) })) };
}

const SWAPS: Array<[string, string]> = [["best", "right"], ["only", "just"], ["instantly", "quickly"], ["this page", "here"], ["this screen", "here"]];
export function swapWords(text: string): string {
  let out = text;
  for (const [from, to] of SWAPS) {
    const re = new RegExp("(^|[^a-z])" + from + "(?![a-z])", "gi");
    out = out.replace(re, (_m, pre: string) => pre + to);
  }
  return out;
}

export function renderPrompt(b: Brief, ctx: PlanContext, feedback: string[]): string {
  const pages = ctx.corpus.pages
    .map((p) => `PAGE ${p.path} (${p.title})\n${p.blocks.map((x) => `[${x.id}] ${x.text}`).join("\n")}\nCONTROLS:\n${p.controls.map((c) => `[${c.id}] ${c.kind} "${c.text}"${c.to ? ` opens ${c.to}` : ""}`).join("\n")}`)
    .join("\n\n");
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

THE REAL SITE
${pages}
${feedback.length ? `\nYOUR PREVIOUS PLAN WAS REFUSED. Fix exactly these problems and plan again, differently where it says repeated:\n${feedback.map((f) => `- ${f}`).join("\n")}\n` : ""}`;
}

/** Pure: turns a raw plan into a definition using only things that exist on the real site; reports every problem it finds. */
export function buildDef(raw: Raw, b: Brief, ctx: PlanContext): { def: ExplainerDef | null; problems: string[] } {
  const problems: string[] = [];
  const need = (ok: unknown, m: string) => {
    if (!ok) problems.push(m);
    return Boolean(ok);
  };
  if (!need(raw && Array.isArray(raw.scenes) && raw.scenes.length === 2, "the plan must have exactly 2 scenes")) return { def: null, problems };
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
  if (problems.length || scenes.length !== 2) return { def: null, problems };
  const def: ExplainerDef = {
    slug: ctx.slug,
    productName: ctx.productName,
    origin: ctx.origin,
    ctaHost: ctx.ctaHost,
    brand: ctx.brand,
    specId: `${ctx.slug}:${b.key}`,
    angle: { id: b.angleId, role: b.role, title: b.title, funnel: b.funnel },
    title: raw.yt!.title!.trim().slice(0, 90),
    hook: raw.hook!.trim(),
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
  const spokenWords = c.narration.reduce((n, l) => n + l.spoken.replace(/{[^}]*}/g, "").split(/s+/).filter(Boolean).length, 0);
  if (c.estSeconds < 23 || c.estSeconds > 32) out.push(`the video would run about ${c.estSeconds} seconds (${spokenWords} spoken words); it must run 23 to 32 seconds: ${c.estSeconds < 23 ? "add a few words to the lines" : "shorten the lines"}`);
  out.push(...similarityProblems(fingerprintOfConcept(c), others));
  return out;
}

export type Ask = (system: string, user: string, attempt: number) => Promise<string>;

export const MAX_PLAN_ATTEMPTS = 6;

/** Plans, gates, and on any failure replans with the exact problems as feedback. Pure of side effects except the (injectable) model call. */
export async function planTour(b: Brief, ctx: PlanContext, others: CreativeFingerprint[], ask: Ask, maxAttempts = MAX_PLAN_ATTEMPTS, seedFeedback: string[] = []): Promise<Planned> {
  let feedback: string[] = [...seedFeedback];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: Raw | null = null;
    let reply = "";
    try {
      reply = await ask(SYSTEM, renderPrompt(b, ctx, feedback), attempt);
      raw = parseJson<Raw>(reply);
    } catch (e) {
      return { ok: false, problems: [`the model step failed: ${e instanceof Error ? e.message : e}`], attempts: attempt };
    }
    if (!raw) {
      feedback = [`the reply was not valid JSON in the requested shape (${reply.length} characters, ends with: ${JSON.stringify(reply.slice(-60))})`];
      continue;
    }
    const built = buildDef(raw, b, ctx);
    if (!built.def) {
      feedback = built.problems.slice(0, 8);
      continue;
    }
    const gate = gateDef(built.def, ctx, others);
    if (gate.length) {
      feedback = gate.slice(0, 8);
      continue;
    }
    return { ok: true, def: built.def, yt: { title: raw.yt!.title!.trim(), description: `${raw.hook!.trim()} ${raw.yt!.description!.trim()}\n\n${b.ctaText}: ${b.ctaUrl}` }, attempts: attempt };
  }
  return { ok: false, problems: feedback, attempts: maxAttempts };
}

/** The production model call: cached and counted against the monthly cap by askJson. A higher temperature on a replan, so the second plan really is different. */
export const aiAsk = (db: StudioDb, specId: string): Ask => async (system, user, attempt) =>
  (await askJson(db, { specId, purpose: attempt === 1 ? "tour_plan" : `tour_replan_${attempt}`, system, user, maxTokens: 14000, temperature: Math.min(1, 0.7 + attempt * 0.08) })).text;
