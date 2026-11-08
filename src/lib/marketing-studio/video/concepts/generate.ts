/**
 * The Product Truth-grounded concept and script generator. Pure and deterministic: no AI, no network, no spend. From what discovery actually saw on the live
 * product (see discover.ts) and the planned angle, it builds the whole concept: hook, audience, problem, payoff, script, capture plan, the exact verbatim
 * claims used, call to action, tone and pacing. Every sentence the voice says about the product is a verbatim line the live page showed after a real click.
 * The result is judged by validate.ts; a concept that fails is rejected and the next variant is tried, up to a limit.
 */
import { BANNED } from "../demo/qa";
import { BANNED_OPENER, BOILERPLATE, DOC_REGISTER, INVITE_VERB, personalityFor, wordCount, type HookStyle, type Personality } from "./standard";
import type { Concept, GateResult, GeneratorInput, PageDiscovery, PlatePlan, ProbedGroup, Step } from "./types";
import { toks, validateConcept } from "./validate";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "is", "it", "your", "you", "with", "that", "this", "how", "what", "do", "does", "can", "from", "by", "as", "are", "be", "s", "i", "we", "our", "my"]);
const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

/** How each kind of real step is introduced, by personality. {c} is the control's or link's own label, or the search term. */
const FRAMES = {
  link: { game: ["Jump into {c}!", "Dive into {c}!"], food_drink: ["Tap into {c}.", "Open {c}."], history_editorial: ["Open {c}.", "Turn to {c}."], public_info: ["Open {c}."], default: ["Open {c}.", "Go to {c}."] } as Record<string, string[]> & { default: string[] },
  search: { game: ["Search {c}!"], food_drink: ["Search {c}.", "Type {c}."], public_info: ["Search {c}."], default: ["Search {c}.", "Type {c}."] } as Record<string, string[]> & { default: string[] },
  scroll: ["Keep going.", "Scroll on.", "And further down."],
};

export const RATE_WPS = 2.55;
/** Seconds a line takes to speak at the personality's pace. */
export const lineSeconds = (words: number, p: Personality) => (words / RATE_WPS + 0.15) / p.pace;

// ---- fragments: the only product sentences the script may say -------------------------------------------------------------------

