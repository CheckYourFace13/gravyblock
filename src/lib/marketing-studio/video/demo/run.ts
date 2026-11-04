/**
 * Produces the RentalNoodle pilot demo end to end: capture the live product, verify the facts it needs, record the voice, build the timeline,
 * mix the audio, render the frames, and run QA. `produceDemo` makes the file and the record; `renderDemoVideoJob` stores it for review.
 * Nothing here posts, schedules or connects anything.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { audit } from "../../audit";
import { STUDIO_DIRS, STUDIO_TTS_DIR } from "../../config";
import { readAssetBytes } from "../../creative/context";
import { ms, requireStudioDb, type StudioDb } from "../../db";
import { addFact, listFacts, listProducts, verifyFact } from "../../repository";
import { INTERNAL_SCOPE, type OwnerScope } from "../../scope";
import { storeVideoFile } from "../store";
import { audioInfo, mixAudio, parseSpoken, placeLines, synthesizeLines, synthMusic, writeWav } from "./audio";
import { capturePlates } from "./plates";
import { renderDemo } from "./render";
import { runDemoQa, type DemoQaResult } from "./qa";
import { buildTimeline, CLAIMS, CTA, DEMO_FACTS, layoutLines, NARRATION, ON_SCREEN, SCENE_META, TITLE } from "./rentalnoodle";
import type { DemoRecord, Manifest } from "./types";

export const DEMO_ACTOR = "pilot-prep (public sources, owner directive)";
export const VOICE_ID = "af_heart";
export const VOICE_SPEED = 1.04;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

type FactLite = { id: string; value: string; verified: boolean };

/**
 * Adds the few Product Truth facts this video needs. A fact is only added when its exact text is on the live page it cites, which is what
 * lets it be marked verified. With write=false (a dry run) nothing is stored and the facts count as prospective.
 */
export async function ensureFacts(db: StudioDb, scope: OwnerScope, productId: string, manifest: Manifest, write: boolean): Promise<FactLite[]> {
  const out: FactLite[] = (await listFacts(scope, productId, db)).filter((f) => f.status === "current").map((f) => ({ id: f.id, value: f.factValue, verified: Boolean(f.verifiedAt) }));
  for (const d of DEMO_FACTS) {
    const plate = manifest.plates[d.plate];
    if (!plate) throw new Error(`no captured page "${d.plate}" for fact "${d.value.slice(0, 40)}"`);
    if (!norm(plate.text).includes(norm(d.value))) throw new Error(`The live page ${plate.url} no longer says "${d.value.slice(0, 60)}". Not adding it as a fact.`);
    const existing = out.find((f) => norm(f.value) === norm(d.value));
    if (existing?.verified) continue;
    if (!write) {
      out.push({ id: `prospective:${out.length}`, value: d.value, verified: true });
      continue;
    }
    const row = await addFact(scope, DEMO_ACTOR, productId, { factKey: "capability", factValue: d.value, sourceKind: "public_page", sourceUrl: plate.url }, db);
    await verifyFact(scope, DEMO_ACTOR, productId, row.id, db);
    if (existing) existing.verified = true;
    else out.push({ id: row.id, value: d.value, verified: true });
  }
  return out;
}

export type ProducedDemo = {
  file: string;
  record: DemoRecord;
  qa: DemoQaResult;
  stats: { captureMs: number; voiceMs: number; renderMs: number; frames: number };
  manifest: Manifest;
};

