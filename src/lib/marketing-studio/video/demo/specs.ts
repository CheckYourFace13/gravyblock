/**
 * Demo video specs. RentalNoodle is the owner-approved reference; every other product's demo must meet or exceed it (real interaction with the
 * product, real motion, claims tied to verified facts and live page quotes). Adding a product means writing one spec: a capture of its real
 * public interface, a script with sources, and a timeline. The old slideshow pipeline is not an option for production video.
 */
import { captureDrinkKnirdPlates, DK_ORIGIN } from "./drinkknird-plates";
import { DK_CLAIMS, DK_CTA, DK_FACTS, DK_NARRATION, DK_ON_SCREEN, DK_SCENE_META, DK_TITLE, dkBuildTimeline, dkLayoutLines, type BuiltDkDemo } from "./drinkknird";
import { capturePlates } from "./plates";
import { buildTimeline, CLAIMS, CTA, DEMO_FACTS, layoutLines, NARRATION, ON_SCREEN, SCENE_META, TITLE, type LineTime } from "./rentalnoodle";
import type { Claim, Manifest, NarrationLine } from "./types";

export type DemoSpec = {
  slug: string;
  productName: string;
  site: { origin: string; ctaText: string; ctaHost: string };
  title: string;
  cta: { text: string; url: string; display: string };
  narration: NarrationLine[];
  claims: Claim[];
  facts: Array<{ plate: string; value: string }>;
  onScreen: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }>;
  sceneMeta: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }>;
  capture: (outDir: string, logoFile: string) => Promise<Manifest>;
  layout: (durMs: Record<string, number>) => Record<string, LineTime>;
  build: (manifest: Manifest, lt: Record<string, LineTime>) => BuiltDkDemo;
};

export const DEMO_SPECS: Record<string, DemoSpec> = {
  rentalnoodle: {
    slug: "rentalnoodle",
    productName: "RentalNoodle",
    site: { origin: "https://rentalnoodle.com", ctaText: CTA.text, ctaHost: "rentalnoodle.com" },
    title: TITLE,
    cta: CTA,
    narration: NARRATION,
    claims: CLAIMS,
    facts: DEMO_FACTS,
    onScreen: ON_SCREEN,
    sceneMeta: SCENE_META,
    capture: capturePlates,
    layout: layoutLines,
    build: buildTimeline,
  },
  drinkknird: {
    slug: "drinkknird",
    productName: "DrinkKnird",
    site: { origin: DK_ORIGIN, ctaText: DK_CTA.text, ctaHost: "drinkknird.com" },
    title: DK_TITLE,
    cta: DK_CTA,
    narration: DK_NARRATION,
    claims: DK_CLAIMS,
    facts: DK_FACTS,
    onScreen: DK_ON_SCREEN,
    sceneMeta: DK_SCENE_META,
    capture: captureDrinkKnirdPlates,
    layout: dkLayoutLines,
    build: dkBuildTimeline,
  },
};

export function demoSpecFor(slug: string): DemoSpec {
  const s = DEMO_SPECS[slug];
  if (!s) throw new Error(`No demo video spec for "${slug}". Products without real captured interaction stay TEASER_ONLY.`);
  return s;
}
