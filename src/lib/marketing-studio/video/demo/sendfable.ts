/**
 * The SendFable acquisition video: problem first (a blank email), then the real goal picker on the live page, Scribe, Send Confidence and the Free plan.
 * Everything shown is a real state of sendfable.com captured at phone width; the goal chips are really clicked. Nothing shown is a logged-in screen,
 * and nothing says more than the public page says. Product-first: no parent branding. The call to action is the page's own Start free.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import type { BuiltDkDemo } from "./drinkknird";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type CursorKey, type Manifest, type NarrationLine, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const SF_TITLE = "SendFable: stuck on what to write? Pick a goal and send";
export const SF_CTA = { text: "Start free", url: "https://sendfable.com/signup", display: "sendfable.com" };

/** The voice says the name as two words ("Send Fable"); every caption and the end card keep the written brand exactly: SendFable. */
export const SF_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "goals", spoken: "Staring at a blank email?", claims: ["c-goals"] },
  { id: "L2", sceneId: "goals", spoken: "Pick a goal, like {promo}promoting a sale or {back}bringing customers back, and Send Fable suggests the template and the subject line.", caption: "Pick a goal, like promoting a sale or bringing customers back, and SendFable suggests the template and the subject line.", claims: ["c-goals"] },
  { id: "L3", sceneId: "scribe", spoken: "Or let {scribe}Scribe turn your website updates into a ready draft. {none}Nothing sends until you say so.", claims: ["c-scribe"] },
  { id: "L4", sceneId: "builder", spoken: "Build it with simple blocks, check the {mob}phone preview, and {sc}Send Confidence flags problems, like a missing unsubscribe link.", claims: ["c-builder"] },
  { id: "L5", sceneId: "pricing", spoken: "Start free: {c}five hundred contacts, {e}a thousand emails a month.", caption: "Start free: 500 contacts, 1,000 emails a month.", claims: ["c-free"] },
  { id: "L6", sceneId: "end", spoken: "Email and text, without the headache. Start free at send fable dot com.", caption: "Email and text, without the headache. Start free at sendfable.com.", claims: ["c-cta"] },
];

export const SF_CLAIMS: Claim[] = [
  { id: "c-goals", text: "SendFable's goal picker suggests a template, a subject and a next step for a chosen goal such as promoting a sale or event or bringing customers back.", facts: ["Pick a goal. We suggest a template, subject, and next step, then you finish in your account."], sources: [{ plate: "goals", quote: "Not sure what to write?" }, { plate: "goals", quote: "Pick a goal. We suggest a template, subject, and next step" }, { plate: "goals", quote: "Promote a sale or event" }, { plate: "goals", quote: "Bring customers back" }, { plate: "goals", quote: "This weekend only" }] },
  { id: "c-scribe", text: "Scribe uses content posted on the site to create a campaign that looks like the business, and nothing sends until the owner chooses Send now or schedules it.", facts: ["SendFable uses that content to create a campaign that looks like your business.", "Nothing sends until you choose Send now or schedule it."], sources: [{ plate: "scribe", quote: "SendFable uses that content to create a campaign that looks like your business." }, { plate: "scribe", quote: "Nothing sends until you choose Send now or schedule it." }] },
  { id: "c-builder", text: "The email builder previews a campaign on desktop and mobile, and Send Confidence flags problems such as a missing unsubscribe link before sending.", facts: ["Drag blocks, drop in your brand colors, and preview on phone and desktop.", "Before you launch, we flag missing unsubscribes, weak links, and common footguns."], sources: [{ plate: "builder", quote: "Desktop" }, { plate: "builder", quote: "Mobile" }, { plate: "builder", quote: "Send Confidence" }, { plate: "builder", quote: "preview on phone and desktop" }, { plate: "builder", quote: "we flag missing unsubscribes, weak links, and common footguns" }] },
  { id: "c-free", text: "The Free plan includes up to 500 contacts and up to 1,000 emails a month, and needs no credit card.", facts: ["Up to 500 contacts", "Up to 1,000 emails/month", "No credit card · Cancel anytime"], sources: [{ plate: "pricing", quote: "Up to 500 contacts" }, { plate: "pricing", quote: "Up to 1,000 emails/month" }, { plate: "pricing", quote: "No credit card" }] },
  { id: "c-cta", text: "SendFable describes itself as email and text marketing without the marketing-software headache, with a Start free call to action.", facts: ["Email and text marketing without the marketing-software headache"], sources: [{ plate: "goals", quote: "Email and text marketing without the marketing-software headache" }, { plate: "goals", quote: "Start free" }] },
];

