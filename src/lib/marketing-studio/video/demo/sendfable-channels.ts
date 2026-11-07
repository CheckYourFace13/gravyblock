/**
 * SendFable video 2 of 3: "One list. Email, text, or both?" A product demo for someone who texts customers in one tool and emails them in another. It shows
 * the three channels, the pricing page's real Monthly/Annual switch, the text messaging plans, and the page's own pricing questions (a real accordion). It does
 * not repeat video 1 (goal picker, Scribe, builder, Free plan). Every figure is read from the live pricing page; text is described as the separate paid add-on
 * the page says it is. The voice says the name as two words; captions and the end card keep the written brand, SendFable.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import type { BuiltDkDemo } from "./drinkknird";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type CursorKey, type Manifest, type NarrationLine, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const SFC_TITLE = "SendFable: one list, email, text, or both, and what texting costs";
export const SFC_CTA = { text: "See email and text pricing", url: "https://sendfable.com/pricing", display: "sendfable.com" };

export const SFC_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "channels", spoken: "One list. Email, text, or both?", claims: ["c-channel"] },
  { id: "L2", sceneId: "channels", spoken: "Pick the channel that fits the message: {em}email, {tx}text, or {bt}both in one campaign.", claims: ["c-channel"] },
  { id: "L3", sceneId: "billing", spoken: "Email starts free. {an}Switch to annual billing, and two months are free.", claims: ["c-free", "c-annual"] },
  { id: "L4", sceneId: "textplans", spoken: "{tp}Text is a separate add-on, with plans from nineteen ninety-nine a month.", caption: "Text is a separate add-on, with plans from $19.99 a month.", claims: ["c-text"] },
  { id: "L5", sceneId: "faq", spoken: "{q}The pricing questions spell it out: a ninety-nine dollar activation fee. {c}And you can cancel anytime.", caption: "The pricing questions spell it out: a $99 activation fee. And you can cancel anytime.", claims: ["c-text", "c-cancel"] },
  { id: "L6", sceneId: "end", spoken: "One list, email and text, at send fable dot com.", caption: "One list, email and text, at sendfable.com.", claims: ["c-cta"] },
];

export const SFC_CLAIMS: Claim[] = [
  { id: "c-channel", text: "SendFable uses the same contacts and the same campaign flow, and a campaign can go out as email, text or both.", facts: ["Same contacts. Same campaign flow. Choose the channel that fits the message.", "One audience, one campaign: email and text together without juggling tools."], sources: [{ plate: "channels", quote: "Pick Email, Text, or Both" }, { plate: "channels", quote: "Same contacts. Same campaign flow." }, { plate: "channels", quote: "One audience, one campaign: email and text together without juggling tools." }] },
  { id: "c-free", text: "SendFable has a Free plan for email.", facts: ["Up to 500 contacts"], sources: [{ plate: "billing", quote: "Up to 500 contacts" }, { plate: "billing", quote: "Start writing free" }] },
  { id: "c-annual", text: "Annual billing includes two months free.", facts: ["Two months free with annual billing."], sources: [{ plate: "billing", quote: "Two months free with annual billing." }, { plate: "billing", quote: "billed yearly" }] },
  { id: "c-text", text: "Text messaging is a separate paid add-on with a one-time activation fee and plans from $19.99 a month.", facts: ["Text messaging is a separate paid add-on. There is a $99.00 activation fee, then a monthly text plan starting at $19.99 plus $0.05 per outbound segment on Text Entry. A campaign can be Email, Text, or Both."], sources: [{ plate: "textplans", quote: "Text messaging plans" }, { plate: "textplans", quote: "$19.99/month" }, { plate: "faq", quote: "Text messaging is a separate paid add-on." }, { plate: "faq", quote: "$99.00 activation fee" }] },
  { id: "c-cancel", text: "A customer can cancel anytime; cancelling stops renewal at the end of the period already paid for.", facts: ["Yes. Cancel from Billing. Cancellation stops renewal at the end of the period you already paid for."], sources: [{ plate: "faq", quote: "Can I cancel anytime?" }, { plate: "faq", quote: "Cancellation stops renewal at the end of the period you already paid for." }] },
  { id: "c-cta", text: "SendFable describes itself as email and text marketing without the marketing-software headache, and links to its email and text pricing.", facts: ["Email and text marketing without the marketing-software headache"], sources: [{ plate: "channels", quote: "Email and text marketing without the marketing-software headache" }, { plate: "channels", quote: "See email and text pricing" }] },
];

export const SFC_FACTS: Array<{ plate: string; value: string }> = [
  { plate: "channels", value: "Same contacts. Same campaign flow. Choose the channel that fits the message." },
  { plate: "channels", value: "One audience, one campaign: email and text together without juggling tools." },
  { plate: "channels", value: "Email and text marketing without the marketing-software headache" },
  { plate: "billing", value: "Up to 500 contacts" },
  { plate: "billing", value: "Two months free with annual billing." },
  { plate: "faq", value: "Text messaging is a separate paid add-on. There is a $99.00 activation fee, then a monthly text plan starting at $19.99 plus $0.05 per outbound segment on Text Entry. A campaign can be Email, Text, or Both." },
  { plate: "faq", value: "Yes. Cancel from Billing. Cancellation stops renewal at the end of the period you already paid for." },
];

export const SFC_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "channels", kind: "headline", text: "Email, text, or both", claim: "c-channel" },
  { sceneId: "channels", kind: "label", text: "Same contacts", claim: "c-channel" },
  { sceneId: "billing", kind: "headline", text: "Email starts free", claim: "c-free" },
  { sceneId: "billing", kind: "label", text: "Annual billing", claim: "c-annual" },
  { sceneId: "billing", kind: "label", text: "Two months free", claim: "c-annual" },
  { sceneId: "textplans", kind: "headline", text: "Text is an add-on", claim: "c-text" },
  { sceneId: "textplans", kind: "label", text: "$19.99/month", claim: "c-text" },
  { sceneId: "faq", kind: "headline", text: "How texting is priced", claim: "c-text" },
  { sceneId: "faq", kind: "label", text: "$99 activation fee", claim: "c-text" },
  { sceneId: "faq", kind: "label", text: "Cancel anytime", claim: "c-cancel" },
  { sceneId: "end", kind: "headline", text: "One list, email and text.", claim: "c-channel" },
  { sceneId: "end", kind: "cta", text: "See email and text pricing", claim: "c-cta" },
];

export const SFC_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  channels: { plate: "channels", purpose: "Hook and first idea: one list reaches people by email, text or both.", motion: ["camera moves down the three channel cards", "focus highlight on email, then text, then both", "labels pop in on each highlight", "headline springs in and out"], note: "Real capture of the Pick Email, Text, or Both section of sendfable.com." },
  billing: { plate: "billing", purpose: "Email starts free, and the real billing switch shows annual billing.", motion: ["touch cursor taps Annual on the real Monthly and Annual switch", "the prices change and a two-months-free note appears", "touch cursor taps Monthly again", "camera moves from the switch to the Starter price"], note: "Real states of sendfable.com/pricing produced by clicking its Monthly and Annual buttons." },
  textplans: { plate: "textplans", purpose: "Text is a separate add-on: what the plans are.", motion: ["camera moves down to the text messaging plans", "focus highlight on the Text Entry plan", "focus highlight on its monthly price", "headline springs in and out"], note: "Real capture of the Text messaging plans section of sendfable.com/pricing." },
  faq: { plate: "faq", purpose: "The page's own pricing questions answer how texting is billed and whether you can cancel.", motion: ["touch cursor taps How does SMS pricing work and the answer opens", "touch cursor taps Can I cancel anytime and that answer opens", "camera follows from the question to each answer", "focus highlight on the answer with a label"], note: "Real states of the pricing questions on sendfable.com/pricing, produced by clicking them." },
  end: { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no product screen is claimed." },
};

const END_LEAD_MS = 1350;

export function sfcLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 300;
  SFC_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === SFC_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 450;
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

export function sfcBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltDkDemo {
  const plate = (id: string) => manifest.plates[id];
  const parsed = Object.fromEntries(SFC_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(SFC_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };

  const order = ["channels", "billing", "textplans", "faq"];
  const lastEnd = (scene: string) => Math.max(...SFC_NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "faq" ? 1300 : 600) };
  });
  const endStart = win.faq.e - TRANSITION_MS;
  const durationMs = lt.L6.end + 1500;
  const scenes: StageScene[] = [];

  // ---- channels ----
  {
    const P = plate("channels");
    const S = win.channels.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.channels.e - S;
    const tEm = r(mt("L2", "em"));
    const tTx = r(mt("L2", "tx"));
    const tBt = r(mt("L2", "bt"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 100, zoom: 1.0 },
      { t: tEm - 300, cx: 195, cy: center(P.rects.email)[1], zoom: 1.05 },
      { t: tTx - 300, cx: 195, cy: center(P.rects.text)[1], zoom: 1.05 },
      { t: tBt - 300, cx: 195, cy: center(P.rects.both)[1], zoom: 1.06 },
      { t: E, cx: 195, cy: center(P.rects.both)[1] + 30, zoom: 1.1 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tEm - 150, to: tTx - 200, rect: P.rects.email, label: "Email" },
      { from: tTx - 150, to: tBt - 200, rect: P.rects.text, label: "Text" },
      { from: tBt - 150, to: E - 250, rect: P.rects.both, label: "Same contacts" },
    ];
    scenes.push({ id: "channels", kind: "screen", start: S, end: win.channels.e, plate: "channels", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Email, text, or both", from: 60, to: Math.max(1500, r(lt.L1.end) + 500) } });
  }

  // ---- billing: the real Monthly / Annual switch ----
  {
    const P = plate("billing");
    const S = win.billing.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.billing.e - S;
    const tAn = r(mt("L3", "an"));
    const an = center(P.rects.annual);
    const tog = center(P.rects.toggles);
    const backAt = Math.max(tAn + 1900, E - 1000);
    const states = [{ at: 0, state: "s0" }, { at: tAn + 120, state: "annual" }, { at: backAt + 120, state: "back" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: tog[1] - 100 },
      { t: tAn - 320, x: an[0], y: an[1] },
      { t: tAn, x: an[0], y: an[1], tap: true },
      { t: backAt - 300, x: tog[0] - 60, y: tog[1] },
      { t: backAt, x: tog[0] - 60, y: tog[1], tap: true },
      { t: E - 300, x: tog[0] - 60, y: tog[1], hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 120, zoom: 1.0 },
      { t: tAn - 500, cx: 195, cy: tog[1] + 80, zoom: 1.05 },
      { t: tAn + 600, cx: 195, cy: center(P.rects.card)[1], zoom: 1.08 },
      { t: E, cx: 195, cy: center(P.rects.card)[1] + 30, zoom: 1.1 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tAn - 150, to: tAn + 500, rect: P.rects.toggles, label: "Annual billing" },
      { from: tAn + 650, to: Math.max(tAn + 1500, backAt - 150), rect: P.rects.banner, label: "Two months free" },
    ];
    scenes.push({ id: "billing", kind: "screen", start: S, end: win.billing.e, plate: "billing", states, camera, cursor, spots, headline: { text: "Email starts free", from: 60, to: Math.max(1500, tAn - 120) } });
  }

  // ---- text plans ----
  {
    const P = plate("textplans");
    const S = win.textplans.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.textplans.e - S;
    const tTp = r(mt("L4", "tp"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 140, zoom: 1.0 },
      { t: tTp + 300, cx: 195, cy: center(P.rects.entry)[1] - 30, zoom: 1.06 },
      { t: E, cx: 195, cy: center(P.rects.price)[1] + 40, zoom: 1.1 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tTp + 250, to: Math.max(tTp + 1800, E - 1800), rect: P.rects.entry },
      { from: Math.max(tTp + 1900, E - 1700), to: E - 250, rect: P.rects.price, label: "$19.99/month" },
    ];
    scenes.push({ id: "textplans", kind: "screen", start: S, end: win.textplans.e, plate: "textplans", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Text is an add-on", from: 60, to: Math.max(1500, tTp + 200) } });
  }

  // ---- the pricing questions (a real accordion) ----
  {
    const P = plate("faq");
    const S = win.faq.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.faq.e - S;
    const tQ = r(mt("L5", "q"));
    const tC = r(mt("L5", "c"));
    const q = center(P.rects.smsQ);
    const cq = center(P.rects.cancelQ);
    const ans = center(P.rects.answer);
    const states = [{ at: 0, state: "s0" }, { at: tQ + 120, state: "sms" }, { at: tC + 120, state: "cancel" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: q[1] - 120 },
      { t: tQ - 320, x: q[0] - 20, y: q[1] },
      { t: tQ, x: q[0] - 20, y: q[1], tap: true },
      { t: tC - 360, x: cq[0] - 20, y: cq[1] },
      { t: tC, x: cq[0] - 20, y: cq[1], tap: true },
      { t: E - 300, x: cq[0] - 20, y: cq[1], hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: q[1] + 40, zoom: 1.0 },
      { t: tQ - 400, cx: 195, cy: q[1] + 50, zoom: 1.05 },
      { t: tQ + 500, cx: 195, cy: ans[1], zoom: 1.08 },
      { t: tC - 300, cx: 195, cy: cq[1], zoom: 1.08 },
      { t: E, cx: 195, cy: cq[1] + 40, zoom: 1.1 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tQ + 450, to: tC - 450, rect: P.rects.answer, label: "$99 activation fee" },
      { from: tC + 400, to: E - 250, rect: P.rects.cancelQ, label: "Cancel anytime" },
    ];
    scenes.push({ id: "faq", kind: "screen", start: S, end: win.faq.e, plate: "faq", states, camera, cursor, spots, headline: { text: "How texting is priced", from: 60, to: Math.max(1500, tQ - 100) } });
  }

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "One list, email and text.", button: SFC_CTA.text, url: SFC_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of SFC_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = {};
  for (const id of ["channels", "billing", "textplans", "faq"]) {
    const p = plate(id);
    plates[id] = { w: PLATE_CSS_W, h: p.h, states: Object.fromEntries(Object.entries(p.states).map(([k, s]) => [k, s.file])) };
  }
  return {
    timeline: { durationMs, brand: { name: "SendFable", accent: "#c44732", dark: "#17213b", light: "#fbf3ea", logo: manifest.logo, palette: { blobs: ["#f2a38f", "#17213b"], endFrom: "#c44732", endMid: "#8f2f1f", endTo: "#17213b", button: "#a93a28", ripple: "rgba(196,71,50,.25)" } }, plates, scenes, captions },
    lineWords,
    scenes,
  };
}
