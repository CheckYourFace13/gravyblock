import type { Rect } from "../demo/types";
import type { DesirabilityCheck, PersonalityId } from "./standard";

/** One real, safe, in-page control group found on a live product page (tabs, accordion, filter chips, a toggle), probed by actually clicking it. */
export type ProbedGroup = {
  id: string;
  path: string;
  /** the nearest heading above the controls, verbatim */
  heading: string;
  /** the controls in page order, as the capture will find them again: the index in the page's candidate list and the label */
  controls: Array<{ index: number; name: string }>;
  /** the clicks the probe made, in order, with what the page newly showed after each (lines that were not there before) */
  sequence: Array<{ control: number; newText: string }>;
};

/** A live calculator or read-only form: fields the viewer fills in and a result that changes, probed by really changing the inputs (nothing is submitted). */
export type ProbedCalc = {
  id: string;
  path: string;
  heading: string;
  fields: Array<{ index: number; label: string; type: string; value: string; options?: string[] }>;
  /** the changes made, cumulatively and in order, with the lines the page newly showed after each */
  steps: Array<{ field: number; name: string; value: string; select?: boolean; newText: string }>;
};

export type PageDiscovery = {
  path: string;
  url: string;
  title: string;
  /** the page's visible lines, verbatim, de-duplicated */
  lines: string[];
  groups: ProbedGroup[];
  links: ProbedLink[];
  searches: ProbedSearch[];
  /** calculators and read-only forms found on the page (absent in discoveries stored before they were supported) */
  calcs?: ProbedCalc[];
  /** internal links with a visible label that look like a call to action */
  ctas: Array<{ text: string; url: string }>;
  discoveredAt: string;
};

/** One real, read-only thing a viewer sees done on the live product. `payoff` is the page text that supports what the copy says about it. */
export type Step = (
  | { kind: "click"; control: number; name: string; payoff: string }
  | { kind: "link"; index: number; name: string; href: string; payoff: string }
  | { kind: "search"; input: number; name: string; term: string; payoff: string }
  | { kind: "scroll"; name: string; payoff: string }
  /** typing a demonstration value into a field of a live calculator, or choosing an option; the result updates in place */
  | { kind: "fill"; field: number; name: string; value: string; select?: boolean; payoff: string }
) & { /** what the focus label says when it must differ from the page's own control name (for example a spelled-out weekday) */ display?: string };
export type ClickStep = Step;
export type PlatePlan = {
  id: string;
  path: string;
  /** click plates: the control group and the clicks replayed silently before the shown ones */
  groupId: string;
  heading: string;
  prefix: number[];
  controls: Array<{ index: number; name: string }>;
  /** two steps, three states: before, after the first step, after the second */
  clicks: [Step, Step];
  /** fill plates: the earlier changes of the same calculator, replayed silently first */
  prefixFills?: Array<{ field: number; name: string; value: string; select?: boolean }>;
};

/** A search box probed by really searching (GET only). */
export type ProbedSearch = { input: number; label: string; term: string; resultUrl: string; resultLines: string[]; /** first result link on the results page */ result?: { text: string; href: string; destLines: string[] } };
/** An internal link probed by really opening it. */
export type ProbedLink = { index: number; text: string; href: string; destTitle: string; destHeading: string; /** the destination's first visible lines, then the lines further down */ top: string[]; lower: string[] };

export type Concept = {
  version: 1;
  specId: string;
  slug: string;
  productName: string;
  /** which variant of the generator produced it (the next one is tried when this one fails a gate) */
  variant: number;
  angle: { id: string; role: "A" | "B" | "C"; title: string; funnel: string };
  personality: PersonalityId;
  hookStyle: string;
  // ---- what the owner is shown ----
  hook: string;
  audience: string;
  problem: string;
  payoff: string[];
  whyItMatters: string;
  tone: string;
  pacing: string;
  structure: string;
  cta: { text: string; url: string; display: string };
  /** the real interaction path: hook, page, interaction, result, next scene, call to action */
  capturePlan: PlatePlan[];
  /** the verbatim page text every claim rests on */
  claimsUsed: Array<{ id: string; text: string; quote: string; path: string }>;
  // ---- what the renderer is given ----
  title: string;
  narration: Array<{ id: string; sceneId: string; spoken: string; caption?: string; claims: string[] }>;
  claims: Array<{ id: string; text: string; facts: string[]; sources: Array<{ plate: string; quote: string }> }>;
  facts: Array<{ plate: string; value: string }>;
  onScreen: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }>;
  sceneMeta: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }>;
  headlines: Record<string, string>;
  brand: { name: string; accent: string; dark: string; light: string };
  origin: string;
  ctaHost: string;
  /** estimated length, seconds */
  estSeconds: number;
  /** estimated time of the first tap, ms */
  estFirstTapMs: number;
  gate?: { ok: boolean; checks: DesirabilityCheck[] };
  /** set for a PRODUCT EXPLAINER / WORKFLOW VISUALIZATION: the steps shown as animated cards instead of live clicks (see explainer.ts) */
  explainer?: { scenes: Array<{ heading: string; nodes: [{ step: string; line: string; say: string; path?: string; fact: string }, { step: string; line: string; say: string; path?: string; fact: string }, { step: string; line: string; say: string; path?: string; fact: string }] }> };
  /** owner edit: a larger value zooms the camera closer in every scene, a smaller one wider (0 = the personality default) */
  zoomBias?: number;
  /** owner edit: extra hold (ms) on the closing frame when a revision came out shorter than the 20s minimum */
  gapExtraMs?: number;
  /** self-healing: multiplies the pauses between spoken lines (below 1 tightens a video that had dead air) */
  gapScale?: number;
  /** present when the copy was written by the language-model step (and passed the deterministic gates and the fact-checker) */
  ai?: { model: string; copy: Record<string, unknown> };
};

export type GeneratorInput = {
  specId: string;
  slug: string;
  productName: string;
  origin: string;
  home: string;
  brand: { primary?: string };
  angle: { id: string; role: "A" | "B" | "C"; title: string; hook: string; goal: string; audience: string; coreBenefit: string; features: string[]; scenes: string[]; cta: { text: string; url: string }; funnel: string };
  discoveries: PageDiscovery[];
  /** Product Truth: the verified facts' text, and what the product must never claim */
  verifiedFacts: string[];
  prohibited: string[];
  /** hooks already used by this product's other videos and by other products (their first two words are not reused) */
  takenHooks: string[];
  /** the product's other consumed angles, for the duplicate gate */
  consumed: Array<{ id: string; slug: string; role: "A" | "B" | "C"; title: string; hook: string; goal: string; coreBenefit: string; features: string[]; scenes: string[]; cta: { text: string; url: string }; status: string }>;
  /** control labels already shown by this product's other videos, so a new video demonstrates something else */
  usedControls: string[];
  variant: number;
};

export type GateResult = { ok: boolean; checks: DesirabilityCheck[]; reasons: string[] };

export type CaptureRects = Record<string, Rect>;