/** A page sentence the voice can say verbatim: readable aloud, no figures or symbols that are mispronounced, no unsupported wording. */
export function speakable(f: string, prohibited: string[] = []): boolean {
  const t = f.trim();
  if (t.length < 14 || t.length > 110) return false;
  const w = wordCount(t);
  if (w < 3 || w > 18) return false;
  if (/[$%/@&#<>_=+*\\|{}[\]~^]|https?:|www\.|\.com\b/.test(t)) return false;
  if (/\d{3,}/.test(t)) return false;
  if (t === t.toUpperCase()) return false;
  if (BANNED.test(t) || DOC_REGISTER.test(t) || BANNED_OPENER.test(t) || BOILERPLATE.test(t)) return false;
  if (prohibited.some((p) => norm(t).includes(norm(p)))) return false;
  return /[a-z]/.test(t);
}

/** The sentences and phrases of a probe's newly visible text, best first. */
export function fragmentsOf(newText: string, controlNames: string[], angleTokens: Set<string>, prohibited: string[]): string[] {
  const names = new Set(controlNames.map(norm));
  const parts = newText
    .split(" | ")
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => !names.has(norm(s)));
  const ok = [...new Set(parts)].filter((s) => speakable(s, prohibited) && wordCount(s) >= 5);
  return ok.sort((a, b) => {
    const sa = overlap(toks(a), angleTokens) * 3 - Math.abs(a.length - 62) / 20;
    const sb = overlap(toks(b), angleTokens) * 3 - Math.abs(b.length - 62) / 20;
    return sb - sa;
  });
}

/** The part of a verified sentence the voice says: a true leading clause, short enough to land. The claim still cites the whole sentence. */
export function compress(f: string): string {
  const t = f.replace(/\s+/g, " ").trim().replace(/\.+$/, "");
  if (wordCount(t) <= 11) return t;
  const cut = t.search(/[,;:]| - | but /);
  return cut >= 22 ? t.slice(0, cut) : t;
}

/** Strip the closing period so a fragment can sit inside a wrapper; keep ? and !. */
const sentence = (f: string) => (/[.!?]$/.test(f) ? f : `${f}.`);

// ---- plate candidates -------------------------------------------------------------------------------------------------------------

type Cand = { plan: Omit<PlatePlan, "id">; score: number; group: string; from: number; to: number; fragments: [string[], string[]] };

function candidatesFor(g: ProbedGroup, angleTokens: Set<string>, ctaPath: string, input: GeneratorInput, pageLines: string[]): Cand[] {
  const pageText = norm(pageLines.join(" "));
  const visible = (n: string) => pageText.includes(norm(n));
  const used = new Set(input.usedControls.map(norm));
  const nameOf = (idx: number) => g.controls.find((c) => c.index === idx)?.name ?? "";
  const out: Cand[] = [];
  for (let i = 0; i + 1 < g.sequence.length; i++) {
    const a = g.sequence[i];
    const b = g.sequence[i + 1];
    if (a.control === b.control) continue;
    const na = nameOf(a.control);
    const nb = nameOf(b.control);
    if (!na || !nb || used.has(norm(na)) || used.has(norm(nb)) || !visible(na) || !visible(nb)) continue;
    const names = g.controls.map((c) => c.name);
    const fa = fragmentsOf(a.newText, names, angleTokens, input.prohibited);
    const fb = fragmentsOf(b.newText, names, angleTokens, input.prohibited).filter((x) => norm(x) !== norm(fa[0] ?? ""));
    if (!fa.length || !fb.length) continue;
    const rel = overlap(toks(`${g.heading} ${na} ${nb} ${fa[0]} ${fb[0]}`), angleTokens);
    const score = rel * 4 + (g.path === ctaPath ? 3 : 0) + (g.heading ? 1 : 0) - i * 0.2;
    out.push({
      plan: { path: g.path, groupId: g.id, heading: g.heading, prefix: g.sequence.slice(0, i).map((s) => s.control), controls: g.controls, clicks: [{ kind: "click", control: a.control, name: na, payoff: fa[0] }, { kind: "click", control: b.control, name: nb, payoff: fb[0] }] },
      score,
      group: g.id,
      from: i,
      to: i + 1,
      fragments: [fa, fb],
    });
  }
  return out;
}

/** A link's label as the voice says it: the first segment (before a dot separator or a street address), at most six words. */
export function shortLabel(t: string): string {
  const first = t.split(/ · | \| | - |\n/)[0].replace(/\s+/g, " ").trim();
  const words = first.split(" ").filter(Boolean);
  const cut: string[] = [];
  for (const w of words) {
    if (/^\d{3,}$/.test(w) || cut.length >= 6) break;
    cut.push(w);
  }
  return cut.join(" ").replace(/[→>›»]+$/, "").trim();
}

function linkCandidates(d: PageDiscovery, angleTokens: Set<string>, input: GeneratorInput): Cand[] {
  const used = new Set(input.usedControls.map(norm));
  const pageText = norm(d.lines.join(" "));
  const out: Cand[] = [];
  d.links.forEach((l0, i) => {
    const l = { ...l0, text: shortLabel(l0.text) };
    if (wordCount(l.text) < 1 || l.text.length < 3 || BOILERPLATE.test(l.text) || used.has(norm(l.text)) || !pageText.includes(norm(l.text))) return;
    const p1 = fragmentsOf(l.top.join(" | "), [l.text, l.destHeading], angleTokens, input.prohibited);
    const p2 = fragmentsOf(l.lower.join(" | "), [l.text, l.destHeading], angleTokens, input.prohibited).filter((x) => !p1.slice(0, 1).some((y) => norm(y) === norm(x)));
    if (!p1.length || !p2.length) return;
    const rel = overlap(toks(`${l.text} ${l.destHeading} ${p1[0]} ${p2[0]}`), angleTokens);
    out.push({
      plan: { path: d.path, groupId: `link:${l.href}`, heading: l.destHeading || l.text, prefix: [], controls: [], clicks: [{ kind: "link", index: l.index, name: l.text, href: l.href, payoff: p1[0] }, { kind: "scroll", name: `scroll-${d.path}-${i}`, payoff: p2[0] }] },
      score: rel * 4 + 1.5,
      group: `link:${l.href}`,
      from: 0,
      to: 0,
      fragments: [p1, p2],
    });
  });
  return out;
}

function searchCandidates(d: PageDiscovery, angleTokens: Set<string>, input: GeneratorInput): Cand[] {
  const out: Cand[] = [];
  for (const s of d.searches) {
    if (!s.result) continue;
    const p1 = fragmentsOf(s.resultLines.join(" | "), [s.term, s.result.text], angleTokens, input.prohibited);
    const p2 = fragmentsOf(s.result.destLines.join(" | "), [s.term, s.result.text], angleTokens, input.prohibited).filter((x) => !p1.slice(0, 1).some((y) => norm(y) === norm(x)));
    if (!p1.length || !p2.length) continue;
    const rel = overlap(toks(`${s.term} ${s.result.text} ${p1[0]} ${p2[0]}`), angleTokens);
    out.push({
      plan: { path: d.path, groupId: `search:${d.path}:${s.term}`, heading: "Search", prefix: [], controls: [], clicks: [{ kind: "search", input: s.input, name: s.label || "Search", term: s.term, payoff: p1[0] }, { kind: "link", index: -1, name: s.result.text, href: s.result.href, payoff: p2[0] }] },
      score: rel * 4 + 3,
      group: `search:${d.path}:${s.term}`,
      from: 0,
      to: 0,
      fragments: [p1, p2],
    });
  }
  return out;
}

// ---- hooks ------------------------------------------------------------------------------------------------------------------------

function hookCandidates(input: GeneratorInput, p: Personality, plates: PlatePlan[]): Array<{ text: string; style: HookStyle }> {
  const out: Array<{ text: string; style: HookStyle }> = [];
  const push = (text: string, style: HookStyle) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t && !out.some((o) => norm(o.text) === norm(t))) out.push({ text: t, style });
  };
  push(input.angle.hook, p.hookStyles[0]);
  // a question the page itself asks is a real, relatable hook
  for (const pl of plates) for (const c of pl.controls) if (/\?$/.test(c.name) && wordCount(c.name) <= 10) push(c.name, "question");
  // a hook built from what the video shows: the first controls, as the question a viewer arrives with
  const names = plates[0]?.clicks.map((c) => c.name.replace(/[?!.]+$/, "")).filter((n) => wordCount(n) <= 3) ?? [];
  const all3 = plates[0]?.controls.map((c) => c.name).filter((n) => wordCount(n) <= 2 && !n.includes("?")).slice(0, 3) ?? [];
  if (all3.length === 3) push(`Need ${all3[0].toLowerCase()}, ${all3[1].toLowerCase()} or ${all3[2].toLowerCase()}?`, "question");
  void names;
  for (const pl of plates) {
    const st = pl.clicks[0];
    if (st.kind === "search") push(`Looking for ${st.term.toLowerCase()}?`, "question");
    if (st.kind === "link") push(`What is ${st.name.toLowerCase().replace(/[?.!]+$/, "")} really like?`, "curiosity");
  }
  return out;
}

