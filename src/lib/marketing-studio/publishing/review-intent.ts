/**
 * Turns an owner's plain-language change request into a SMALL set of safe, specific edits, or refuses it. Studio runs no AI model by design (it costs
 * money, and the Studio is isolated from every AI module), so this is a deterministic interpreter that understands a defined set of requests and checks
 * each one against Product Truth. Anything it does not understand, or that could change what the video claims, is BLOCKED with a reason instead of guessed.
 *
 * Supported: how a word is pronounced (the written text never changes), the call-to-action wording (only to a verified Product Truth phrase), the
 * call-to-action destination (only to a verified Product Truth URL on the product's own site), and the overall pace of the voice.
 * Not supported yet, so blocked: removing or rewriting sentences, per-scene changes, new claims, new visuals, anything ambiguous.
 */
export type VideoOverrides = {
  /** written word (letters only, lowercase) -> how the voice says it */
  lexicon: Record<string, string>;
  /** multiplies the voice speed (1 = unchanged) */
  paceFactor: number;
  ctaText?: string;
  ctaUrl?: string;
  /** every request that changed something, for the record */
  history: Array<{ at: string; note: string; applied: string[] }>;
};
export const emptyOverrides = (): VideoOverrides => ({ lexicon: {}, paceFactor: 1, history: [] });
export const overridesKey = (productId: string) => `video_overrides_${productId}`;

export type Intent =
  | { type: "lexicon"; key: string; written: string; spoken: string }
  | { type: "pace"; factor: number; label: string }
  | { type: "cta_text"; text: string }
  | { type: "cta_url"; url: string };

export type Interpretation = { ok: true; intents: Intent[]; summary: string[] } | { ok: false; kind: "ambiguous" | "unsupported" | "unsafe" | "no_change"; reason: string };

type Fail = Extract<Interpretation, { ok: false }>;
export type IntentContext = {
  /** every line the voice says, with its caption */
  narration: Array<{ spoken: string; caption?: string }>;
  ctaText: string;
  ctaUrl: string;
  productHost: string;
  /** Product Truth: verified facts only */
  facts: Array<{ key: string; value: string }>;
  current: VideoOverrides;
};

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const STOP = new Set(["the", "a", "an", "of", "is", "are", "was", "pronunciation", "pronounced", "pronounce", "mispronounced", "wrong", "incorrect", "name", "product", "voice", "says", "say", "saying", "said", "it", "its", "that", "this", "word", "sounds", "sound", "off", "weird", "right", "should", "be", "as", "not", "correct", "voiceover", "narrator", "brand", "please", "fix", "when", "how", "to", "and", "or"]);

