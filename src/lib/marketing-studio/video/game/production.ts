/**
 * Autonomous game video production (the GAME VIDEO ENGINE only). For a game product with a target, GravyBlock keeps making genuinely different clips by itself, one format at a time:
 *   target + planned format -> real gameplay session (captured automatically) -> fun-first clip from real moments -> game QA + logo check -> distinctness gate -> upload UNLISTED -> email the
 *   owner (Approve / Request Changes / Pause). Real gameplay only: if a game has no automatic capture, nothing is made and the blocker is shown. Nothing is ever published without approval.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { allowanceFor } from "../../entitlements";
import { STUDIO_DIRS } from "../../config";
import { ms, type StudioDb } from "../../db";
import { angleKey, type AngleEntry } from "../../library";
import { getAngles, updateAngle } from "../../library-store";
import { capFreesAt } from "../../library-production";
import { prepareReview } from "../../publishing/review-dispatch";
import { isPaused } from "../../publishing/video-policy";
import { listFacts, listProducts } from "../../repository";
import { enqueue, getSetting, JOB_PRIORITY, setSetting } from "../../runtime";
import { INTERNAL_SCOPE } from "../../scope";
import { activeProductionJobs, getMaxPending, pendingCount, targetStats } from "../../video-target";
import { storeVideoFile } from "../store";
import { storeDestination } from "../demo/language-qa";
import { GAME_FORMATS, GAME_LIBRARY_ORDER, gameRepeats, type GameClip, type GameFormat } from "./engine";
import { makeGameClip } from "./clip";

const ACTOR = "game-video-engine";
const SESSION_MAX_AGE_MS = 3 * 24 * 3_600_000;
const NL = String.fromCharCode(10);

/**
 * Games with an automatic real-gameplay capture. A game without one makes nothing (gameplay is never faked).
 * "script": a scripted browser plays the game's web build. "runner": the game runs in a disposable container started by the root-owned capture runner (the worker only leaves a request).
 */
export const GAME_CAPTURES: Record<string, { kind: "script"; script: string; env: string } | { kind: "runner"; levels: number }> = {
  scribblezap: { kind: "script", script: "scripts/ops/marketing-sz-capture.mts", env: "STUDIO_GAME_CAPTURE_OUT" },
  mibblemeadow: { kind: "runner", levels: 8 },
};
export const captureReady = (slug: string) => slug in GAME_CAPTURES;
export const sessionDirFor = (slug: string) => path.join(STUDIO_DIRS.root, "captures", slug, "session");

export const gameSpecId = (slug: string, format: GameFormat) => `${slug}:game-${format}`;
export const formatOfSpec = (specId: string): GameFormat | null => {
  const f = specId.split(":game-")[1] as GameFormat | undefined;
  return f && f in GAME_FORMATS ? f : null;
};

type GameProduct = { id: string; slug: string; name: string; kind?: string; ownerKind: string; publicUrl?: string };

/** One angle per game format: each is a different kind of video (hook, challenge, mechanic, progression, reward, variety, short-form). */
export function gameAngleEntries(p: Pick<GameProduct, "slug" | "name">, home: string, store: boolean): AngleEntry[] {
  return GAME_LIBRARY_ORDER.map((format, i) => {
    const f = GAME_FORMATS[format];
    return {
      id: `${p.slug}-game-${format}`,
      slug: p.slug,
      position: i + 1,
      role: (["A", "B", "C"] as const)[i % 3],
      title: `${p.name}: ${f.label}`,
      hook: f.promise,
      goal: `a ${f.label.toLowerCase()} clip of real ${p.name} gameplay: ${f.promise}`,
      audience: "players who want a quick, satisfying game",
      coreBenefit: f.promise,
      features: [],
      scenes: [],
      cta: { text: store ? "Get it on Google Play" : "Play it", url: home },
      status: "planned",
      approval: "none",
      existing: false,
      funnel: "cold",
      specId: gameSpecId(p.slug, format),
      yt: { title: `${p.name}: ${f.label}`.slice(0, 100), description: `${f.promise.charAt(0).toUpperCase()}${f.promise.slice(1)}. Real gameplay from ${p.name}.\n\n${home}` },
      purpose: f.label,
    } satisfies AngleEntry;
  });
}

