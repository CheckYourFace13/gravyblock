/**
 * The GAME SCRIPT WRITER and the GAME VOICE. A game video sounds like someone excited about what is happening on screen, not like documentation: short lines, a strong rhythm, warm and playful,
 * quick. Every line is anchored to something that is really visible when it is spoken (the action, the tension, the payoff), is made from what the game's own profile says (its objective, what
 * makes it fun, its controls and mechanics) and is checked against the game's earlier videos so two videos never say the same thing. These are templates for ENERGY and structure, not scripts to
 * reuse: a game's own words fill them, the choice rotates with the game's history, and the QA rejects anything that reads like a manual.
 */
import { VOICES } from "../voices";
import type { Energy, GameProfile } from "./profile";
import type { GameFormat, GameMoment, GameMomentKind } from "./engine";

export type Slot = "hook" | "explain" | "tension" | "payoff" | "close";
export type ScriptLine = { text: string; slot: Slot; /** the moments that must be on screen while it is spoken */ anchor: GameMomentKind[]; /** the slot values this line used (for the game's history) */ uses: string[] };

const E: Record<Energy, number> = { relaxed: 0, fun: 1, energetic: 2, very_energetic: 3 };
export const ENERGY_SPEED: Record<Energy, number> = { relaxed: 1.0, fun: 1.08, energetic: 1.15, very_energetic: 1.22 };

/** Voices that suit games: lively and clear. "auto" picks one by the game, so different games do not all sound alike. */
export const GAME_VOICE_IDS = ["af_bella", "af_nicole", "af_sarah", "af_nova", "am_michael", "am_puck", "af_heart", "am_fenrir"] as const;
export const gameVoices = () => GAME_VOICE_IDS.map((id) => VOICES.find((v) => v.id === id)).filter((v): v is NonNullable<typeof v> => Boolean(v));
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Pure: the voice and pace of a game's narration. An owner's choice always wins; "auto" is steady for a game (its voice does not change video to video) and suits its energy. */
export function gameVoiceFor(profile: Pick<GameProfile, "voice" | "energy">, slug: string): { voice: string; speed: number } {
  const chosen = profile.voice && profile.voice !== "auto" && VOICES.some((v) => v.id === profile.voice) ? profile.voice : null;
  const calm = profile.energy === "relaxed";
  const pool = calm ? (["af_heart", "af_nicole", "af_sarah", "am_michael"] as const) : GAME_VOICE_IDS;
  return { voice: chosen ?? pool[hash(slug) % pool.length], speed: ENERGY_SPEED[profile.energy] };
}

/** What a measured voice must reach for an energy level: pace in words per second of speech and how much the pitch moves (semitones). A flat reading fails. */
export const VOICE_ENERGY_MIN: Record<Energy, { wps: number; spread: number }> = {
  relaxed: { wps: 2.9, spread: 1.0 },
  fun: { wps: 3.4, spread: 1.4 },
  energetic: { wps: 3.7, spread: 1.6 },
  very_energetic: { wps: 3.9, spread: 1.8 },
};
export function voiceEnergyCheck(m: { wordsPerSec: number; pitchSpread: number | null }, energy: Energy): { ok: boolean; detail: string } {
  const need = VOICE_ENERGY_MIN[energy];
  const spread = m.pitchSpread ?? 0;
  const ok = m.wordsPerSec >= need.wps && spread >= need.spread;
  return { ok, detail: `${m.wordsPerSec.toFixed(1)} words/s (need ${need.wps}) and pitch movement ${spread.toFixed(1)} semitones (need ${need.spread}) for "${energy}"` };
}

// ---- the lines -----------------------------------------------------------------------------------------------------------------------

