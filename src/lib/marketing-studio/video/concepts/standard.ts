/**
 * The permanent creative standard for every Marketing Studio video (owner directive 2026-11-08). It applies to every product Studio will ever make a video
 * for: websites, SaaS, apps, tools, games and future GravyBlock customers. A technically accurate walkthrough is not enough: the viewer should come away
 * thinking "that looks good, I want to try that". The rules here are DATA plus pure checks, so the generator, the pre-render gate and the post-render gate
 * all read one source. Nothing in this file calls an AI or any paid service.
 */

export const STANDARD_VERSION = 1;
export const STANDARD_SETTING = "video_creative_standard";

export const PRINCIPLES = [
  "Every video makes the product feel exciting, modern, different, special, desirable, useful and worth trying, buying, signing up for or using (fun where appropriate).",
  "Sell the outcome, not the interface: problem, product action, satisfying payoff, why it matters, call to action.",
  "The first three seconds earn attention: a relatable problem, an intriguing question, an immediate result, a surprising capability or a compelling visual action. Never a logo-first intro, 'Welcome to', a slow homepage pan or a generic introduction, and never the same opening twice across products.",
  "Every product has its own personality: pacing, hook style, scene rhythm, captions, music feel, narration style, visual emphasis and story structure are chosen per product kind, so the portfolio does not read as one template.",
  "No dry feature tours, documentation videos, homepage scrolls, generic screen recordings or corporate explainers.",
  "Nothing is invented: every claim is a verbatim piece of Product Truth read from the live product, and every scene is a real captured interaction. If a product cannot safely demonstrate a concept, another verified angle is chosen.",
] as const;

/** The ten pass/fail checks every video must clear before the owner is emailed. */
export const DESIRABILITY_CHECKS = [
  { id: "first_3_seconds", label: "Strong first 3 seconds" },
  { id: "reason_to_care", label: "Clear reason to care" },
  { id: "real_product_action", label: "Real product shown doing something meaningful" },
  { id: "visible_payoff", label: "Visible payoff or result" },
  { id: "distinctive", label: "Product feels distinctive" },
  { id: "desire_to_try", label: "Creates desire to try, use or buy" },
  { id: "engaging_pacing", label: "Engaging pacing" },
  { id: "not_documentation", label: "Does not feel like documentation" },
  { id: "personality_fit", label: "Personality fits the product" },
  { id: "clear_usefulness", label: "Clear reason this product is useful or different" },
] as const;
export type DesirabilityId = (typeof DESIRABILITY_CHECKS)[number]["id"];
export type DesirabilityCheck = { id: DesirabilityId; label: string; ok: boolean; detail: string };

// ---- product personalities -------------------------------------------------------------------------------------------------------

export type PersonalityId = "game" | "food_drink" | "business_software" | "history_editorial" | "boating_travel" | "autonomous_proof" | "music_events" | "public_info" | "creative_studio";

export type HookStyle = "question" | "tension" | "curiosity" | "dare";

export type Personality = {
  id: PersonalityId;
  label: string;
  tone: string;
  /** voice speed multiplier on top of the base voice speed */
  pace: number;
  /** milliseconds between two lines of the same scene, between scenes, and before the closing line */
  gaps: { same: number; scene: number; endLead: number };
  /** camera zoom at rest and at a tap: faster products zoom harder */
  zoom: { rest: number; tap: number };
  /** the music feel: tempo and the chord loop (MIDI root and triad per bar) */
  music: { bpm: number; chords: Array<{ root: number; notes: number[] }> };
  hookStyles: HookStyle[];
  /** story structure, in words, recorded with the concept */
  structure: string;
  /** narration wrappers. {c} is a control's label, {f} a verbatim sentence the live page shows after the tap */
  action: string[];
  payoff: string[];
  whyLine: string[];
  cta: string[];
  /** visual emphasis for the captured screens */
  emphasis: string;
};

