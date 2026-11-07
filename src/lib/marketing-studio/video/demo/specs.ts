/**
 * Demo video specs. RentalNoodle is the owner-approved reference; every other product's demo must meet or exceed it (real interaction with the
 * product, real motion, claims tied to verified facts and live page quotes). Adding a product means writing one spec: a capture of its real
 * public interface, a script with sources, and a timeline. The old slideshow pipeline is not an option for production video.
 */
import { captureSendFablePlates, SF_ORIGIN } from "./sendfable-capture";
import { SF_CLAIMS, SF_CTA, SF_FACTS, SF_NARRATION, SF_ON_SCREEN, SF_SCENE_META, SF_TITLE, sfBuildTimeline, sfLayoutLines } from "./sendfable";
import { captureDrinkKnirdPlates, DK_ORIGIN } from "./drinkknird-plates";
import { captureScribbleZapPlates, SZ_ORIGIN } from "./scribblezap-capture";
import { captureMibblePlates, MB_ORIGIN } from "./mibble-capture";
import { MB_CLAIMS, MB_CTA, MB_FACTS, MB_NARRATION, MB_ON_SCREEN, MB_SCENE_META, MB_TITLE, mbBuildTimeline, mbLayoutLines } from "./mibble";
import { SZ_CLAIMS, SZ_CTA, SZ_FACTS, SZ_NARRATION, SZ_ON_SCREEN, SZ_SCENE_META, SZ_TITLE, szBuildTimeline, szLayoutLines } from "./scribblezap";
import type { DemoQaInput } from "./qa";
import { DK_CLAIMS, DK_CTA, DK_FACTS, DK_NARRATION, DK_ON_SCREEN, DK_SCENE_META, DK_TITLE, dkBuildTimeline, dkLayoutLines, type BuiltDkDemo } from "./drinkknird";
import { capturePlates } from "./plates";
import { buildTimeline, CLAIMS, CTA, DEMO_FACTS, layoutLines, NARRATION, ON_SCREEN, SCENE_META, TITLE, type LineTime } from "./rentalnoodle";
import type { Claim, Manifest, NarrationLine } from "./types";

export type DemoSpec = {
  slug: string;
  productName: string;
  site: { origin: string; ctaText: string; ctaHost: string; /** extra origins the CTA may point to (a live store listing) */ ctaOrigins?: string[] };
  title: string;
  cta: { text: string; url: string; display: string };
  narration: NarrationLine[];
  claims: Claim[];
  facts: Array<{ plate: string; value: string; kind?: "asset_metadata" }>;
  onScreen: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }>;
  sceneMeta: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }>;
  capture: (outDir: string, logoFile: string) => Promise<Manifest>;
  layout: (durMs: Record<string, number>) => Record<string, LineTime>;
  build: (manifest: Manifest, lt: Record<string, LineTime>) => BuiltDkDemo;
  /** Games are held to the fun-first creative-language QA and may not use a pre-launch CTA once a verified store listing is live. */
  kind?: "game";
  /** Extra QA inputs for products whose primary visual is real gameplay. */
  qaExtra?: (manifest: Manifest) => Pick<DemoQaInput, "interaction" | "gameplay">;
};

export const DEMO_SPECS: Record<string, DemoSpec> = {
  sendfable: {
    slug: "sendfable",
    productName: "SendFable",
    site: { origin: SF_ORIGIN, ctaText: SF_CTA.text, ctaHost: "sendfable.com" },
    title: SF_TITLE,
    cta: SF_CTA,
    narration: SF_NARRATION,
    claims: SF_CLAIMS,
    facts: SF_FACTS,
    onScreen: SF_ON_SCREEN,
    sceneMeta: SF_SCENE_META,
    capture: captureSendFablePlates,
    layout: sfLayoutLines,
    build: sfBuildTimeline,
  },
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
  mibblemeadow: {
    kind: "game",
    slug: "mibblemeadow",
    productName: "Mibble Meadow",
    site: { origin: MB_ORIGIN, ctaText: MB_CTA.text, ctaHost: "iscream studio" },
    title: MB_TITLE,
    cta: MB_CTA,
    narration: MB_NARRATION,
    claims: MB_CLAIMS,
    facts: MB_FACTS,
    onScreen: MB_ON_SCREEN,
    sceneMeta: MB_SCENE_META,
    capture: captureMibblePlates,
    layout: mbLayoutLines,
    build: mbBuildTimeline,
    qaExtra: (m) => {
      const g = m.gameplay;
      if (!g) return {};
      return {
        interaction: { ok: g.windows.length >= 3 && g.levelsCleared >= 1, detail: `real gameplay of the game's own project files, played by real taps, a swipe and double-taps: ${g.windows.length} windows from ${g.levelsCleared} solved levels; nothing drawn or synthesised` },
        gameplay: { minFps: 30, frameExact: true, hudEvents: g.hudEvents, levelsCleared: g.levelsCleared, windows: g.windows.length },
      };
    },
  },
  scribblezap: {
    kind: "game",
    slug: "scribblezap",
    productName: "ScribbleZap",
    site: { origin: SZ_ORIGIN, ctaText: SZ_CTA.text, ctaHost: "scribblezap" },
    title: SZ_TITLE,
    cta: SZ_CTA,
    narration: SZ_NARRATION,
    claims: SZ_CLAIMS,
    facts: SZ_FACTS,
    onScreen: SZ_ON_SCREEN,
    sceneMeta: SZ_SCENE_META,
    capture: captureScribbleZapPlates,
    layout: szLayoutLines,
    build: szBuildTimeline,
    qaExtra: (m) => {
      const g = m.gameplay;
      if (!g) return {};
      // smoothness is measured where the game is moving; windows that are mostly a still card (unlock, home) have no active seconds
      const moving = g.windows.filter((w) => w.capturedFps > 0);
      const fps = moving.length ? Math.min(...moving.map((w) => w.capturedFps)) : 0;
      return {
        interaction: { ok: g.windows.length >= 3 && g.levelsCleared >= 1, detail: `real gameplay from the game's own tester, played by scripted touch input: ${g.windows.length} windows from ${g.levelsCleared} cleared level(s); nothing drawn or synthesised` },
        gameplay: { minFps: fps, hudEvents: g.hudEvents, levelsCleared: g.levelsCleared, windows: g.windows.length },
      };
    },
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
