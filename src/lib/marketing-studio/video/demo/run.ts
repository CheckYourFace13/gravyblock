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
import { addFact, listClaims, listFacts, listProducts, verifyFact } from "../../repository";
import { INTERNAL_SCOPE, type OwnerScope } from "../../scope";
import { storeVideoFile } from "../store";
import { canonicalizeLogo, comparePixels, logoIntegrityChecks, type CanonicalLogo } from "../../brand/logo-integrity";
import { saveCanonicalLogo } from "../../brand/brand-kit";
import { attributionFor } from "../../entitlements";
import { buildStageHtml } from "./stage";
import { audioInfo, mixAudio, parseSpoken, placeLines, synthesizeLines, synthMusic, writeWav } from "./audio";
import { renderDemo } from "./render";
import { runDemoQa, type DemoQaResult } from "./qa";
import { gameCtaPhase } from "./language-qa";
import { specForLaunchState } from "./launch";
import { demoSpecFor, type DemoSpec } from "./specs";
import { applyLexicon } from "../../publishing/review-intent";
import { applyOverridesToSpec, getOverrides } from "./overrides";
import type { DemoRecord, Manifest } from "./types";
import { ensureSpec } from "../concepts/registry";
import { visualChecks } from "../concepts/align";
import { evaluateRecord } from "../concepts/validate";
import { openingKey } from "../concepts/standard";

export const DEMO_ACTOR = "pilot-prep (public sources, owner directive)";
export const VOICE_ID = "af_heart";
export const VOICE_SPEED = 1.04;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

type FactLite = { id: string; value: string; verified: boolean };

/**
 * Adds the few Product Truth facts this video needs. A fact is only added when its exact text is on the live page it cites, which is what
 * lets it be marked verified. With write=false (a dry run) nothing is stored and the facts count as prospective.
 */