/** Makes sure every game format exists as an angle. Existing angles are never touched. */
export async function ensureGameAngles(db: StudioDb, p: GameProduct): Promise<number> {
  const home = p.publicUrl ?? "";
  const facts = (await listFacts(INTERNAL_SCOPE, p.id, db)).filter((f) => f.status === "current" && f.verifiedAt);
  const store = Boolean(storeDestination(facts.map((f) => ({ value: f.factValue, verified: true }))));
  const existing = await getAngles(db, p.slug);
  const add = gameAngleEntries(p, home, store).filter((a) => !existing.some((e) => e.specId === a.specId));
  if (add.length) await setSetting(angleKey(p.slug), [...existing, ...add], ACTOR, db, { audited: false });
  return add.length;
}

const blockKey = (specId: string) => `video_game_block_${specId.replace(/[^a-z0-9]+/gi, "_")}`;

/** A blocked format is tried again after a day (a fresh capture may now support it), so the target is never stuck on one weak session. */
async function reopenBlocked(db: StudioDb, p: GameProduct): Promise<number> {
  let n = 0;
  const deliveredCount = (await getAngles(db, p.slug)).filter((x) => ["unlisted_review", "approved", "public"].includes(x.status)).length;
  for (const a of (await getAngles(db, p.slug)).filter((x) => x.status === "blocked" && x.specId && formatOfSpec(x.specId))) {
    const b = await getSetting<{ at: string; reason?: string } | null>(blockKey(a.specId as string), null, db);
    // "too similar to an earlier clip" with no delivered clip at all cannot be true: it is reopened at once
    const mistaken = Boolean(b?.reason?.startsWith("too similar")) && deliveredCount === 0;
    if (!b || mistaken || Date.now() - Date.parse(b.at) > 24 * 3_600_000) {
      await updateAngle(db, ACTOR, p.slug, (e) => e.id === a.id, { status: "planned" });
      n++;
    }
  }
  return n;
}

/** One pass of the loop for a game: queue the next distinct format when the target wants more and nothing is in the way. Returns what it did, in words. */
export async function gameTick(db: StudioDb, p: GameProduct, ctx: { force: boolean; review: Array<{ status: string }>; activeJobs: number }, log: (m: string) => void = () => {}): Promise<string> {
  await ensureGameAngles(db, p);
  await reopenBlocked(db, p);
  const stats = await targetStats(db, p);
  if (!ctx.force && stats.remaining !== null && stats.remaining <= 0) return `target reached: ${stats.approved + stats.waiting + stats.making} of ${stats.target} distinct game videos are approved, in review or being made`;
  const { max } = await getMaxPending(db, p);
  if (!ctx.force && pendingCount(ctx.review) >= max) return `${pendingCount(ctx.review)} of ${max} allowed game videos are waiting for your review; more are made as you decide`;
  if ((await activeProductionJobs(db, p.id)) > 0) return "a game video is already being made";
  if (!captureReady(p.slug)) return `NEEDS CAPTURE: ${p.name} has no automatic real-gameplay capture yet; nothing is made without real gameplay`;
  if (p.ownerKind === "customer") {
    const allow = await allowanceFor(db, p);
    if (!allow.eligible) return `plan allowance: ${allow.reason}; next new video eligible ${allow.nextEligibleAt ?? "now"}`;
  }
  let planned = (await getAngles(db, p.slug)).filter((a) => a.status === "planned" && a.specId && formatOfSpec(a.specId)).sort((a, b) => a.position - b.position);
  if (!planned.length && (await reopenBlocked(db, p))) planned = (await getAngles(db, p.slug)).filter((a) => a.status === "planned" && a.specId && formatOfSpec(a.specId)).sort((a, b) => a.position - b.position);
  const next = planned[0];
  if (!next?.specId) return "WAITING_FOR_NEW_OPPORTUNITY: every game format is made, in review or blocked by the footage; a fresh capture tomorrow can unblock one";
  const prior = await db.select({ id: ms.msMediaJobs.id }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.kind, "game_video"), sql`${ms.msMediaJobs.input}->>'specId' = ${next.specId}`));
  const r = await enqueue({ kind: "game_video", weight: "heavy", priority: JOB_PRIORITY.normal, productId: p.id, dedupeKey: prior.length ? `game_video:${next.specId}:n${prior.length}` : `game_video:${next.specId}`, input: { specId: next.specId }, maxAttempts: 3 }, db);
  log(`game ${p.slug}: queued ${next.specId}`);
  return r.id ? `queued the next game video (${formatOfSpec(next.specId)})` : "a game video is already queued";
}