const chord = (root: number, ...rel: number[]) => ({ root, notes: rel.map((r) => root + 12 + r) });
const MINOR_LOOP = [chord(45, 0, 3, 7), chord(41, 0, 4, 7), chord(48, 0, 4, 7), chord(43, 0, 4, 7)];
const MAJOR_LOOP = [chord(48, 0, 4, 7), chord(43, 0, 4, 7), chord(45, 0, 3, 7), chord(41, 0, 4, 7)];
const LIFT_LOOP = [chord(41, 0, 4, 7), chord(48, 0, 4, 7), chord(43, 0, 4, 7), chord(45, 0, 3, 7)];
const MOODY_LOOP = [chord(45, 0, 3, 7), chord(43, 0, 4, 7), chord(41, 0, 4, 7), chord(40, 0, 4, 7)];

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  game: { id: "game", label: "Games: fast, playful, satisfying, fun-first", tone: "playful and quick", pace: 1.12, gaps: { same: 160, scene: 260, endLead: 700 }, zoom: { rest: 1.04, tap: 1.12 }, music: { bpm: 128, chords: MAJOR_LOOP }, hookStyles: ["dare", "question"], structure: "challenge, play, win, again", action: ["{c}!", "Go on, {c}.", "Hit {c}."], payoff: ["{f}", "Oh yes. {f}"], whyLine: ["That is the fun part."], cta: ["Your turn"], emphasis: "big fast taps and quick cuts" },
  food_drink: { id: "food_drink", label: "Food, drink and discovery: curious, visual, social, appetizing", tone: "curious and warm", pace: 1.02, gaps: { same: 280, scene: 420, endLead: 1100 }, zoom: { rest: 1.06, tap: 1.12 }, music: { bpm: 104, chords: LIFT_LOOP }, hookStyles: ["curiosity", "question"], structure: "craving, find it, look closer, go try it", action: ["Try {c}.", "Tap {c} and take a look.", "Pick {c}."], payoff: ["Look at that. {f}", "And there it is. {f}", "{f}"], whyLine: ["Now you know what to order."], cta: ["Go find your next favorite"], emphasis: "close, lingering looks at the result" },
  business_software: { id: "business_software", label: "Business software: smart, efficient, satisfying", tone: "smart and dry-witted", pace: 1.06, gaps: { same: 240, scene: 380, endLead: 1000 }, zoom: { rest: 1.05, tap: 1.1 }, music: { bpm: 112, chords: MINOR_LOOP }, hookStyles: ["tension", "question"], structure: "annoying manual task, one action, tidy result, relief", action: ["Tap {c}.", "Now {c}.", "Switch to {c}."], payoff: ["Done. {f}", "That is the whole job. {f}", "{f}"], whyLine: ["No more doing this by hand."], cta: ["Try it"], emphasis: "clean, deliberate moves that end on the result" },
  history_editorial: { id: "history_editorial", label: "History and editorial: intriguing, surprising, story-first", tone: "hushed and intrigued", pace: 0.97, gaps: { same: 340, scene: 520, endLead: 1300 }, zoom: { rest: 1.07, tap: 1.14 }, music: { bpm: 92, chords: MOODY_LOOP }, hookStyles: ["curiosity", "tension"], structure: "a strange claim, open the story, the twist, read on", action: ["Open {c}.", "Now {c}.", "Turn to {c}."], payoff: ["Here is the twist. {f}", "Listen to this. {f}", "{f}"], whyLine: ["It really happened."], cta: ["Read the story"], emphasis: "slow pushes in on the text that matters" },
  boating_travel: { id: "boating_travel", label: "Boating and travel: aspirational, useful, adventurous", tone: "open and adventurous", pace: 1.0, gaps: { same: 300, scene: 460, endLead: 1100 }, zoom: { rest: 1.05, tap: 1.12 }, music: { bpm: 100, chords: LIFT_LOOP }, hookStyles: ["question", "dare"], structure: "the itch to go, find the spot, the details, cast off", action: ["Check {c}.", "Tap {c}.", "Then {c}."], payoff: ["There it is. {f}", "{f}", "Good to know. {f}"], whyLine: ["Plan it once and go."], cta: ["Plan your trip"], emphasis: "wide, calm moves that feel like looking out over the water" },
  autonomous_proof: { id: "autonomous_proof", label: "GravyBlock: powerful, autonomous, proof-driven", tone: "confident and evidence-led", pace: 0.9, gaps: { same: 220, scene: 340, endLead: 900 }, zoom: { rest: 1.05, tap: 1.1 }, music: { bpm: 118, chords: MINOR_LOOP }, hookStyles: ["tension", "dare"], structure: "a doubt, the evidence, the receipt, see for yourself", action: ["Open {c}.", "Now {c}.", "Check {c}."], payoff: ["Proof. {f}", "Here is the receipt. {f}", "{f}"], whyLine: ["You can check every line."], cta: ["See the proof"], emphasis: "hard cuts to the evidence" },
  music_events: { id: "music_events", label: "Music and events: lively, social, backstage energy", tone: "lively and encouraging", pace: 1.08, gaps: { same: 200, scene: 320, endLead: 900 }, zoom: { rest: 1.05, tap: 1.12 }, music: { bpm: 120, chords: MAJOR_LOOP }, hookStyles: ["dare", "question"], structure: "the itch to perform, find the room, get on the list, show up", action: ["Tap {c}.", "Try {c}.", "Then {c}."], payoff: ["Found one. {f}", "{f}", "That is your night. {f}"], whyLine: ["Pick a night and go."], cta: ["Find your stage"], emphasis: "quick, upbeat taps" },
  public_info: { id: "public_info", label: "Public information: calm, clear, trustworthy", tone: "calm and clear", pace: 0.98, gaps: { same: 320, scene: 480, endLead: 1200 }, zoom: { rest: 1.04, tap: 1.09 }, music: { bpm: 96, chords: MOODY_LOOP }, hookStyles: ["question", "curiosity"], structure: "a worry, a clear answer, where it comes from, check yourself", action: ["Open {c}.", "Tap {c}.", "Then {c}."], payoff: ["Here is what it shows. {f}", "{f}"], whyLine: ["Straight from the source."], cta: ["Check it yourself"], emphasis: "steady, unhurried moves and no drama" },
  creative_studio: { id: "creative_studio", label: "Creative studio: bold, stylish, confident", tone: "bold and stylish", pace: 1.05, gaps: { same: 240, scene: 360, endLead: 1000 }, zoom: { rest: 1.06, tap: 1.13 }, music: { bpm: 108, chords: LIFT_LOOP }, hookStyles: ["dare", "tension"], structure: "a bland default, a bolder move, the result, make yours", action: ["Tap {c}.", "Now {c}.", "Try {c}."], payoff: ["{f}", "Now that has a voice. {f}"], whyLine: ["Yours should not sound like everyone else's."], cta: ["Make yours"], emphasis: "confident holds, then a decisive move" },
};