type Tpl = { t: string; lo: number; hi: number };
const T = (t: string, lo = 0, hi = 3): Tpl => ({ t, lo, hi });
/** {obj} the objective clause, {fun} what makes it fun, {ctrl} the controls clause, {mech} a mechanic, {char} a character, {name} the game. */
const POOLS: Record<Slot, Tpl[]> = {
  hook: [
    T("Let's see how this one plays.", 0, 1), T("Settle in and watch this.", 0, 0), T("Okay, watch this one.", 1, 2), T("Look how fast this comes together.", 1, 3), T("Alright, jump right in.", 1, 2),
    T("Ready? Watch closely.", 1, 2), T("Okay, watch this!", 2, 3), T("Look at that go!", 2, 3), T("Hold on, watch what happens!", 2, 3), T("Alright, check this out!", 2, 3),
    T("Oh, this is going to be good.", 1, 3), T("Something is about to happen.", 0, 2), T("Watch the board closely.", 0, 2), T("{Fun}.", 0, 2), T("Here's the thing: {fun}!", 2, 3),
  ],
  explain: [
    T("The goal is simple: {obj}.", 0, 1), T("You just {ctrl}.", 0, 1), T("Your job: {obj}.", 1, 2), T("All you do is {ctrl}.", 1, 2), T("It's all about {mech}.", 0, 3),
    T("Your mission: {obj}!", 2, 3), T("Just {ctrl} and go!", 2, 3), T("Everything here is {mech}.", 1, 3), T("So, {obj}. That's it.", 1, 2), T("{Ctrl}. That's the whole game.", 1, 3),
    T("Easy to start: {ctrl}.", 0, 2), T("Watch the {mech} do its thing.", 1, 3),
  ],
  tension: [
    T("It's getting a little tight.", 0, 1), T("Careful now.", 0, 1), T("Okay, this is getting tricky.", 1, 2), T("Uh oh. That's close.", 1, 2), T("Easy at first. Not anymore.", 1, 3),
    T("Things are getting tight.", 1, 2), T("Ooh, that was close!", 2, 3), T("Careful, careful, careful!", 2, 3), T("Hang on, this is getting wild!", 2, 3), T("Oh no, that's tight!", 2, 3), T("Here comes the hard part.", 0, 3), T("Don't blink.", 1, 3),
  ],
  payoff: [
    T("And there it is.", 0, 1), T("That feels good.", 0, 1), T("Nicely done.", 0, 1), T("Now that feels good.", 1, 2), T("Yes! That's the payoff.", 1, 2), T("That click is so satisfying.", 1, 3), T("Told you it was worth it.", 1, 3),
    T("Yes! Look at that!", 2, 3), T("Boom! Nailed it!", 2, 3), T("Whoa, did you see that?", 2, 3), T("Now THAT is satisfying!", 2, 3), T("Because {fun}!", 1, 3), T("That's the thing: {fun}.", 0, 2), T("Look at {char} go!", 1, 3),
  ],
  close: [],
};
const CLOSE_LIVE: Tpl[] = [T("Get {name} on Google Play.", 0, 3), T("{name} is on Google Play now.", 0, 3), T("Go and find {name} on Google Play.", 0, 3), T("Grab {name} on Google Play!", 2, 3), T("Find {name} on Google Play. Enjoy!", 1, 3), T("That was {name}. Find it on Google Play.", 0, 3)];
const CLOSE_PRE: Tpl[] = [T("That's {name}.", 0, 1), T("Meet {name}.", 1, 3), T("{name}. Keep an eye on it.", 0, 2), T("That was {name}.", 0, 3), T("This is {name}!", 2, 3), T("{name}. You'll want to see more.", 1, 3), T("Say hello to {name}.", 1, 3), T("Remember the name: {name}.", 0, 3)];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
export const similarity = (a: string, b: string) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / new Set([...A, ...B]).size;
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const stripEnd = (s: string) => s.replace(/[.!?\s]+$/g, "");

/** Phrases that would make a game video sound generic or like a manual: they never appear in a line, whatever fills the template. */
export const GENERIC_PHRASES = [/this game is fun/i, /challenge yourself/i, /can you beat (the|this) level/i, /play now/i, /download now/i, /available now/i, /coming soon/i];
const BODY_WORDS = 16;

export type History = { lines: string[]; uses: string[] };