/** Runs the product's own scripted capture (real taps and swipes on the real game) as a child process. */
async function runCapture(slug: string, outDir: string, log: (m: string) => void, timeoutMs = 20 * 60_000): Promise<string> {
  const a = GAME_CAPTURES[slug];
  if (a.kind === "runner") return runRunnerCapture(slug, a.levels, outDir, log);
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", (a as { script: string }).script], { cwd: process.cwd(), env: { ...process.env, [(a as { env: string }).env]: outDir } });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", () => (clearTimeout(timer), resolve(out)));
    child.on("error", () => (clearTimeout(timer), resolve(out)));
  });
}

/**
 * A game that runs in a container (Mibble Meadow): leave a request for the root-owned capture runner, wait for its status, then turn the run into a session. The runner is the only thing with
 * container access; it takes nothing from the request but a level count.
 */
async function runRunnerCapture(slug: string, levels: number, outDir: string, log: (m: string) => void): Promise<string> {
  const reqDir = path.join(STUDIO_DIRS.root, "capture-requests");
  const statusFile = path.join(STUDIO_DIRS.root, "capture-status", `${slug}.json`);
  await fs.mkdir(reqDir, { recursive: true });
  const id = Date.now();
  await fs.writeFile(path.join(reqDir, `${slug}.request`), `id=${id}${NL}levels=${levels}${NL}`);
  log(`asked the capture runner to play ${levels} levels of ${slug}`);
  const deadline = Date.now() + 55 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const st = await fs.readFile(statusFile, "utf8").then((t) => JSON.parse(t) as { id: number; state: string; detail: string }).catch(() => null);
    if (!st || st.id !== id) continue;
    if (st.detail !== last) log(`capture runner: ${st.state}: ${st.detail}`);
    last = st.detail;
    if (st.state === "failed") throw new Error(`the capture runner failed: ${st.detail}`);
    if (st.state === "done") {
      const { convertMibbleRun } = await import("./mibble");
      await convertMibbleRun(path.join(STUDIO_DIRS.root, "captures", slug, "run"), outDir, log);
      return st.detail;
    }
  }
  throw new Error("the capture runner did not finish in time");
}