export async function produceDemo(opts: { db: StudioDb; scope?: OwnerScope; workDir: string; writeFacts: boolean; log?: (m: string) => void; ttsDir?: string; reuse?: { manifest?: boolean } }): Promise<ProducedDemo> {
  const { db, workDir } = opts;
  const scope = opts.scope ?? INTERNAL_SCOPE;
  const log = opts.log ?? (() => {});
  await fs.mkdir(workDir, { recursive: true });
  const product = (await listProducts(scope, db)).find((p) => p.slug === "rentalnoodle");
  if (!product) throw new Error("RentalNoodle is not a Studio product");

  // 1. capture the real product
  const platesDir = path.join(workDir, "stage");
  await fs.mkdir(platesDir, { recursive: true });
  const [logoAsset] = (await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, product.id))).filter((a) => a.kind === "logo" && a.approved === "true");
  if (!logoAsset) throw new Error("RentalNoodle has no approved logo asset");
  const logoFile = path.join(platesDir, "logo.png");
  await fs.writeFile(logoFile, await readAssetBytes(logoAsset));
  const t0 = Date.now();
  let manifest: Manifest;
  if (opts.reuse?.manifest) manifest = JSON.parse(await fs.readFile(path.join(platesDir, "manifest.json"), "utf8")) as Manifest;
  else {
    log("capturing the live product pages");
    manifest = await capturePlates(platesDir, logoFile);
  }
  const captureMs = Date.now() - t0;

  // 2. facts the claims rest on
  const facts = await ensureFacts(db, scope, product.id, manifest, opts.writeFacts);

  // 3. voiceover
  log("recording the voiceover");
  const t1 = Date.now();
  const synth = await synthesizeLines(NARRATION.map((l) => ({ id: l.id, text: parseSpoken(l.spoken).words.join(" ") })), { ttsDir: opts.ttsDir ?? STUDIO_TTS_DIR, voice: VOICE_ID, speed: VOICE_SPEED });
  const voiceMs = Date.now() - t1;
  const dur = Object.fromEntries(synth.map((s) => [s.id, Math.round((s.samples.length / s.rate) * 1000)]));
  const lineTimes = layoutLines(dur);
  const built = buildTimeline(manifest, lineTimes);
  const { timeline } = built;

  // 4. audio mix
  log("mixing voice and music");
  const rate = synth[0].rate;
  const vo = placeLines(synth.map((s) => ({ samples: s.samples, rate: s.rate, startMs: lineTimes[s.id].start })), timeline.durationMs + 300, rate);
  await writeWav(path.join(workDir, "vo.wav"), [vo], rate);
  const [ml, mr] = synthMusic(timeline.durationMs / 1000 + 0.4);
  await writeWav(path.join(workDir, "music.wav"), [ml, mr], 44100);
  await mixAudio(path.join(workDir, "vo.wav"), path.join(workDir, "music.wav"), path.join(workDir, "mix.wav"), timeline.durationMs / 1000);

  // 5. video
  log("rendering frames");
  const outFile = path.join(workDir, "demo.mp4");
  const rendered = await renderDemo({ dir: platesDir, timeline, audioFile: path.join(workDir, "mix.wav"), outFile, onProgress: (d, n) => log(`frame ${d}/${n}`) });

  // 6. the record the Review page shows, and QA against it
  const claims = CLAIMS.map((c) => {
    const matches = c.facts.map((frag) => facts.filter((f) => norm(f.value).includes(norm(frag))));
    const factIds = [...new Set(matches.flat().map((f) => f.id))];
    return {
      id: c.id,
      text: c.text,
      sceneId: NARRATION.find((l) => l.claims.includes(c.id))?.sceneId ?? ON_SCREEN.find((o) => o.claim === c.id)?.sceneId ?? "",
      factIds,
      factsVerified: matches.every((m) => m.some((f) => f.verified)),
      sources: c.sources.map((s) => {
        const p = manifest.plates[s.plate];
        return { url: p?.url ?? "", capturedAt: p?.capturedAt ?? "", quote: s.quote, onPage: Boolean(p && norm(p.text).includes(norm(s.quote))) };
      }),
    };
  });
  const sceneRows: DemoRecord["scenes"] = timeline.scenes.map((s) => {
    const meta = SCENE_META[s.id];
    const plate = s.plate ? manifest.plates[s.plate] : undefined;
    return {
      id: s.id,
      kind: s.kind,
      startMs: s.start,
      endMs: s.end,
      purpose: meta.purpose,
      motion: meta.motion,
      headline: s.headline?.text ?? s.end_card?.headline,
      sourceVisual: plate ? { plate: plate.id, url: plate.url, capturedAt: plate.capturedAt, states: Object.values(plate.states).map((x) => (x.result ? `${x.label}: ${x.result.replace(/\s+/g, " ").slice(0, 60)}` : x.label)), note: meta.note } : undefined,
    };
  });
  const record: DemoRecord = {
    version: 2,
    kind: "demo",
    classification: "PRODUCT_DEMO",
    title: TITLE,
    durationMs: timeline.durationMs,
    transcript: NARRATION.map((l) => ({ id: l.id, sceneId: l.sceneId, text: parseSpoken(l.spoken).words.join(" "), caption: l.caption ?? parseSpoken(l.spoken).words.join(" "), startMs: lineTimes[l.id].start, endMs: lineTimes[l.id].end })),
    scenes: sceneRows,
    claims,
    onScreen: ON_SCREEN,
    cta: { text: CTA.text, url: CTA.url },
    audio: audioInfo(VOICE_ID, VOICE_SPEED),
    capturedAt: manifest.capturedAt,
  };
  log("checking quality");
  const endScene = timeline.scenes.find((s) => s.kind === "end")!;
  const qa = await runDemoQa({
    file: outFile,
    expectedMs: timeline.durationMs,
    record,
    timeline,
    manifest,
    narration: NARRATION,
    lineTimes,
    voicedMs: Object.values(dur).reduce((a, b) => a + b, 0),
    onScreenTexts: ON_SCREEN.map((o) => o.text),
    endStartMs: endScene.start,
    mixFile: path.join(workDir, "mix.wav"),
  });
  return { file: outFile, record, qa, stats: { captureMs, voiceMs, renderMs: rendered.wallMs, frames: rendered.frames }, manifest };
}