/** Product Truth facts this video needs. Each is added only if its exact text is on the live page it cites. */
export const SF_FACTS: Array<{ plate: string; value: string }> = [
  { plate: "goals", value: "Pick a goal. We suggest a template, subject, and next step, then you finish in your account." },
  { plate: "scribe", value: "SendFable uses that content to create a campaign that looks like your business." },
  { plate: "scribe", value: "Nothing sends until you choose Send now or schedule it." },
  { plate: "builder", value: "Drag blocks, drop in your brand colors, and preview on phone and desktop." },
  { plate: "builder", value: "Before you launch, we flag missing unsubscribes, weak links, and common footguns." },
  { plate: "pricing", value: "Up to 500 contacts" },
  { plate: "pricing", value: "Up to 1,000 emails/month" },
  { plate: "pricing", value: "No credit card · Cancel anytime" },
  { plate: "goals", value: "Email and text marketing without the marketing-software headache" },
];

export const SF_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "goals", kind: "headline", text: "Not sure what to write?", claim: "c-goals" },
  { sceneId: "goals", kind: "label", text: "Pick a goal", claim: "c-goals" },
  { sceneId: "goals", kind: "label", text: "Suggested subject", claim: "c-goals" },
  { sceneId: "scribe", kind: "headline", text: "Your updates, drafted", claim: "c-scribe" },
  { sceneId: "scribe", kind: "label", text: "You choose when it sends", claim: "c-scribe" },
  { sceneId: "builder", kind: "headline", text: "Check before you send", claim: "c-builder" },
  { sceneId: "builder", kind: "label", text: "Phone preview", claim: "c-builder" },
  { sceneId: "builder", kind: "label", text: "Send Confidence", claim: "c-builder" },
  { sceneId: "pricing", kind: "headline", text: "Free to start", claim: "c-free" },
  { sceneId: "pricing", kind: "label", text: "500 contacts", claim: "c-free" },
  { sceneId: "pricing", kind: "label", text: "1,000 emails a month", claim: "c-free" },
  { sceneId: "end", kind: "headline", text: "Email and text, without the headache.", claim: "c-cta" },
  { sceneId: "end", kind: "cta", text: "Start free", claim: "c-cta" },
];

export const SF_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  goals: { plate: "goals", purpose: "Hook and first demonstration: the blank-email problem, then the page's own goal picker, really clicked.", motion: ["touch cursor taps Promote a sale or event, then Bring customers back", "the suggested subject and template change with each goal", "camera moves from the goal chips to the suggestion", "focus highlight on the suggested subject"], note: "Real states of the sendfable.com goal picker, produced by clicking its chips on the live page." },
  scribe: { plate: "scribe", purpose: "The standout feature: Scribe drafts a campaign from website content and nothing sends until the owner chooses.", motion: ["camera scrolls down the page's own Scribe example", "focus highlight on the drafted campaign", "focus highlight on the owner's choice with a label", "headline springs in and out"], note: "Real capture of the Scribe section of sendfable.com (the page labels its example a fictional cafe)." },
  builder: { plate: "builder", purpose: "Trust and ease: build with blocks, check the phone preview, and let Send Confidence flag problems before sending.", motion: ["touch cursor taps Mobile, then Desktop on the preview toggle", "the email preview switches between the phone and desktop views", "camera moves from the preview toggle to the Send Confidence panel", "focus highlight on the Send Confidence panel"], note: "Real states of the sendfable.com email builder preview, produced by clicking its Desktop and Mobile buttons on the live page." },
  pricing: { plate: "pricing", purpose: "Removes the risk: the Free plan and what it includes.", motion: ["camera moves from the pricing heading to the Free plan", "focus highlight on contacts with a label", "focus highlight on emails with a label", "headline springs in and out"], note: "Real capture of the Free plan on sendfable.com." },
  end: { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no product screen is claimed." },
};

