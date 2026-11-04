/**
 * Creative-language QA for GAME videos. Permanent rule: game videos sell FUN first, features second. A script that is technically accurate but
 * corporate, robotic, a feature list, repetitive, over-explained or low-energy is rejected before a game video can be READY_FOR_OWNER_REVIEW.
 * Truthfulness is checked elsewhere (claims, quotes, footage) and stays mandatory: fun never permits exaggeration.
 */

export type LanguageCheck = { id: string; ok: boolean; detail: string };

/** Until a verified store listing is live nothing may sound like a download link. */
export const NOT_YET_DOWNLOADABLE = /\b(coming soon|download|install|available (now|today|on)|get it (on|now)|on (google play|the app store)|app store|play store|out now)\b/i;
const CORPORATE = /\b(introducing|our game|is a game where|features?|platform|solutions?|functionality|interface|users?|utili[sz]e|seamless|robust|designed to|allows? you|enables? you|leverage|experience the|puzzle game from|mobile puzzle game)\b/i;
const INTRO_OPENING = /^\s*(introducing|meet|welcome|say hello|scribblezap is|mibble meadow is|this is|our)\b/i;
const ENERGY = new Set(["big", "payoff", "try", "tougher", "harder", "new", "unlock", "unlocked", "fresh", "watch", "beat", "master", "more", "hold", "drag", "fill", "trouble", "ready", "clutch", "combo", "bounce", "surprise", "challenge", "cute", "cozy", "clever", "keep", "going", "far", "think", "tricky", "sweet", "satisfying", "win", "solve", "place", "mark", "cheer", "sparkle", "friends", "meadow", "puzzle", "puzzles", "meadows", "cheers", "chase", "stars", "bigger", "find", "clear", "faces", "cute"]);
const STOP = new Set(["the", "and", "you", "your", "that", "this", "with", "for", "are", "when", "want", "one", "get", "can"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);

export type LanguageInput = {
  /** What the voice says, in order; the last entry is the call to action line. */
  spoken: string[];
  /** Everything shown as text apart from the voiceover captions (headlines, labels, button). */
  headlines: string[];
  cta: { text: string };
  /** True once a verified store listing is live: then an install CTA is expected and "coming soon" wording is not used either. */
  storeLive?: boolean;
};

export function checkGameLanguage(i: LanguageInput): LanguageCheck[] {
  const out: LanguageCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => out.push({ id, ok, detail });
  const all = [...i.spoken, ...i.headlines, i.cta.text].join(" | ");

  if (!i.storeLive) {
    const m = NOT_YET_DOWNLOADABLE.exec(all);
    add("lang_no_download_wording", !m, m ? `"${m[0]}" implies the game can be downloaded or is listed; use an invitation (Ready to play? How far can you get?)` : "nothing implies the game can be downloaded yet");
  }
  const corp = CORPORATE.exec(all);
  add("lang_not_corporate", !corp, corp ? `corporate or technical wording: "${corp[0]}"` : "no corporate, technical or documentation wording");

  const first = i.spoken[0] ?? "";
  add("lang_hook_first", words(first).length <= 9 && !INTRO_OPENING.test(first), `opening line "${first}" (${words(first).length} words; must start inside the fun, 9 words or fewer, no introduction)`);

  const counts = i.spoken.map((l) => words(l).length);
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  add("lang_short_and_punchy", Math.max(...counts) <= 14 && mean <= 9.5, `longest line ${Math.max(...counts)} words, average ${mean.toFixed(1)} (needs 14 or fewer, average 9.5 or fewer)`);

  const listy = i.spoken.filter((l) => /,[^,]+,\s*(and|or)\s/i.test(l) || /^(.*\b\w+\b, ){3,}/.test(l));
  add("lang_not_a_feature_list", listy.length === 0, listy.length ? `feature-list line: "${listy[0]}"` : "no line reads like a list of features");

  const vocab = new Set(words(i.spoken.join(" ")).filter((w) => ENERGY.has(w)));
  add("lang_energy", vocab.size >= 5, `${vocab.size} energetic play words (${[...vocab].slice(0, 6).join(", ")}); needs 5 or more`);

  const invites = i.spoken.some((l) => /\?|\b(try|beat|think you|how far|can you|one more|ready)\b/i.test(l));
  add("lang_challenges_the_viewer", invites, invites ? "at least one line challenges or invites the viewer" : "no line challenges or invites the viewer");

  // repetition: no shared 3-word phrase between lines, and no two lines that mostly reuse each other's words
  const sets = i.spoken.map((l) => new Set(words(l).filter((w) => w.length > 3 && !STOP.has(w))));
  let worst = 0;
  for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
    const inter = [...sets[a]].filter((w) => sets[b].has(w)).length;
    worst = Math.max(worst, inter / Math.max(1, Math.min(sets[a].size, sets[b].size)));
  }
  const tri = new Map<string, number>();
  i.spoken.forEach((l) => { const w = words(l); for (let k = 0; k + 2 < w.length; k++) tri.set(w.slice(k, k + 3).join(" "), (tri.get(w.slice(k, k + 3).join(" ")) ?? 0) + 1); });
  const repeated = [...tri.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  add("lang_not_repetitive", worst <= 0.5 && repeated.length === 0, repeated.length ? `repeated phrase "${repeated[0]}"` : `most overlap between two lines ${Math.round(worst * 100)}% (needs 50% or less)`);

  const longHead = i.headlines.filter((h) => words(h).length > 5);
  add("lang_headlines_short", longHead.length === 0, longHead.length ? `on-screen text too wordy: "${longHead[0]}"` : "on-screen headlines are short");

  const ctaLine = i.spoken[i.spoken.length - 1] ?? "";
  add("lang_cta_invites", /\?|\b(follow|try|ready|think you|how far|can you)\b/i.test(ctaLine) && !NOT_YET_DOWNLOADABLE.test(i.cta.text), `closing line "${ctaLine}" and button "${i.cta.text}" invite the viewer without claiming a download`);
  return out;
}

/** Until a verified store link is live a game uses an invitation CTA; afterwards an install CTA is required. */
export function gameCtaPhase(facts: Array<{ value: string; verified: boolean }>): "pre_launch" | "store_live" {
  return facts.some((f) => f.verified && /https?:\/\/(play\.google\.com\/store\/apps|apps\.apple\.com\/)/i.test(f.value)) ? "store_live" : "pre_launch";
}
