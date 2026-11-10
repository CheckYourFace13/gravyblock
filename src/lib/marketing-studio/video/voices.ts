/**
 * The free, offline voice catalog (Kokoro-82M, Apache-2.0, run on our own VPS: $0 per video). Every voice below has its model file installed on the worker. No paid text-to-speech
 * vendor is used or added without the owner's approval. `grade` is the quality grade the model's authors publish for the voice (A best); it is a guide, not a promise, which is why
 * the customer previews a voice before choosing it. Tone is not baked into a voice: it is the speaking pace, so the tone choices below are honest controls the engine really has.
 */
import type { StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";

export type VoiceInfo = { id: string; label: string; accent: "American" | "British"; gender: "female" | "male"; grade: "A" | "A-" | "B-" | "C+" | "C" | "D+" | "D" | "F+" };

const v = (id: string, label: string, accent: VoiceInfo["accent"], gender: VoiceInfo["gender"], grade: VoiceInfo["grade"]): VoiceInfo => ({ id, label, accent, gender, grade });
export const VOICES: VoiceInfo[] = [
  v("af_heart", "Heart", "American", "female", "A"),
  v("af_bella", "Bella", "American", "female", "A-"),
  v("af_nicole", "Nicole", "American", "female", "B-"),
  v("af_aoede", "Aoede", "American", "female", "C+"),
  v("af_kore", "Kore", "American", "female", "C+"),
  v("af_sarah", "Sarah", "American", "female", "C+"),
  v("af_alloy", "Alloy", "American", "female", "C"),
  v("af_nova", "Nova", "American", "female", "C"),
  v("am_fenrir", "Fenrir", "American", "male", "C+"),
  v("am_michael", "Michael", "American", "male", "C+"),
  v("am_puck", "Puck", "American", "male", "C+"),
  v("bf_emma", "Emma", "British", "female", "B-"),
  v("bf_isabella", "Isabella", "British", "female", "C"),
  v("bm_george", "George", "British", "male", "C"),
  v("bm_fable", "Fable", "British", "male", "C"),
];
/**
 * The curated selection a customer sees: the best-graded voices, a spread of American and British and of female and male, eight in all. The other installed voices stay available to
 * the engine but are not offered, so the settings page is a short list and not a raw dump.
 */
export const CURATED_IDS = ["af_heart", "af_bella", "af_nicole", "af_sarah", "am_michael", "am_fenrir", "bf_emma", "bm_george"] as const;
export const OFFERED_VOICES = CURATED_IDS.map((id) => VOICES.find((x) => x.id === id) as VoiceInfo);
export const localeOf = (v: VoiceInfo) => (v.accent === "American" ? "en-US" : "en-GB");
export const PREVIEW_CATALOG_KEY = "voice_preview_catalog";
export const previewUrlFor = (voiceId: string) => `/api/admin/marketing-studio/voice-preview/${voiceId}`;
/** What each customer-facing voice card shows. `style` comes only from measuring the preview audio (pitch and pace); it is null until the previews have been made. */
export type VoiceCard = { id: string; label: string; locale: string; gender: string; grade: string; style: string | null; previewUrl: string };
export async function voiceCards(db: StudioDb): Promise<VoiceCard[]> {
  const measured = await getSetting<Record<string, string>>(PREVIEW_CATALOG_KEY, {}, db);
  return OFFERED_VOICES.map((v) => ({ id: v.id, label: `${v.label} (${v.accent}, ${v.gender})`, locale: localeOf(v), gender: v.gender, grade: v.grade, style: measured[v.id] ?? null, previewUrl: previewUrlFor(v.id) }));
}

/** Tone = pace. 1.0 is the plain reading speed. These are the only tones offered because pace is the only tone control the free engine really has. */
export const TONES = {
  relaxed: { label: "Relaxed", speed: 0.94 },
  conversational: { label: "Conversational", speed: 1.0 },
  professional: { label: "Professional", speed: 1.02 },
  confident: { label: "Confident", speed: 1.04 },
  upbeat: { label: "Upbeat", speed: 1.08 },
  energetic: { label: "Energetic", speed: 1.13 },
} as const;
export type ToneKey = keyof typeof TONES;

export type VoiceSetting = {
  /** the brand voice: used for every video unless variation allows otherwise */
  voice: string;
  tone: ToneKey;
  /** none: always the same voice at the same pace. pacing: the same narrator, pace varied a little per video. alternate: an approved second narrator may be used (only if the customer turns this on) */
  variation: "none" | "pacing" | "alternate";
  /** extra approved narrators, used only when variation is "alternate" */
  alternates?: string[];
  /** word -> how to say it */
  pronunciations?: Record<string, string>;
};
export const DEFAULT_VOICE: VoiceSetting = { voice: "af_heart", tone: "conversational", variation: "none" };
export const voiceKey = (productId: string) => `video_voice_${productId}`;

export const isOffered = (id: string) => OFFERED_VOICES.some((x) => x.id === id);

/** Pure: validates a customer's choice. Unknown or unoffered voices and tones are refused rather than silently replaced. */
export function validateVoiceSetting(s: Partial<VoiceSetting>): { ok: true; value: VoiceSetting } | { ok: false; error: string } {
  const voice = s.voice ?? DEFAULT_VOICE.voice;
  if (!isOffered(voice)) return { ok: false, error: `"${voice}" is not one of the offered voices` };
  const tone = s.tone ?? DEFAULT_VOICE.tone;
  if (!(tone in TONES)) return { ok: false, error: `"${tone}" is not an offered tone` };
  const variation = s.variation ?? "none";
  if (!["none", "pacing", "alternate"].includes(variation)) return { ok: false, error: "variation must be none, pacing or alternate" };
  const alternates = (s.alternates ?? []).filter(isOffered).filter((a) => a !== voice);
  if (variation === "alternate" && alternates.length === 0) return { ok: false, error: "choose at least one alternate narrator to allow narrator variation" };
  const pron = Object.fromEntries(Object.entries(s.pronunciations ?? {}).filter(([k, val]) => k.trim() && typeof val === "string" && val.trim()).slice(0, 200));
  return { ok: true, value: { voice, tone, variation, ...(alternates.length ? { alternates } : {}), ...(Object.keys(pron).length ? { pronunciations: pron } : {}) } };
}

/** Pure: the voice and pace for the nth video. The brand voice never changes unless the customer allowed it. */
export function pickVoice(s: VoiceSetting, videoIndex: number): { voice: string; speed: number } {
  const base = TONES[s.tone].speed;
  if (s.variation === "pacing") return { voice: s.voice, speed: +(base * (1 + [0, 0.02, -0.02, 0.03][videoIndex % 4])).toFixed(3) };
  if (s.variation === "alternate" && s.alternates?.length && videoIndex % 3 === 2) return { voice: s.alternates[Math.floor(videoIndex / 3) % s.alternates.length], speed: base };
  return { voice: s.voice, speed: base };
}

export async function voiceSettingFor(db: StudioDb, productId: string): Promise<VoiceSetting> {
  return getSetting<VoiceSetting>(voiceKey(productId), DEFAULT_VOICE, db);
}
export async function saveVoiceSetting(db: StudioDb, actor: string, productId: string, s: Partial<VoiceSetting>) {
  const r = validateVoiceSetting(s);
  if (!r.ok) throw new Error(r.error);
  await setSetting(voiceKey(productId), r.value, actor, db);
  return r.value;
}

/** The preview line a customer hears for a voice: their own brand name, so the sample sounds like their videos. */
export const previewText = (brand: string) => `Hi, this is how ${brand} sounds. Short, clear and easy to follow.`;