/** Pure: the lines for one video. `variant` rotates between equally good choices; `history` is every line and slot value the game's earlier videos used. */
export function writeScript(o: {
  format: GameFormat;
  profile: GameProfile;
  name: string;
  moments: GameMoment[];
  durationMs: number;
  storeLive: boolean;
  history: History;
  variant?: number;
}): ScriptLine[] {
  const e = E[o.profile.energy];
  const kinds = new Set(o.moments.map((m) => m.kind));
  const has = (...k: GameMomentKind[]) => k.some((x) => kinds.has(x));
  const mechs = o.profile.mechanics;
  const chars = o.profile.characters;
  const v = o.variant ?? 0;
  const seed = hash(o.name) + v * 7 + o.history.lines.length * 3;
  const fill = (tpl: string, pick: { mech?: string; char?: string }) => {
    const need = (k: string) => tpl.includes(`{${k}}`);
    const val = { obj: stripEnd(o.profile.objective), fun: stripEnd(o.profile.funFactor), ctrl: stripEnd(o.profile.controls), mech: pick.mech ?? "", char: pick.char ?? "", name: o.name };
    for (const k of ["obj", "fun", "ctrl", "mech", "char"] as const) if (need(k) && !val[k]) return null;
    const uses: string[] = [];
    const text = tpl
      .replace(/\{(Obj|Fun|Ctrl|Char)\}/g, (_, k: string) => cap(val[k.toLowerCase() as "obj"]))
      .replace(/\{(obj|fun|ctrl|mech|char|name)\}/g, (_, k: keyof typeof val) => {
        if (k !== "name") uses.push(`${k}:${val[k]}`);
        return val[k];
      });
    for (const k of ["Obj", "Fun", "Ctrl", "Char"]) if (tpl.includes(`{${k}}`)) uses.push(`${k.toLowerCase()}:${val[k.toLowerCase() as "obj"]}`);
    return { text: /[.!?]$/.test(text) ? text : `${text}.`, uses };
  };
  const taken: string[] = [];
  const ok = (text: string, uses: string[]) =>
    text.split(/\s+/).length <= BODY_WORDS &&
    !GENERIC_PHRASES.some((g) => g.test(text)) &&
    !o.history.lines.some((h) => similarity(h, text) >= 0.6 || norm(h) === norm(text)) &&
    !taken.some((h) => similarity(h, text) >= 0.6) &&
    // a slot value the game's last videos already used is not used again while another way to say it exists
    !uses.some((u) => o.history.uses.includes(u));
  let livelyOnly = false;
  const LIVELY = /[!?]|(okay|alright|whoa|boom|yes|oh|uh oh|ooh|look|watch)/i;
  const choose = (slot: Slot, anchor: GameMomentKind[], pool: Tpl[], strict = true): ScriptLine | null => {
    const fits = pool.filter((p) => e >= p.lo && e <= p.hi && (!livelyOnly || LIVELY.test(p.t) || slot === "close" || slot === "explain"));
    const n = fits.length;
    for (let k = 0; k < n; k++) {
      const tpl = fits[(seed + k * 5) % n];
      const mech = mechs.length ? mechs[(seed + k) % mechs.length] : undefined;
      const ch = chars.length ? chars[(seed + k) % chars.length] : undefined;
      const f = fill(tpl.t, { mech, char: ch });
      if (!f) continue;
      if (strict ? ok(f.text, f.uses) : f.text.split(/\s+/).length <= BODY_WORDS && !GENERIC_PHRASES.some((g) => g.test(f.text)) && !taken.some((h) => similarity(h, f.text) >= 0.6)) {
        taken.push(f.text);
        return { text: f.text, slot, anchor, uses: f.uses };
      }
    }
    return strict ? choose(slot, anchor, pool, false) : null;
  };
  const lines: ScriptLine[] = [];
  const push = (l: ScriptLine | null) => l && lines.push(l);
  const ACTION: GameMomentKind[] = ["input", "stage_transition", "animation", "score"];
  push(choose("hook", ACTION, POOLS.hook));
  const roomy = o.durationMs >= 14000;
  push(choose("explain", ACTION, POOLS.explain));
  if (roomy && o.format !== "gameplay_hook" && o.format !== "short_form") push(choose("explain", ACTION, POOLS.explain));
  if (has("close_call", "loss") && o.durationMs >= 9000) push(choose("tension", ["close_call", "score", "loss", "animation"], POOLS.tension));
  if (has("win", "reward", "unlock", "close_call", "animation", "score")) push(choose("payoff", ["win", "reward", "unlock", "animation", "score", "close_call"], POOLS.payoff));
  push(choose("close", ["input", "win", "reward", "unlock", "animation", "score", "stage_transition"], o.storeLive ? CLOSE_LIVE : CLOSE_PRE));
  // the energy the owner chose must be audible in the words: when the choice came out too plain, the hook and payoff are chosen again from the lively ones
  const need = e === 0 ? 0 : e === 1 ? 1 : 2;
  const lively = () => lines.reduce((n, l) => n + (l.text.match(/[!?]/g) ?? []).length + (l.text.match(/(okay|alright|whoa|boom|yes|oh|uh oh|ooh|look|watch)/gi) ?? []).length, 0);
  if (lively() < need) {
    livelyOnly = true;
    for (const slot of ["hook", "payoff", "tension"] as const) {
      const at = lines.findIndex((l) => l.slot === slot);
      if (at < 0 || lively() >= need) continue;
      taken.splice(0, taken.length, ...lines.filter((_, k) => k !== at).map((l) => l.text));
      const again = choose(slot, lines[at].anchor, POOLS[slot]);
      if (again) lines[at] = again;
    }
  }
  return lines;
}