const PERSONALITY_BY_SLUG: Record<string, PersonalityId> = {
  scribblezap: "game",
  mibblemeadow: "game",
  thedrinkplace: "food_drink",
  drinkknird: "food_drink",
  sendfable: "business_software",
  rentalnoodle: "business_software",
  leaguepour: "business_software",
  venuesprocket: "business_software",
  seestew: "history_editorial",
  boatingchicago: "boating_travel",
  gravyblock: "autonomous_proof",
  micstage: "music_events",
  outbreakthreat: "public_info",
  iscreamstudio: "creative_studio",
};
/** Unknown future products get the business-software voice until the owner or Product Truth says otherwise. */
export const personalityFor = (slug: string): Personality => PERSONALITIES[PERSONALITY_BY_SLUG[slug] ?? "business_software"];

// ---- language rules --------------------------------------------------------------------------------------------------------------

/** Openings that are never allowed: logo-first, greeting, introduction. */
export const BANNED_OPENER = /^\s*(welcome|introducing|meet|hi\b|hello|hey there|this is|in this video|today|say hello|presenting|discover)\b/i;
/** Site boilerplate that is never a payoff: age gates, legal lines, sign-in prompts, cookie and newsletter text, interface labels. */
/** Empty, error and placeholder states: a result the viewer would read as the product failing. */
export const EMPTY_STATE = /\b(no (open mic )?(listings?|results?|matches|events?|items?|data)|0 (listings?|results?)|did not load|failed to load|couldn.t load|not found|try again|coming soon|nothing (here|yet|found)|no .{0,40} yet|unavailable|something went wrong|error)\b/i;
export const BOILERPLATE = /\b(sign in|sign up|log in|log out|confirm you are|21 or older|18 or older|of legal age|we don.t sell|don.t sell or ship|ship alcohol|cookies?|privacy|terms of|terms and|subscribe|newsletter|copyright|all rights|save this|search drinks?|read more|learn more|click here|tap here|skip to|enable javascript|your browser|loading|powered by|follow us|download the app|app store|google play|amazon associate|qualifying purchases|affiliate|disclosure|sponsored|advertisw*|we missed|report (a|an|this)|send us|tell us|feedback|submit a|suggest a|know a)\b|©/i;
/** The register of a documentation video or a corporate explainer. */
export const DOC_REGISTER = /\b(overview|documentation|features? include|this (page|section|screen)|home ?page|our platform|solution|comprehensive|all-in-one|seamless(ly)?|leverage|robust|streamline|empower|cutting-edge|world-class|ecosystem|scroll(ing)? down|let me show|here we (can )?see|as you can see|in this tutorial|walkthrough)\b/i;
/** A line that sells an outcome has one of these: an action, or a result word. */
export const OUTCOME_WORD = /\b(tap|pick|try|open|find|see|watch|look|switch|check|go|play|hit|choose|turn|done|there|proof|twist|found|ready|now|no more|yours|shows?|showing|narrows?|filters?|pulls? up|jumps?|reveals?|appears?|lands?|spots?|heads?|lists?|asks?|reads?|keep going|further down|comes? (up|into view)|types?|enter|enters|put|change|climbs?|settles?|works? out|figures?|updates?|calculates?)\b/i;
/** A hook has tension: a question, second person, a contrast or a number. */
export const HOOK_TENSION = /\?|\b(you|your|you're|ever|still|why|what|where|how|who|stop|without|never|no more)\b/i;
/** Verbs that invite the viewer in, for the call to action. */
export const INVITE_VERB = /\b(try|start|see|find|build|run|play|check|read|plan|make|get|go|explore|open|join|look|learn|score|book)\b/i;

export const wordCount = (s: string) => (s.match(/[A-Za-z0-9'$.%-]+/g) ?? []).length;
/** The first two words of a line, lowercased: what makes two openings "the same". */
export const openingKey = (s: string) => (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).slice(0, 2).join(" ");

/** The standard in the shape that is stored with the Studio settings and shown to the owner. */
export function standardRecord() {
  return {
    version: STANDARD_VERSION,
    adopted: "2026-11-08",
    adoptedBy: "owner directive",
    principles: PRINCIPLES,
    checks: DESIRABILITY_CHECKS,
    personalities: Object.values(PERSONALITIES).map((p) => ({ id: p.id, label: p.label, tone: p.tone, pace: p.pace, bpm: p.music.bpm, hookStyles: p.hookStyles, structure: p.structure, emphasis: p.emphasis })),
    appliesTo: ["websites", "SaaS products", "apps", "tools", "games", "future GravyBlock customers"],
    enforcedAt: ["concept generation (pre-render)", "after render, before the owner is emailed"],
    onFailure: "regenerate with the next variant before the owner is emailed; a concept that cannot pass is replaced by another verified angle",
  };
}