/** The gameplay session to cut from: the stored one while it is recent, else a fresh real capture. */
export async function ensureSession(slug: string, log: (m: string) => void, o: { fresh?: boolean } = {}): Promise<string> {
  const dir = sessionDirFor(slug);
  const stat = await fs.stat(path.join(dir, "frames.json")).catch(() => null);
  if (stat && !o.fresh && Date.now() - stat.mtimeMs < SESSION_MAX_AGE_MS) return dir;
  if (!captureReady(slug)) throw new Error(`NEEDS CAPTURE: ${slug} has no automatic real-gameplay capture`);
  const tmp = `${dir}-new`;
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });
  log(`capturing real gameplay of ${slug}`);
  const out = await runCapture(slug, tmp, log);
  const frames = await fs.readFile(path.join(tmp, "frames.json"), "utf8").then((t) => (JSON.parse(t) as unknown[]).length).catch(() => 0);
  if (frames < 60) throw new Error(`capture produced no usable gameplay (${frames} frames): ${out.slice(-300)}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmp, dir);
  log(`captured ${frames} real frames`);
  return dir;
}

/**
 * The clips of this game that were actually DELIVERED (uploaded for review, approved or public), so the next one shows different levels. A clip that was cut but never sent (a failed upload)
 * does not count, and is retired so it can never block a later attempt.
 */
async function priorClips(db: StudioDb, p: { id: string; slug: string }, exceptVideo?: string): Promise<GameClip[]> {
  const delivered = new Set((await getAngles(db, p.slug)).filter((a) => ["unlisted_review", "approved", "public"].includes(a.status) && a.videoRowId).map((a) => a.videoRowId as string));
  const rows = await db.select({ id: ms.msVideos.id, storyboard: ms.msVideos.storyboard, status: ms.msVideos.status, createdAt: ms.msVideos.createdAt }).from(ms.msVideos).where(and(eq(ms.msVideos.productId, p.id), sql`${ms.msVideos.storyboard}->>'kind' = 'game'`, inArray(ms.msVideos.status, ["ready_for_review", "approved"])));
  for (const r of rows.filter((x) => !delivered.has(x.id) && x.id !== exceptVideo && Date.now() - x.createdAt.getTime() > 30 * 60_000)) await db.update(ms.msVideos).set({ status: "superseded" }).where(eq(ms.msVideos.id, r.id));
  return rows.filter((r) => delivered.has(r.id) && r.id !== exceptVideo).flatMap((r) => ((r.storyboard as { gameClip?: GameClip } | null)?.gameClip ? [(r.storyboard as { gameClip: GameClip }).gameClip] : []));
}

export type GameRunResult = { status: string; detail?: string; publicationId?: string; videoId?: string };

/** `replacing` makes a correction: the same format is cut again from FRESH real gameplay, avoiding the footage the old clip used, and the new upload supersedes the old one. */
export async function runGameVideo(db: StudioDb, input: { specId: string; attempt: number; maxAttempts: number; replacing?: { videoRowId: string } }, log: (m: string) => void = () => {}): Promise<GameRunResult> {
  const slug = input.specId.split(":")[0];
  const format = formatOfSpec(input.specId);
  if (!format) throw new Error(`"${input.specId}" is not a game video script`);
  const product = ((await listProducts(INTERNAL_SCOPE, db)) as unknown as GameProduct[]).find((x) => x.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const angle = (await getAngles(db, slug)).find((a) => a.specId === input.specId);
  if (!angle) throw new Error(`${input.specId} is not in ${slug}'s library`);
  if (await isPaused(db, product.id)) return { status: "paused", detail: "paused by the owner" };
  if (!input.replacing && ["unlisted_review", "approved", "public"].includes(angle.status)) return { status: angle.status, detail: "this video already exists" };
  const before = angle.status;
  if (!input.replacing) await updateAngle(db, ACTOR, slug, (e) => e.id === angle.id, { status: "in_production" });
  let cutRow: string | null = null;
  const fail = async (e: unknown): Promise<GameRunResult> => {
    if (cutRow) await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.id, cutRow), eq(ms.msVideos.status, "ready_for_review"))).catch(() => undefined);
    // a temporary failure goes back to the queue for another attempt; the last one returns the angle to planned so the loop can try again later
    await updateAngle(db, ACTOR, slug, (x) => x.id === angle.id && x.status === "in_production", { status: input.replacing ? before : "planned" });
    throw e instanceof Error ? e : new Error(String(e));
  };
  try {
    const sessionDir = await ensureSession(slug, log, { fresh: Boolean(input.replacing) });
    const prior = await priorClips(db, product, input.replacing?.videoRowId);
    const used = new Set(prior.flatMap((c) => c.moments.filter((m) => m.source === "real_capture").map((m) => m.level)));
    const made = await makeGameClip(db, product, format, { sessionDir, usedLevels: used, log });
    if (!made.ok) {
      if (input.replacing) throw new Error(`the corrected clip did not pass the game QA: ${made.reason}`);
      await setSetting(blockKey(input.specId), { at: new Date().toISOString(), reason: made.reason }, ACTOR, db, { audited: false });
      await updateAngle(db, ACTOR, slug, (x) => x.id === angle.id, { status: "blocked" });
      log(`${input.specId}: blocked (${made.reason.slice(0, 200)})`);
      return { status: "blocked", detail: made.reason };
    }
    if (!made.logo.ok) throw new Error("the logo failed the integrity check; the clip was not sent");
    // distinct from every earlier clip of this game: a different format and not mostly the same levels and mechanics
    const repeats = gameRepeats([...prior, made.clip]).filter((r) => r.b === prior.length || r.a === prior.length);
    if (repeats.length && input.replacing) throw new Error(`the corrected clip repeats earlier footage (overlap ${repeats.map((r) => r.overlap).join(", ")})`);
    if (repeats.length) {
      await setSetting(blockKey(input.specId), { at: new Date().toISOString(), reason: "too similar to an earlier clip" }, ACTOR, db, { audited: false });
      await updateAngle(db, ACTOR, slug, (x) => x.id === angle.id, { status: "blocked" });
      return { status: "blocked", detail: `too similar to an earlier clip (overlap ${repeats.map((r) => r.overlap).join(", ")})` };
    }
    const facts = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt);
    if (!facts.length || !product.publicUrl) throw new Error(`NEEDS PRODUCT TRUTH: ${product.name} needs verified facts and a destination before a video can be sent`);
    const store = storeDestination(facts.map((f) => ({ value: f.factValue, verified: true })));
    const ctaText = store ? "Get it on Google Play" : "Play it";
    const dims = made.vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    const stored = await storeVideoFile(INTERNAL_SCOPE, ACTOR, product.id, made.file, { ...dims, name: `${angle.yt?.title ?? angle.title}.mp4` }, db);
    const evidence = facts.slice(0, 3);
    const record_title = (a: AngleEntry) => a.yt?.title ?? a.title;
    const record = {
      version: 2,
      kind: "game",
      classification: "GAME_CLIP",
      title: angle.yt?.title ?? angle.title,
      specId: input.specId,
      durationMs: made.durationMs,
      transcript: [],
      scenes: [],
      claims: [{ id: "c-game", text: `Real gameplay of ${product.name}, captured from the game itself.`, factIds: evidence.map((f) => f.id), sceneId: "a1", factsVerified: true, sources: evidence.map((f) => ({ url: product.publicUrl as string, quote: f.factValue, onPage: true, capturedAt: new Date().toISOString() })) }],
      onScreen: [],
      cta: { text: ctaText, url: product.publicUrl },
      endHeadline: product.name,
      caption: angle.yt?.description ?? record_title(angle),
      gameClip: made.clip,
      gameFormat: format,
      capturedAt: new Date().toISOString(),
    };
    const qa = { passed: true, checks: [...made.checks.map((c) => ({ id: `game_${c.id}`, ok: c.ok, severity: "fail", detail: c.detail })), { id: "logo_integrity", ok: made.logo.ok, severity: "fail", detail: `mean ${made.logo.mean}/255, strong ${made.logo.strongShare}` }], metrics: { durationSec: +(made.durationMs / 1000).toFixed(1) } };
    const [row] = await db.insert(ms.msVideos).values({ productId: product.id, title: record.title, storyboard: record as never, targetSeconds: 30, assetId: stored.id, ...dims, durationMs: made.durationMs, bytes: stored.bytes, status: "ready_for_review", qa: qa as never }).returning();
    cutRow = row.id;
    const all = await getAngles(db, slug);
    const out = await prepareReview(db, {
      slug,
      specId: input.specId,
      videoRowId: row.id,
      title: record.title,
      description: angle.yt?.description ?? record.title,
      intended: `${GAME_FORMATS[format].label} clip of real gameplay: YouTube organic, the iScream Studio portfolio and a candidate paid asset.`,
      library: { position: angle.position, of: all.filter((a) => a.status !== "superseded" && a.status !== "blocked").length, roleLabel: GAME_FORMATS[format].label },
      upload: true,
      log,
    });
    if (!out.ok && /daily cap/i.test(out.blocked ?? "")) {
      const again = await capFreesAt(db, product.id);
      await updateAngle(db, ACTOR, slug, (x) => x.id === angle.id, { status: "planned" });
      await enqueue({ kind: "game_video", weight: "heavy", priority: 3, productId: product.id, dedupeKey: `game_video:${input.specId}:after-${again.getTime()}`, input: { specId: input.specId }, runAfter: again, maxAttempts: 3 }, db);
      return { status: "deferred", detail: `posting allowance used; queued again for ${again.toISOString()}` };
    }
    if (!out.ok || !out.publicationId || !out.videoId) throw new Error(out.blocked ?? "the upload did not complete");
    return { status: "unlisted_review", detail: out.emailed ? "review email sent" : "uploaded; the review email could not be sent", publicationId: out.publicationId, videoId: out.videoId };
  } catch (e) {
    return await fail(e);
  }
}