/** Pure: when each line should start in the clip (ms), from what is on screen: the hook with the first action, the payoff as the payoff lands, the close over the end card. */
export function desiredStarts(lines: ScriptLine[], moments: GameMoment[], durationMs: number): number[] {
  const first = (kinds: GameMomentKind[], from = 0) => moments.filter((m) => kinds.includes(m.kind) && m.endMs > from).sort((a, b) => a.startMs - b.startMs)[0];
  const out: number[] = [];
  let cursor = 0;
  lines.forEach((l) => {
    let at = cursor;
    if (l.slot === "hook") at = Math.max(250, first(["input"])?.startMs ?? 250);
    else if (l.slot === "tension") at = Math.max(cursor, (first(["close_call", "loss"], cursor) ?? first(["score"], cursor))?.startMs ?? cursor);
    else if (l.slot === "payoff") {
      const last = [...moments].reverse().find((m) => ["win", "reward", "unlock"].includes(m.kind)) ?? [...moments].reverse().find((m) => ["animation", "score", "close_call"].includes(m.kind));
      at = Math.max(cursor, (last?.startMs ?? durationMs - 3500) - 100);
    } else if (l.slot === "close") at = durationMs;
    else at = Math.max(cursor, Math.min(durationMs * 0.28, cursor + 600));
    out.push(Math.round(at));
    cursor = at + Math.max(1500, l.text.split(/\s+/).length * 330);
  });
  return out;
}

// ---- the language checks --------------------------------------------------------------------------------------------------------------

const SAAS = /\b(features?|platform|solutions?|dashboard|seamless(ly)?|streamline[sd]?|leverag\w+|workflows?|powerful|intuitive|interface|robust|optimi[sz]\w+|users?|functionality|capabilit\w+|enhance[sd]?|ecosystem|comprehensive|designed to|allows you|enables you|offers?|experience the|unlock the power)\b/i;
const TUTORIAL = /\b(first,|then,|next,|step \d|how to|in order to|you can|you will|you'll need|navigate|click (on|the|here|to)|select the|go to|settings|menu|tutorial|instructions?|make sure|remember to)\b/i;
export type LangCheck = { id: string; ok: boolean; detail: string };

/** Pure: does this narration sound like game marketing? Short sentences, energy, nothing from a manual, nothing from a software pitch. */
export function languageChecks(lines: string[], energy: Energy): LangCheck[] {
  const text = lines.join(" ");
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const counts = sentences.map((s) => s.split(/\s+/).length);
  const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const longest = Math.max(0, ...counts);
  const lively = (text.match(/[!?]/g) ?? []).length + (text.match(/\b(okay|alright|whoa|boom|yes|oh|uh oh|ooh|look|watch)\b/gi) ?? []).length;
  const saas = text.match(SAAS)?.[0];
  const tut = text.match(TUTORIAL)?.[0];
  const generic = GENERIC_PHRASES.find((g) => g.test(text));
  const need = energy === "relaxed" ? 0 : energy === "fun" ? 1 : 2;
  return [
    { id: "not_saas_voice", ok: !saas && !generic && avg <= 9.5 && longest <= 17, detail: saas ? `software wording: "${saas}"` : generic ? "a generic game-ad phrase" : `average ${avg.toFixed(1)} words a sentence, longest ${longest}` },
    { id: "not_a_tutorial", ok: !tut, detail: tut ? `instruction wording: "${tut}"` : "sells the fun, does not teach a lesson" },
    { id: "has_energy", ok: lively >= need, detail: `${lively} lively touches, need ${need} for "${energy}"` },
  ];
}