/** Worker job: render the demo for a stored ms_videos row and hand it to the owner for review. */
export async function renderDemoVideoJob(input: { videoId?: string }, scope: OwnerScope = INTERNAL_SCOPE, db: StudioDb = requireStudioDb()) {
  if (!input.videoId) throw new Error("render_demo_video needs a videoId");
  const [video] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, input.videoId)).limit(1);
  if (!video) throw new Error("video not found");
  await db.update(ms.msVideos).set({ status: "rendering", error: null }).where(eq(ms.msVideos.id, video.id));
  const dir = path.join(STUDIO_DIRS.tmp, `demo-${video.id}`);
  try {
    const t0 = Date.now();
    const made = await produceDemo({ db, scope, workDir: dir, writeFacts: true });
    const stored = await storeVideoFile(scope, "studio-worker", video.productId, made.file, { width: 1080, height: 1920, name: `${made.record.title}.mp4` }, db);
    const status = made.qa.passed ? "ready_for_review" : "qa_failed";
    await db
      .update(ms.msVideos)
      .set({ storyboard: made.record, assetId: stored.id, width: 1080, height: 1920, durationMs: made.record.durationMs, bytes: stored.bytes, status, qa: { passed: made.qa.passed, checks: made.qa.checks, metrics: made.qa.metrics }, renderMs: Date.now() - t0 })
      .where(eq(ms.msVideos.id, video.id));
    await audit(db, { actor: "studio-worker", action: "video.demo_render", entity: "video", entityId: video.id, productId: video.productId, detail: { status, durationSec: made.qa.metrics.durationSec, failed: made.qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => c.id) } });
    return { videoId: video.id, status, failed: made.qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => `${c.id}: ${c.detail}`), metrics: made.qa.metrics, stats: made.stats };
  } catch (e) {
    await db.update(ms.msVideos).set({ status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).where(eq(ms.msVideos.id, video.id));
    throw e;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
