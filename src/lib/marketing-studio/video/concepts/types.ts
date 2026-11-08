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

export type PageDiscovery = {
  path: string;
  url: string;
  title: string;
  /** the page's visible lines, verbatim, de-duplicated */
  lines: string[];
  groups: ProbedGroup[];
  /** internal links with a visible label that look like a call to action */
  ctas: Array<{ text: string; url: string }>;
  discoveredAt: string;
};

export type ClickStep = { control: number; name: string; payoff: string };
export type PlatePlan = {
  id: string;
  path: string;
  groupId: string;
  heading: string;
  /** clicks replayed silently before the two shown clicks, so the page is in the state the probe saw */
  prefix: number[];
  controls: Array<{ index: number; name: string }>;
  clicks: [ClickStep, ClickStep];
};

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