// ---- the concept -------------------------------------------------------------------------------------------------------------------

const hex = (s?: string) => (s && /^#[0-9a-f]{6}$/i.test(s) ? s : /^#[0-9a-f]{3}$/i.test(s ?? "") ? `#${(s as string).slice(1).split("").map((c) => c + c).join("")}` : "#3b5bdb");
const mix = (h: string, to: number, k: number) => {
  const n = parseInt(h.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (to - c) * k));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

/** How a product's name is said aloud: camel case split into words ("MicStage" becomes "Mic Stage"). */
export const spokenName = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\./g, " dot ").trim();
export const spokenHost = (host: string) => `${spokenName(host.replace(/\.[a-z]+$/, "").replace(/^www\./, "").replace(/^[a-z]/, (c) => c.toUpperCase()))} dot ${host.split(".").pop()}`;

/**
 * The call to action is an invitation, which is copy, so its words need not be on the page; its address must be a real page on the product's own site. The
 * planned invitation is used when it is a real invitation, else a link label the product itself shows on a demonstrated page.
 */
function pickCta(input: GeneratorInput, plates: PlatePlan[]): { text: string; url: string; quotePath: string; onPage: boolean } | null {
  const host = new URL(input.home).host.replace(/^www\./, "");
  const pageOf = (p: string) => input.discoveries.find((d) => d.path === p);
  const onSite = (u: string) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.host.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  };
  const platePaths = [...new Set(plates.map((p) => p.path))];
  const real = (t: string) => wordCount(t) >= 2 && INVITE_VERB.test(t) && !BOILERPLATE.test(t) && !DOC_REGISTER.test(t) && !BANNED.test(t);
  const cands: Array<{ text: string; url: string }> = [input.angle.cta];
  for (const p of platePaths) for (const c of pageOf(p)?.ctas ?? []) cands.push(c);
  for (const c of cands) {
    if (!c.text || !onSite(c.url) || !real(c.text)) continue;
    const found = platePaths.find((p) => (pageOf(p)?.lines ?? []).some((l) => norm(l).includes(norm(c.text))));
    return { text: c.text, url: c.url, quotePath: found ?? platePaths[0], onPage: Boolean(found) };
  }
  return null;
}