export async function ensureFacts(db: StudioDb, scope: OwnerScope, productId: string, manifest: Manifest, write: boolean, wanted: Array<{ plate: string; value: string; kind?: "asset_metadata" }> = demoSpecFor("rentalnoodle").facts): Promise<FactLite[]> {
  const out: FactLite[] = (await listFacts(scope, productId, db)).filter((f) => f.status === "current").map((f) => ({ id: f.id, value: f.factValue, verified: Boolean(f.verifiedAt) }));
  for (const d of wanted) {
    const plate = manifest.plates[d.plate];
    if (!plate) throw new Error(`no captured page "${d.plate}" for fact "${d.value.slice(0, 40)}"`);
    if (!norm(plate.text).includes(norm(d.value))) throw new Error(`The live page ${plate.url} no longer says "${d.value.slice(0, 60)}". Not adding it as a fact.`);
    const existing = out.find((f) => norm(f.value) === norm(d.value));
    if (existing?.verified) continue;
    if (!write) {
      out.push({ id: `prospective:${out.length}`, value: d.value, verified: true });
      continue;
    }
    const row = await addFact(scope, DEMO_ACTOR, productId, { factKey: "capability", factValue: d.value, sourceKind: d.kind ?? "public_page", sourceUrl: d.kind ? null : plate.url }, db);
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

export async function produceDemo(opts: { slug?: string; db: StudioDb; scope?: OwnerScope; workDir: string; writeFacts: boolean; log?: (m: string) => void; ttsDir?: string; reuse?: { manifest?: boolean } }): Promise<ProducedDemo> {
  const { db, workDir } = opts;
  const scope = opts.scope ?? INTERNAL_SCOPE;
  const log = opts.log ?? (() => {});
  await ensureSpec(db, opts.slug ?? "rentalnoodle");
  const baseSpec: DemoSpec = demoSpecFor(opts.slug ?? "rentalnoodle");
  const spec0 = baseSpec;
  await fs.mkdir(workDir, { recursive: true });
  const product = (await listProducts(scope, db)).find((p) => p.slug === spec0.slug);
  if (!product) throw new Error(`${spec0.productName} is not a Studio product`);

  // 1. capture the real product
  const platesDir = path.join(workDir, "stage");
  await fs.mkdir(platesDir, { recursive: true });
  const [logoAsset] = (await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, product.id))).filter((a) => a.kind === "logo" && a.approved === "true");
  if (!logoAsset) throw new Error(`NEEDS BRAND ASSET: ${spec0.productName} has no approved logo asset, and a logo is never invented`);
  const logoFile = path.join(platesDir, "logo.png");
  const logoBytes = await readAssetBytes(logoAsset);
  await fs.writeFile(logoFile, logoBytes);
  // the canonical, hashed source record the logo-integrity QA measures the render against
  let canonicalLogo: CanonicalLogo | null = null;
  try {
    canonicalLogo = await canonicalizeLogo(logoAsset, logoBytes);
    await saveCanonicalLogo(db, "demo-run", product.id, canonicalLogo);
  } catch (e) {
    log(`logo could not be canonicalized: ${e instanceof Error ? e.message : e}`);
  }
  const t0 = Date.now();
  let manifest: Manifest;
  if (opts.reuse?.manifest) manifest = JSON.parse(await fs.readFile(path.join(platesDir, "manifest.json"), "utf8")) as Manifest;
  else {
    log("capturing the live product pages");
    manifest = await spec0.capture(platesDir, logoFile);
  }
  const captureMs = Date.now() - t0;

  // 2. facts the claims rest on
  // The call to action follows Product Truth: a game with a verified live store listing gets the install CTA automatically, with no spec edit.
  const known = (await listFacts(scope, product.id, db)).filter((f) => f.status === "current").map((f) => ({ value: f.factValue, verified: Boolean(f.verifiedAt) }));
  // The owner's accepted edits (pronunciation, pace, call to action) apply to every render of this product.
  const overrides = await getOverrides(db, product.id);
  const spec = applyOverridesToSpec(specForLaunchState(spec0, known), overrides);
  const voiceSpeed = +(VOICE_SPEED * overrides.paceFactor * (spec.pace ?? 1)).toFixed(3);
  const ctaPhase = spec0.kind === "game" ? gameCtaPhase(known) : undefined;
  const facts = await ensureFacts(db, scope, product.id, manifest, opts.writeFacts, spec.facts);
  const { narration: NARRATION, claims: CLAIMS, onScreen: ON_SCREEN, sceneMeta: SCENE_META } = spec;

  // 3. voiceover
  log("recording the voiceover");
  const t1 = Date.now();
  const synth = await synthesizeLines(NARRATION.map((l) => ({ id: l.id, text: applyLexicon(parseSpoken(l.spoken).words.join(" "), overrides.lexicon) })), { ttsDir: opts.ttsDir ?? STUDIO_TTS_DIR, voice: VOICE_ID, speed: voiceSpeed, tmpDir: path.join(workDir, "tts") });
  const voiceMs = Date.now() - t1;
  const dur = Object.fromEntries(synth.map((s) => [s.id, Math.round((s.samples.length / s.rate) * 1000)]));
  const lineTimes = spec.layout(dur);
  const built = spec.build(manifest, lineTimes);
  const { timeline } = built;
  timeline.brand.attribution = await attributionFor(db, { id: product.id, slug: spec0.slug, ownerKind: product.ownerKind });

  // 4. audio mix
  log("mixing voice and music");
  const rate = synth[0].rate;
  const vo = placeLines(synth.map((s) => ({ samples: s.samples, rate: s.rate, startMs: lineTimes[s.id].start })), timeline.durationMs + 300, rate);
  await writeWav(path.join(workDir, "vo.wav"), [vo], rate);
  const [ml, mr] = synthMusic(timeline.durationMs / 1000 + 0.4, 44100, spec.music ?? {});
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
    title: spec.title,
    specId: spec.angle ? `${spec.slug}:${spec.angle}` : spec.slug,
    durationMs: timeline.durationMs,
    transcript: NARRATION.map((l) => ({ id: l.id, sceneId: l.sceneId, text: parseSpoken(l.spoken).words.join(" "), caption: l.caption ?? parseSpoken(l.spoken).words.join(" "), startMs: lineTimes[l.id].start, endMs: lineTimes[l.id].end })),
    scenes: sceneRows,
    claims,
    onScreen: ON_SCREEN,
    cta: { text: spec.cta.text, url: spec.cta.url },
    ...(ctaPhase ? { ctaPhase } : {}),
    endHeadline: timeline.scenes.find((s) => s.kind === "end")?.end_card?.headline,
    audio: audioInfo(VOICE_ID, voiceSpeed),
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
    site: spec.site,
    ...(spec.kind === "game" ? { gameCreative: { storeLive: ctaPhase === "store_live" } } : {}),
    ...(spec.qaExtra?.(manifest) ?? {}),
  });
  // the permanent creative standard: the ten desirability checks, measured on the finished video
  const stateTimes = timeline.scenes.flatMap((s) => (s.states ?? []).slice(1).map((st) => s.start + st.at));
  const interactivePlates = Object.values(manifest.plates).filter((p) => Object.keys(p.states).length >= 3).length;
  const others = await db.select({ sb: ms.msVideos.storyboard, status: ms.msVideos.status }).from(ms.msVideos);
  const myId = record.specId ?? spec.slug;
  const takenOpenings = [...new Set(others.filter((o) => o.status !== "superseded" && o.status !== "failed" && o.status !== "qa_failed" && (o.sb as DemoRecord | null)?.kind === "demo" && ((o.sb as DemoRecord).specId ?? "") !== myId && (o.sb as DemoRecord).transcript?.[0]).map((o) => openingKey((o.sb as DemoRecord).transcript[0].text)))];
  const prohibitedClaims = (await listClaims(scope, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  const gate = evaluateRecord({ specId: myId, slug: spec.slug, productName: spec.productName, transcript: record.transcript.map((t) => ({ text: t.text, caption: t.caption })), durationMs: timeline.durationMs, firstActionMs: stateTimes.length ? Math.min(...stateTimes) : null, stateChanges: stateTimes.length, interactivePlates, verifiedClaims: record.claims.filter((c) => c.factsVerified).length, ctaText: spec.cta.text, onScreen: ON_SCREEN.map((o) => o.text), takenOpenings, concept: spec.concept ?? null, prohibited: prohibitedClaims });
  record.desirability = { ok: gate.ok, generated: Boolean(spec.concept), personality: spec.concept?.personality, firstActionMs: stateTimes.length ? Math.min(...stateTimes) : null, stateChanges: stateTimes.length, interactivePlates, checks: gate.checks.map((c) => ({ id: c.id, label: c.label, ok: c.ok, detail: c.detail })) };
  // a generated video must pass the standard; a script written by hand before it is reported, not failed (see library-production.ts)
  if (spec.concept) {
    for (const c of gate.checks) qa.checks.push({ id: `desirability_${c.id}`, ok: c.ok, severity: "fail", detail: c.detail });
    // the finished video against what was really on screen, and the framing of every payoff
    qa.checks.push(...(await visualChecks({ concept: spec.concept, manifest, lineTimes, timeline, platesDir })));
    qa.passed = qa.checks.every((c) => c.ok || c.severity === "warn");
  }
  // logo fidelity is a permanent HARD gate, for every video: source hash, no decoration, true proportions, pixels match the source
  let pixels: Awaited<ReturnType<typeof comparePixels>> | null = null;
  const big = rendered.logo.probes.find((p) => p.selector === ".elogo");
  if (canonicalLogo && big && rendered.logo.shot) pixels = await comparePixels(logoBytes, rendered.logo.shot, { w: big.boxW, h: big.boxH }, { w: big.naturalW, h: big.naturalH }).catch(() => null);
  qa.checks.push(...logoIntegrityChecks({ canonical: canonicalLogo, writtenBytes: logoBytes, stageHtml: buildStageHtml(timeline), probes: rendered.logo.probes, pixels }));
  qa.passed = qa.checks.every((c) => c.ok || c.severity === "warn");
  return { file: outFile, record, qa, stats: { captureMs, voiceMs, renderMs: rendered.wallMs, frames: rendered.frames }, manifest };
}

export const DEMO_MIN_MEMORY_BYTES = 1800 * 1024 * 1024;

/** Refuses to start where the memory cap would kill the job half way (the worker's own scope is 768 MB). Unreadable limits are not blocked. */
export async function assertDemoMemoryHeadroom(min = DEMO_MIN_MEMORY_BYTES): Promise<void> {
  try {
    const cg = (await fs.readFile("/proc/self/cgroup", "utf8")).split("\n").find((l) => l.startsWith("0::"))?.slice(3).trim();
    if (!cg) return;
    const raw = (await fs.readFile(`/sys/fs/cgroup${cg}/memory.max`, "utf8")).trim();
    if (raw !== "max" && Number(raw) < min) throw new Error(`The demo render needs about ${Math.round(min / 1048576)} MB but this process is capped at ${Math.round(Number(raw) / 1048576)} MB. Run scripts/ops/marketing-rn-demo-run.ts, which uses its own bounded scope.`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("The demo render needs")) throw e;
  }
}

/** Render the demo for a stored ms_videos row and hand it to the owner for review. Needs more memory than the worker's cap; see assertDemoMemoryHeadroom. */
export async function renderDemoVideoJob(input: { videoId?: string }, scope: OwnerScope = INTERNAL_SCOPE, db: StudioDb = requireStudioDb()) {
  if (!input.videoId) throw new Error("render_demo_video needs a videoId");
  await assertDemoMemoryHeadroom();
  const [video] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, input.videoId)).limit(1);
  if (!video) throw new Error("video not found");
  const product = (await listProducts(scope, db)).find((p) => p.id === video.productId);
  if (!product) throw new Error("product not found");
  await db.update(ms.msVideos).set({ status: "rendering", error: null }).where(eq(ms.msVideos.id, video.id));
  const dir = path.join(STUDIO_DIRS.tmp, `demo-${video.id}`);
  try {
    const t0 = Date.now();
    const made = await produceDemo({ slug: (video.storyboard as { specId?: string } | null)?.specId ?? product.slug, db, scope, workDir: dir, writeFacts: true });
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