const END_LEAD_MS = 1350;

export function sfLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 300;
  SF_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === SF_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 450;
    const d = durMs[l.id];
    if (!d) throw new Error(`no audio duration for line ${l.id}`);
    out[l.id] = { start: t, end: t + d, durMs: d };
    t += d;
  });
  return out;
}

const center = (r: Rect): [number, number] => [r[0] + r[2] / 2, r[1] + r[3] / 2];

function ascending<T extends { t: number }>(keys: T[], gap = 140): T[] {
  const out: T[] = [];
  for (const k of keys.sort((a, b) => a.t - b.t)) {
    const prev = out[out.length - 1];
    out.push(prev && k.t < prev.t + gap ? { ...k, t: prev.t + gap } : k);
  }
  return out;
}

export function sfBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltDkDemo {
  const plate = (id: string) => manifest.plates[id];
  const parsed = Object.fromEntries(SF_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(SF_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };

  const order = ["goals", "scribe", "builder", "pricing"];
  const lastEnd = (scene: string) => Math.max(...SF_NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "pricing" ? 1200 : 400) };
  });
  const endStart = win.pricing.e - TRANSITION_MS;
  const durationMs = lt.L6.end + 1500;
  const scenes: StageScene[] = [];

  // ---- goal picker ----
  {
    const P = plate("goals");
    const S = win.goals.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.goals.e - S;
    const promo = center(P.rects.chipPromo);
    const back = center(P.rects.chipBack);
    const sub = center(P.rects.subject);
    const tPromo = r(mt("L2", "promo"));
    const tBack = r(mt("L2", "back"));
    const states = [{ at: 0, state: "s0" }, { at: tPromo + 140, state: "g1" }, { at: tBack + 140, state: "g2" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: promo[1] - 90 },
      { t: tPromo - 300, x: promo[0], y: promo[1] },
      { t: tPromo, x: promo[0], y: promo[1], tap: true },
      { t: tBack - 320, x: back[0], y: back[1] },
      { t: tBack, x: back[0], y: back[1], tap: true },
      { t: E - 600, x: sub[0] + 40, y: sub[1] + 20 },
      { t: E - 300, x: sub[0] + 40, y: sub[1] + 20, hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.chips)[1] + 60, zoom: 1.0 },
      { t: tPromo - 500, cx: 195, cy: center(P.rects.chips)[1] + 90, zoom: 1.06 },
      { t: tBack + 500, cx: 195, cy: center(P.rects.card)[1] - 30, zoom: 1.08 },
      { t: E, cx: 195, cy: center(P.rects.card)[1] - 26, zoom: 1.08 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tPromo - 140, to: tBack - 360, rect: P.rects.chipPromo, label: "Pick a goal" },
      { from: tBack + 600, to: E - 250, rect: P.rects.subject, label: "Suggested subject" },
    ];
    scenes.push({ id: "goals", kind: "screen", start: S, end: win.goals.e, plate: "goals", states, camera, cursor, spots, headline: { text: "Not sure what to write?", from: 60, to: Math.max(1400, r(lt.L1.end) + 500) } });
  }

  // ---- scribe ----
  {
    const P = plate("scribe");
    const S = win.scribe.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.scribe.e - S;
    const tScribe = r(mt("L3", "scribe"));
    const tNone = r(mt("L3", "none"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 120, zoom: 1.0 },
      { t: tScribe + 200, cx: 195, cy: center(P.rects.content)[1], zoom: 1.04 },
      { t: tNone - 500, cx: 195, cy: center(P.rects.look)[1], zoom: 1.04 },
      { t: tNone + 200, cx: 195, cy: center(P.rects.choose)[1], zoom: 1.06 },
      { t: E, cx: 195, cy: center(P.rects.choose)[1] + 4, zoom: 1.06 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tScribe + 400, to: tNone - 250, rect: P.rects.look },
      { from: tNone - 100, to: E - 250, rect: P.rects.choose, label: "You choose when it sends" },
    ];
    scenes.push({ id: "scribe", kind: "screen", start: S, end: win.scribe.e, plate: "scribe", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Your updates, drafted", from: 60, to: Math.max(1500, tScribe - 80) } });
  }

  // ---- builder ----
  {
    const P = plate("builder");
    const S = win.builder.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.builder.e - S;
    const tMob = r(mt("L4", "mob"));
    const tSc = r(mt("L4", "sc"));
    const mobC = center(P.rects.mobile);
    const togC = center(P.rects.toggles);
    const scoreC = center(P.rects.score);
    const states = [{ at: 0, state: "s0" }, { at: tMob + 120, state: "mob" }, { at: tSc - 700, state: "desk" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: mobC[1] - 100 },
      { t: tMob - 280, x: mobC[0], y: mobC[1] },
      { t: tMob, x: mobC[0], y: mobC[1], tap: true },
      { t: tSc - 1000, x: togC[0] - 40, y: togC[1] },
      { t: tSc - 700, x: togC[0] - 40, y: togC[1], tap: true },
      { t: tSc - 200, x: scoreC[0] + 60, y: scoreC[1] },
      { t: E - 300, x: scoreC[0] + 60, y: scoreC[1], hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: togC[1] + 80, zoom: 1.0 },
      { t: tMob - 400, cx: 195, cy: togC[1] + 110, zoom: 1.06 },
      { t: tSc - 300, cx: 195, cy: scoreC[1] - 20, zoom: 1.08 },
      { t: E, cx: 195, cy: scoreC[1] - 16, zoom: 1.08 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tMob - 120, to: tSc - 800, rect: P.rects.toggles, label: "Phone preview" },
      { from: tSc - 100, to: E - 250, rect: P.rects.score, label: "Send Confidence" },
    ];
    scenes.push({ id: "builder", kind: "screen", start: S, end: win.builder.e, plate: "builder", states, camera, cursor, spots, headline: { text: "Check before you send", from: 60, to: Math.max(1500, tMob - 160) } });
  }

  // ---- pricing ----
  {
    const P = plate("pricing");
    const S = win.pricing.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.pricing.e - S;
    const tC = r(mt("L5", "c"));
    const tE = r(mt("L5", "e"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 140, zoom: 1.0 },
      { t: tC - 300, cx: 195, cy: center(P.rects.card)[1], zoom: 1.08 },
      { t: E, cx: 195, cy: center(P.rects.card)[1] + 4, zoom: 1.08 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tC - 100, to: tE - 160, rect: P.rects.contacts, label: "500 contacts" },
      { from: tE - 100, to: E - 250, rect: P.rects.emails, label: "1,000 emails a month" },
    ];
    scenes.push({ id: "pricing", kind: "screen", start: S, end: win.pricing.e, plate: "pricing", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Free to start", from: 60, to: Math.max(1400, tC - 120) } });
  }

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "Email and text, without the headache.", button: SF_CTA.text, url: SF_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of SF_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = {};
  for (const id of ["goals", "scribe", "builder", "pricing"]) {
    const p = plate(id);
    plates[id] = { w: PLATE_CSS_W, h: p.h, states: Object.fromEntries(Object.entries(p.states).map(([k, s]) => [k, s.file])) };
  }
  return {
    timeline: { durationMs, brand: { name: "SendFable", accent: "#c44732", dark: "#17213b", light: "#fbf3ea", logo: manifest.logo, palette: { blobs: ["#f2a38f", "#17213b"], endFrom: "#c44732", endMid: "#8f2f1f", endTo: "#17213b", button: "#a93a28", ripple: "rgba(196,71,50,.25)" } }, plates, scenes, captions },
    lineWords,
    scenes,
  };
}