/** The shortest sentence of each step's candidates, for the tightest cut. */
function shortest(plates: PlatePlan[], pair: Array<{ fragments: [string[], string[]] }>): PlatePlan[] {
  return plates.map((pl, i) => ({ ...pl, clicks: pl.clicks.map((c, ci) => ({ ...c, payoff: [...pair[i].fragments[ci]].slice(0, 4).sort((a, b) => wordCount(a) - wordCount(b))[0] ?? c.payoff })) as [Step, Step] }));
}

export type Attempt = { variant: number; summary: string; reasons: string[] };

/** compact 0 is the full script; 1 trims the second tap's lead-in; 2 also drops the closing reassurance line and picks the shortest sentences. */
export function buildConcept(input: GeneratorInput, plates: PlatePlan[], hook: { text: string; style: HookStyle }, fragIdx: number, compact = 0): Concept | { error: string } {
  const p = personalityFor(input.slug);
  const cta = pickCta(input, plates);
  if (!cta) return { error: "no call to action that is on the demonstrated pages and on the product's own site" };
  const host = new URL(input.home).host.replace(/^www\./, "");
  const display = host;
  const tpl = (arr: string[], i: number) => arr[i % arr.length];
  const marker = (pi: number, ci: number) => `${ci === 0 ? "a" : "b"}${pi + 1}`;
  const narration: Concept["narration"] = [];
  const claims: Concept["claims"] = [];
  const facts: Concept["facts"] = [];
  const claimsUsed: Concept["claimsUsed"] = [];
  const onScreen: Concept["onScreen"] = [];
  const sceneMeta: Concept["sceneMeta"] = {};
  const headlines: Record<string, string> = {};
  const payoff: string[] = [];
  let n = 0;
  const line = (sceneId: string, spoken: string, claimIds: string[], caption?: string) => {
    n++;
    narration.push({ id: `L${n}`, sceneId, spoken, ...(caption ? { caption } : {}), claims: claimIds });
  };
  plates.forEach((pl, pi) => {
    const plateId = pl.id;
    const sceneId = `a${pi + 1}`;
    const ctx = `c-ctx${pi + 1}`;
    const ctxFact = pl.heading && pl.heading.length >= 4 ? pl.heading : pl.clicks[0].name;
    facts.push({ plate: plateId, value: ctxFact });
    claims.push({ id: ctx, text: `The product has a "${ctxFact}" area, shown with: ${pl.clicks.map((c) => c.name).join(" and ")}.`, facts: [ctxFact], sources: [{ plate: plateId, quote: ctxFact }, ...pl.clicks.filter((c) => c.kind === "click" || c.kind === "link").map((c) => ({ plate: plateId, quote: c.name }))] });
    claimsUsed.push({ id: ctx, text: `area: ${ctxFact}`, quote: ctxFact, path: pl.path });
    if (pi === 0) line(sceneId, hook.text, [ctx]);
    pl.clicks.forEach((c, ci) => {
      const id = `c-pay${pi + 1}${ci === 0 ? "a" : "b"}`;
      const frag = c.payoff;
      facts.push({ plate: plateId, value: frag });
      claims.push({ id, text: `After ${c.kind === "scroll" ? "scrolling" : c.kind === "search" ? `searching "${c.term}"` : `opening "${c.name}"`} the page shows: ${frag}`, facts: [frag], sources: [{ plate: plateId, quote: frag }, ...(c.kind === "click" || c.kind === "link" ? [{ plate: plateId, quote: c.name }] : [])] });
      claimsUsed.push({ id, text: `after "${c.name}"`, quote: frag, path: pl.path });
      payoff.push(frag);
      const k = pi * 2 + ci + fragIdx;
      const asks = c.kind === "click" && c.name.endsWith("?");
      const label = c.kind === "search" ? c.term : c.name.replace(/[?!.]+$/, "") + (asks ? "?" : "");
      const frames = asks ? ["Ask {c}"] : c.kind === "link" ? FRAMES.link[p.id] ?? FRAMES.link.default : c.kind === "search" ? FRAMES.search[p.id] ?? FRAMES.search.default : c.kind === "scroll" ? FRAMES.scroll : p.action;
      const act0 = tpl(frames, k);
      const act = compact >= 1 && ci === 1 && c.kind === "click" ? "{c}" : act0;
      const actText = c.kind === "scroll" ? `{${marker(pi, ci)}}${act}` : act.replace("{c}", `{${marker(pi, ci)}}${label}`);
      const pay = tpl(p.payoff, k).replace("{f}", sentence(compress(frag)));
      line(sceneId, `${/[.!?]$/.test(actText) ? actText : `${actText}.`} ${pay}`, [ctx, id]);
      if (c.kind === "click" || c.kind === "link") onScreen.push({ sceneId, kind: "label", text: c.name, claim: ctx });
    });
    if (pi === plates.length - 1 && compact < 2) line(sceneId, tpl(p.whyLine, fragIdx), [ctx]);
    const head = pi === 0 && wordCount(hook.text) <= 7 ? hook.text : pl.heading || pl.clicks[0].name;
    headlines[sceneId] = head;
    onScreen.unshift({ sceneId, kind: "headline", text: head, claim: ctx });
    sceneMeta[sceneId] = {
      plate: plateId,
      purpose: pi === 0 ? `Hook and first payoff: ${hook.text}` : `Second payoff: ${pl.clicks.map((c) => c.name).join(" then ")}`,
      motion: [pl.clicks[0].kind === "search" ? "the real search box is used" : "touch cursor taps the real control", "the live page changes in front of you", "camera pushes in on the result", "focus highlight on the control and its result", "headline springs in and out"],
      note: `Real states of ${input.origin}${pl.path}, captured by really using it: ${pl.clicks.map((c) => c.name).join(", ")}.`,
    };
  });
  const ctaClaim = "c-cta";
  const first = plates[0];
  const ctaPlate = plates.find((x) => x.path === cta.quotePath) ?? first;
  // an invitation claims nothing: when its words are not on the page the claim rests on what the first plate shows, and the address is on the product's own site
  const ctaQuote = cta.onPage ? cta.text : first.heading || first.clicks[0].name;
  facts.push({ plate: ctaPlate.id, value: ctaQuote });
  claims.push({ id: ctaClaim, text: cta.onPage ? `The product's own page offers "${cta.text}".` : `The invitation leads to ${cta.url} on the product's own site, which shows "${ctaQuote}".`, facts: [ctaQuote], sources: [{ plate: ctaPlate.id, quote: ctaQuote }] });
  claimsUsed.push({ id: ctaClaim, text: "call to action", quote: ctaQuote, path: cta.quotePath });
  const ctaWord = tpl(p.cta, fragIdx);
  line("end", `${ctaWord}, at ${spokenHost(host)}.`, [ctaClaim], `${ctaWord}, at ${display}.`);
  const endHeadline = `${ctaWord}.`;
  onScreen.push({ sceneId: "end", kind: "headline", text: endHeadline, claim: ctaClaim }, { sceneId: "end", kind: "cta", text: cta.text, claim: ctaClaim });
  sceneMeta.end = { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses", "music resolves"], note: "Branded end card; no product screen is claimed." };
  headlines.end = endHeadline;

  // timing estimate
  const words = narration.map((l) => wordCount((l.caption ?? l.spoken).replace(/\{[a-z0-9]+\}/g, "")));
  const secs = words.map((w) => lineSeconds(w, p));
  let t = 0.3;
  const starts: number[] = [];
  narration.forEach((l, i) => {
    if (i > 0) t += (l.sceneId === narration[i - 1].sceneId ? p.gaps.same : l.sceneId === "end" ? p.gaps.endLead : p.gaps.scene) / 1000;
    starts.push(t);
    t += secs[i];
  });
  const total = t + 1.5;
  const l2 = narration[1];
  const beforeMarker = wordCount(l2.spoken.split(/\{a1\}/)[0].replace(/\{[a-z0-9]+\}/g, ""));
  const estFirstTapMs = Math.round((starts[1] + beforeMarker / RATE_WPS / p.pace) * 1000);

  const primary = hex(input.brand.primary);
  const concept: Concept = {
    version: 1,
    specId: input.specId,
    slug: input.slug,
    productName: input.productName,
    variant: input.variant,
    angle: { id: input.angle.id, role: input.angle.role, title: input.angle.title, funnel: input.angle.funnel },
    personality: p.id,
    hookStyle: hook.style,
    hook: hook.text,
    audience: input.angle.audience,
    problem: input.angle.goal,
    payoff,
    whyItMatters: input.angle.coreBenefit,
    tone: p.tone,
    pacing: `${p.pace}x voice, ${p.gaps.same}/${p.gaps.scene} ms line gaps, ${p.music.bpm} bpm music, zoom ${p.zoom.rest} to ${p.zoom.tap}`,
    structure: p.structure,
    cta: { text: cta.text, url: cta.url, display },
    capturePlan: plates,
    claimsUsed,
    title: `${input.productName}: ${input.angle.title.replace(/^[^:]*:\s*/, "")}`,
    narration,
    claims,
    facts,
    onScreen,
    sceneMeta,
    headlines,
    brand: { name: input.productName, accent: primary, dark: mix(primary, 0, 0.72), light: "#faf7f2" },
    origin: input.origin,
    ctaHost: host,
    estSeconds: Math.round(total * 10) / 10,
    estFirstTapMs,
  };
  return concept;
}

/**
 * Generates, validates and (when a gate fails) regenerates: every variant is a different combination of demonstrations, hook and wording. Returns the first
 * concept that passes every gate, with the rejected attempts, or no concept and the reasons the angle cannot be made well from this product.
 */
export function generateConcept(input: GeneratorInput, maxVariants = 16, want = 3): { concept?: Concept; alternates: Concept[]; attempts: Attempt[] } {
  const p = personalityFor(input.slug);
  const angleTokens = toks(`${input.angle.title} ${input.angle.goal} ${input.angle.features.join(" ")} ${input.angle.scenes.join(" ")} ${input.angle.hook} ${input.angle.coreBenefit}`);
  const ctaPath = (() => {
    try {
      return new URL(input.angle.cta.url).pathname || "/";
    } catch {
      return "/";
    }
  })();
  const all: Cand[] = input.discoveries.flatMap((d: PageDiscovery) => [...d.groups.flatMap((g) => candidatesFor(g, angleTokens, ctaPath, input, d.lines)), ...linkCandidates(d, angleTokens, input), ...searchCandidates(d, angleTokens, input)]).sort((a, b) => b.score - a.score);
  const attempts: Attempt[] = [];
  if (!all.length) return { alternates: [], attempts: [{ variant: input.variant, summary: "no demonstration", reasons: ["the product's public pages have no in-page control that, when used, visibly shows something new: it cannot be demonstrated with real interaction"] }] };
  // pairs of demonstrations from different groups, or from non-overlapping steps of one group
  const pairs: Array<[Cand, Cand]> = [];
  for (const a of all)
    for (const b of all) {
      if (a === b) continue;
      if (a.group === b.group && !(b.from > a.to)) continue;
      if (a.plan.clicks.some((c) => b.plan.clicks.some((d) => norm(c.name) === norm(d.name) || norm(c.payoff) === norm(d.payoff)))) continue;
      pairs.push([a, b]);
    }
  pairs.sort((x, y) => y[0].score + y[1].score - (x[0].score + x[1].score));
  const seen = new Set<string>();
  const uniq = pairs.filter(([a, b]) => {
    const k = `${a.group}:${a.from}|${b.group}:${b.from}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  if (!uniq.length) return { alternates: [], attempts: [{ variant: input.variant, summary: "one demonstration only", reasons: ["only one interactive area was found; two distinct real interactions are needed, so this concept needs another verified angle"] }] };

  const passed: Concept[] = [];
  let v = input.variant;
  for (let tries = 0; tries < maxVariants; tries++, v++) {
    const pair = uniq[Math.floor(v / 4) % uniq.length];
    const plates: PlatePlan[] = pair.map((c, i) => ({ ...c.plan, id: `p${i + 1}` }));
    const hooks = hookCandidates(input, p, plates);
    const hook = hooks[v % Math.max(1, hooks.length)];
    if (!hook) {
      attempts.push({ variant: v, summary: "no hook", reasons: ["no usable hook"] });
      continue;
    }
    // alternate fragments (a second best sentence) on later passes through the same pair
    const alt = Math.floor(v / (4 * uniq.length)) % 2;
    const swapped: PlatePlan[] = plates.map((pl, i) => {
      const frs = pair[i].fragments;
      const clicks = pl.clicks.map((c, ci) => ({ ...c, payoff: frs[ci][alt] ?? frs[ci][0] })) as [Step, Step];
      return { ...pl, clicks };
    });
    let built: Concept | undefined;
    let gate: GateResult = { ok: false, checks: [], reasons: [] };
    let error = "";
    for (let compact = 0; compact < 3; compact++) {
      const trial = buildConcept({ ...input, variant: v }, compact >= 2 ? shortest(swapped, pair) : swapped, hook, v, compact);
      if ("error" in trial) {
        error = trial.error;
        break;
      }
      const g2 = validateConcept(trial, input);
      built = trial;
      gate = g2;
      if (g2.ok) break;
    }
    if (!built) {
      attempts.push({ variant: v, summary: "no call to action", reasons: [error] });
      continue;
    }
    built.gate = { ok: gate.ok, checks: gate.checks };
    const summary = `${swapped.map((x) => x.clicks.map((c) => c.name).join("/")).join(" + ")}; hook "${hook.text}"`;
    if (gate.ok) {
      attempts.push({ variant: v, summary, reasons: [] });
      // a variant that only re-words the same demonstrations is not a real alternate
      if (!passed.some((x) => x.hook === built.hook || x.payoff.join() === built.payoff.join())) passed.push(built);
      if (passed.length >= want) break;
      continue;
    }
    attempts.push({ variant: v, summary, reasons: gate.reasons });
  }
  return { concept: passed[0], alternates: passed.slice(1), attempts };
}

