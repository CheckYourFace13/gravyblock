/**
 * Automatic launch state for game creative. A game spec is written for the pre-launch phase (an invitation CTA, never "coming soon"). Whenever
 * Product Truth holds a verified live store destination, `specForLaunchState` returns the same spec with a live install CTA aimed at that
 * destination, so nobody edits a spec when a game becomes downloadable. Product Truth is the only authority; nothing here guesses.
 */
import { gameCtaPhase, storeDestination, type StoreDestination } from "./language-qa";
import type { DemoSpec } from "./specs";

export type LaunchPhase = "pre_launch" | "store_live";
type Facts = Array<{ value: string; verified: boolean }>;

const STORE = {
  google_play: { button: "Get it on Google Play", host: "google play", display: "Google Play" },
  app_store: { button: "Download on the App Store", host: "app store", display: "the App Store" },
} as const;

/** The call to action for a live game, built from the verified destination alone. */
export function liveCta(dest: StoreDestination) {
  const s = STORE[dest.store];
  return {
    cta: { text: s.button, url: dest.url, display: s.display },
    spoken: `Ready to play? ${dest.store === "google_play" ? "Get it on Google Play." : "Get it on the App Store."}`,
    caption: `Ready to play? ${dest.store === "google_play" ? "Get it on Google Play." : "Get it on the App Store."}`,
    ctaHost: s.host,
  };
}

export function launchPhase(facts: Facts): LaunchPhase {
  return gameCtaPhase(facts);
}

/** Pre-launch specs pass through unchanged; once the game is live the closing line, end card, CTA and QA expectations switch to the install CTA. */
export function specForLaunchState(spec: DemoSpec, facts: Facts): DemoSpec {
  if (spec.kind !== "game") return spec;
  const dest = storeDestination(facts);
  if (!dest) return spec;
  const live = liveCta(dest);
  const lastLine = spec.narration[spec.narration.length - 1];
  // pre-launch facts ("Coming Soon") stop being true on launch: they are dropped along with any claim that rested on them
  const isPre = (v: string) => /coming soon/i.test(v);
  const claim = { id: "c-store", text: `The game is listed on ${live.cta.display}.`, facts: [dest.url], sources: [] as DemoSpec["claims"][number]["sources"] };
  return {
    ...spec,
    cta: live.cta,
    site: { ...spec.site, ctaText: live.cta.text, ctaHost: live.ctaHost, ctaOrigins: [new URL(dest.url).origin] },
    narration: [...spec.narration.slice(0, -1), { ...lastLine, spoken: live.spoken, caption: live.caption, claims: ["c-store"] }],
    facts: spec.facts.filter((f) => !isPre(f.value)),
    claims: [...spec.claims.filter((c) => !c.facts.some(isPre) && !c.sources.some((s) => isPre(s.quote))), claim],
    onScreen: spec.onScreen.map((o) => (o.kind === "cta" ? { ...o, text: live.cta.text, claim: "c-store" } : o)),
    build: (manifest, lt) => {
      const built = spec.build(manifest, lt);
      const scenes = built.timeline.scenes.map((s) => (s.kind === "end" && s.end_card ? { ...s, end_card: { ...s.end_card, button: live.cta.text, url: live.cta.display } } : s));
      return { ...built, timeline: { ...built.timeline, scenes } };
    },
  };
}