function splitCamel(w: string): string {
  return w.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function pronunciation(sentence: string, ctx: IntentContext): Fail | Intent {
  const text = ctx.narration.map((l) => `${l.spoken} ${l.caption ?? ""}`).join(" ");
  const hay = letters(text);
  const words = sentence.match(/[A-Za-z][A-Za-z']*/g) ?? [];
  // candidate: the longest one or two word window from the request that really occurs in the script
  let best: { raw: string; n: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    for (const len of [2, 1]) {
      const win = words.slice(i, i + len);
      if (win.length < len || win.some((w) => STOP.has(w.toLowerCase()))) continue;
      const raw = win.join(" ");
      const n = letters(raw);
      if (n.length >= 4 && hay.includes(n) && (!best || n.length > best.n)) best = { raw, n: n.length };
    }
  }
  if (!best) return { ok: false, kind: "ambiguous", reason: "The request says a pronunciation is wrong but does not name a word that is in the script, so which word to change is unclear." };
  const key = letters(best.raw);
  const explicit = /\b(?:say|pronounce(?:d)?(?:\s+it)?(?:\s+as)?|should\s+be|sound\s+like)\s+["“']?([A-Za-z][A-Za-z -]{1,40}?)["”']?(?:[.,;!?]|$)/i.exec(sentence)?.[1]?.trim();
  let spoken = explicit && letters(explicit) !== "wrong" ? explicit : "";
  if (!spoken) {
    if (/[A-Z][a-z]+[A-Z]/.test(best.raw)) spoken = splitCamel(best.raw);
    else if (best.raw.includes(" ")) spoken = best.raw;
  }
  if (!spoken) return { ok: false, kind: "ambiguous", reason: `"${best.raw}" is said wrongly, but the request does not say how it should sound, so any new pronunciation would be a guess.` };
  if (letters(spoken) !== key) return { ok: false, kind: "unsafe", reason: `"${spoken}" is a different word from "${best.raw}". Only the way a word is pronounced can be changed automatically, never the words themselves.` };
  if (!/^[A-Za-z]+(?: [A-Za-z]+){0,3}$/.test(spoken)) return { ok: false, kind: "unsafe", reason: "A pronunciation can only be spaces and letters." };
  const written = key;
  if (ctx.current.lexicon[written]?.toLowerCase() === spoken.toLowerCase()) return { ok: false, kind: "no_change", reason: `"${best.raw}" is already said as "${spoken}".` };
  // If every occurrence in the script is already written in the spoken form, there is nothing to change either.
  const already = ctx.narration.every((l) => !new RegExp(`\\b${key}\\b`, "i").test(l.spoken.replace(/\{[a-z0-9]+\}/gi, "")));
  if (already) return { ok: false, kind: "no_change", reason: `The voice script already says it as "${spoken}", so there is nothing to change.` };
  return { type: "lexicon", key, written: best.raw, spoken };
}

export function paceFactor(sentence: string): Intent | Fail {
  const s = sentence.toLowerCase();
  if (/\b(scene|part|section|sentence|line|beginning|start|end(ing)?|middle|first|second|third|last)\b/.test(s)) {
    return { ok: false, kind: "unsupported", reason: "The pace can only be changed for the whole voiceover. A single scene or sentence cannot be re-timed automatically yet." };
  }
  const slow = /(too|a bit|slightly|little|bit)\s+(fast|quick|rushed|speedy)|rushed|slow(?:er)?(?:\s+down)?|speaks?\s+too\s+fast/.test(s) && !/too slow|speed up|faster/.test(s);
  const fast = /too slow|speed (it )?up|faster|drag(s|ging)?/.test(s);
  if (slow === fast) return { ok: false, kind: "ambiguous", reason: "It is not clear whether the voice should go faster or slower." };
  const small = /\b(slightly|a bit|a little|little|bit)\b/.test(s);
  const big = /\b(much|way|far|really|very)\b/.test(s);
  const mag = small ? 0.04 : big ? 0.12 : 0.08;
  const factor = slow ? 1 - mag : 1 + mag * 0.75;
  return { type: "pace", factor, label: `${slow ? "slower" : "faster"} voice (${Math.round(Math.abs(factor - 1) * 100)}%)` };
}

export function ctaText(sentence: string, ctx: IntentContext): Intent | Fail {
  const m = /\b(?:say|read|be|to|says|reads)\s+(.{2,80})$/i.exec(sentence.replace(/[.!?]+$/, ""));
  const asked = m?.[1]?.trim().replace(/^["“'‘]+|["”'’]+$/g, "").trim();
  if (!asked) return { ok: false, kind: "ambiguous", reason: "The request is about the call to action but does not say what it should read." };
  if (asked.toLowerCase() === ctx.ctaText.toLowerCase()) return { ok: false, kind: "no_change", reason: `The call to action already says "${ctx.ctaText}".` };
  const verified = ctx.facts.filter((f) => f.value.length <= 60).map((f) => f.value);
  const hit = verified.find((v) => v.toLowerCase() === asked.toLowerCase());
  if (!hit) return { ok: false, kind: "unsafe", reason: `"${asked}" is not a phrase in Product Truth, so it cannot be put on the call-to-action button. Only a verified phrase from the product's own page can be used.` };
  if (hit.toLowerCase() === ctx.ctaText.toLowerCase()) return { ok: false, kind: "no_change", reason: `The call to action already says "${ctx.ctaText}".` };
  return { type: "cta_text", text: hit };
}

export function ctaUrl(sentence: string, ctx: IntentContext): Intent | Fail {
  const url = /https?:\/\/[^\s"'<>)]+/i.exec(sentence)?.[0]?.replace(/[.,;]+$/, "");
  if (!url) return { ok: false, kind: "ambiguous", reason: "The request asks for a different page but does not give its address, so the right page cannot be chosen safely." };
  let host = "";
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    return { ok: false, kind: "unsafe", reason: "That address is not valid." };
  }
  if (host !== ctx.productHost) return { ok: false, kind: "unsafe", reason: `The destination must stay on ${ctx.productHost}.` };
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  if (!ctx.facts.some((f) => norm(f.value) === norm(url))) return { ok: false, kind: "unsafe", reason: "That page is not a verified Product Truth address, so it cannot be used as the destination." };
  if (norm(url) === norm(ctx.ctaUrl.split("?")[0])) return { ok: false, kind: "no_change", reason: "The destination is already that page." };
  return { type: "cta_url", url };
}

export function interpretChange(note: string, ctx: IntentContext): Interpretation {
  const sentences = note.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return { ok: false, kind: "ambiguous", reason: "The note is empty." };
  const intents: Intent[] = [];
  const summary: string[] = [];
  for (const s of sentences) {
    const l = s.toLowerCase();
    let r: Intent | Fail;
    if (/\b(remove|delete|cut|drop|take out|get rid of|rewrite|reword|rephrase)\b/.test(l)) {
      r = { ok: false, kind: "unsupported", reason: "Removing or rewriting a sentence changes the timing of its scene, so it cannot be done automatically yet." };
    } else if (/(pronunc|pronounc|mispronounc|sounds? (wrong|off|weird)|says? (it )?wrong)/.test(l)) r = pronunciation(s, ctx);
    else if ((/https?:\/\//.test(l) || /\b(url|link|destination|product page|landing page|correct page|right page)\b/.test(l)) && !/\bcta\b|call to action|button/.test(l)) r = ctaUrl(s, ctx);
    else if (/\b(cta|call to action|button)\b/.test(l)) r = ctaText(s, ctx);
    else if (/\b(fast|slow|rushed|speed|pace|quick)\b/.test(l)) r = paceFactor(s);
    else r = { ok: false, kind: "unsupported", reason: `"${s.slice(0, 120)}" is not a change that can be applied automatically and safely yet.` };
    if ("ok" in r) {
      // one request that cannot be applied blocks the whole note: nothing is half applied
      if (r.kind === "no_change" && sentences.length > 1) continue;
      return r;
    }
    intents.push(r);
    summary.push(r.type === "lexicon" ? `say "${r.written}" as "${r.spoken}" (written text unchanged)` : r.type === "pace" ? r.label : r.type === "cta_text" ? `call-to-action wording: "${r.text}"` : `call-to-action destination: ${r.url}`);
  }
  if (!intents.length) return { ok: false, kind: "no_change", reason: "Nothing in the note changes the video." };
  return { ok: true, intents, summary };
}

/** Folds the accepted edits into the product's standing overrides. Applying the same note twice changes nothing more. */
export function mergeOverrides(current: VideoOverrides, intents: Intent[], note: string, now = new Date()): VideoOverrides {
  const next: VideoOverrides = { ...current, lexicon: { ...current.lexicon }, history: [...current.history] };
  const applied: string[] = [];
  for (const i of intents) {
    if (i.type === "lexicon") next.lexicon[i.key] = i.spoken;
    else if (i.type === "pace") next.paceFactor = Math.min(1.15, Math.max(0.85, +(next.paceFactor * i.factor).toFixed(3)));
    else if (i.type === "cta_text") next.ctaText = i.text;
    else next.ctaUrl = i.url;
    applied.push(i.type);
  }
  next.history.push({ at: now.toISOString(), note: note.slice(0, 500), applied });
  return next;
}

/** The voice's text: written words replaced by their spoken form (captions and the screen always keep the written text). */
export function applyLexicon(text: string, lexicon: Record<string, string>): string {
  let out = text;
  for (const [key, spoken] of Object.entries(lexicon)) out = out.replace(new RegExp(`\\b${key}\\b`, "gi"), spoken);
  return out;
}
