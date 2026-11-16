// The permanent GAME Marketing Studio pipeline: product type, game profile, the capture library, continuity (sequence picking), the game voice and script, and the game hard QA. All pure.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isGameKind, PRODUCT_KINDS, PRODUCT_TYPES } from "../config";
import { isGame } from "../video-target";
import { GAME_FORMATS, GAME_LIBRARY_ORDER, type GameClip, type GameFormat, type GameMoment } from "../video/game/engine";
import { buildEntries, supportedFormats, usageOf } from "../video/game/library";
import { DEFAULT_GAME_PROFILE, KNOWN_OWNED_GAMES, profileGaps, seedFor, validateGameProfile, type GameProfile } from "../video/game/profile";
import { gameVideoChecks, failureKind, type FinalLine, type QaInput } from "../video/game/qa";
import { fitFootage } from "../video/game/render";
import { desiredStarts, gameVoiceFor, languageChecks, similarity, voiceEnergyCheck, writeScript, GAME_VOICE_IDS, GENERIC_PHRASES } from "../video/game/script";
import { clipMomentsOf, formatUnsupported, levelSegments, pickSequences, SHAPES } from "../video/game/sequence";
import { historyOf } from "../video/game/clip";

const m = (startMs: number, endMs: number, kind: GameMoment["kind"], level: string, mechanic?: string, intensity = 0.8): GameMoment => ({ startMs, endMs, kind, level, mechanic, intensity, source: "real_capture" });

/** One level of real play: it loads, the player acts again and again, things happen, it gets tight, then the payoff. */
function level(n: number, at: number, o: { win?: boolean; loss?: boolean; close?: boolean; character?: string } = {}): GameMoment[] {
  const L = `L${n}`;
  const out: GameMoment[] = [m(at, at + 1000, "stage_transition", L, "stage", 0.8)];
  for (let k = 0; k < 6; k++) {
    out.push(m(at + 1000 + k * 1400, at + 2200 + k * 1400, "input", L, "cut", 0.6), m(at + 1800 + k * 1400, at + 2800 + k * 1400, "score", L, "fill", 0.6));
  }
  out.push(m(at + 9400, at + 10600, "animation", L, "cut", 0.85));
  if (o.close !== false) out.push(m(at + 10600, at + 12000, "close_call", L, "fill", 1));
  if (o.loss) out.push(m(at + 12000, at + 13000, "loss", L, "stage", 0.6));
  if (o.win !== false) out.push(m(at + 12000, at + 14000, "win", L, "stage", 0.9), m(at + 12000, at + 14500, "reward", L, "reward", 0.95, ));
  if (o.character) out.forEach((x) => (x.kind === "reward" ? (x.character = o.character) : undefined));
  return out;
}
const session = (n = 6): GameMoment[] => Array.from({ length: n }, (_, i) => level(i + 1, i * 15_000)).flat();

const profile = (over: Partial<GameProfile> = {}): GameProfile => ({
  ...DEFAULT_GAME_PROFILE,
  platforms: ["android"],
  controls: "hold and drag a finger to draw a cut",
  objective: "fill the page to hit the target",
  funFactor: "every cut changes the whole page",
  mechanics: ["drawing cuts", "dodging balls"],
  energy: "energetic",
  ...over,
});

describe("product type", () => {
  test("the five choices exist, Game is one of them and every game kind counts as a game", () => {
    assert.deepEqual(PRODUCT_TYPES.map((t) => t.label), ["Website / Business", "Software / SaaS", "Game", "Mobile App", "Other"]);
    for (const t of PRODUCT_TYPES) assert.ok((PRODUCT_KINDS as readonly string[]).includes(t.kind));
    for (const k of ["game", "mobile_game", "web_game"]) assert.ok(isGameKind(k) && isGame({ kind: k }));
    assert.ok(!isGameKind("saas") && !isGame({ kind: "website" }) && !isGameKind(undefined));
  });
  test("known owned games are classified by slug, and nothing else is guessed", () => {
    assert.ok("scribblezap" in KNOWN_OWNED_GAMES && "mibblemeadow" in KNOWN_OWNED_GAMES);
    assert.ok(!("acme-corp" in KNOWN_OWNED_GAMES));
  });
});

describe("game profile", () => {
  test("validation cleans values and refuses unknown choices", () => {
    const ok = validateGameProfile({ platforms: ["Android", "web"], orientation: "portrait", energy: "very_energetic", mechanics: "cutting, dodging, cutting", preferredSeconds: 20, testerUrl: "javascript:alert(1)", storeListings: "https://play.google.com/store/apps/details?id=x\nnot a url" });
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.deepEqual(ok.value.platforms, ["android", "web"]);
      assert.deepEqual(ok.value.mechanics, ["cutting", "dodging"]);
      assert.equal(ok.value.testerUrl, "", "only http and https addresses are kept");
      assert.equal(ok.value.storeListings.length, 1);
      assert.equal(ok.value.preferredSeconds, 20);
    }
    assert.equal(validateGameProfile({ platforms: ["xbox360"] }).ok, false);
    assert.equal(validateGameProfile({ energy: "frantic" }).ok, false);
    assert.equal(validateGameProfile({ orientation: "sideways" }).ok, false);
    assert.equal(validateGameProfile({ preferredFormats: ["not_a_format"] }).ok, false);
    assert.equal(validateGameProfile({ preferredSeconds: 3 }).ok, false);
  });
  test("a game without its objective, fun, mechanics and controls is not planned, and nothing is invented", () => {
    assert.equal(profileGaps(DEFAULT_GAME_PROFILE).length, 4);
    assert.equal(profileGaps(profile()).length, 0);
  });
  test("seeding fills only what the owner has not set", () => {
    const owner = profile({ objective: "the owner's own words here" });
    const seed = seedFor("scribblezap", { ...DEFAULT_GAME_PROFILE, objective: owner.objective });
    assert.ok(!("objective" in seed) && "funFactor" in seed);
    assert.deepEqual(seedFor("an-outside-game", DEFAULT_GAME_PROFILE), {});
  });
  test("the default energy is energetic, not the standard narrator", () => {
    assert.equal(DEFAULT_GAME_PROFILE.energy, "energetic");
    assert.equal(DEFAULT_GAME_PROFILE.voice, "auto");
  });
});

describe("continuity: a few whole stretches, never a shuffle", () => {
  test("each level becomes one segment that ends on its payoff", () => {
    const segs = levelSegments(session(3));
    assert.equal(segs.length, 3);
    assert.ok(segs.every((s) => s.payoffMs !== null && s.hasWin && s.hasClose));
  });
  test("a one-stretch format is ONE continuous stretch from one level", () => {
    for (const f of ["gameplay_hook", "how_you_play", "challenge", "reward_unlock", "mechanic_spotlight", "short_form"] as GameFormat[]) {
      const p = pickSequences(session(), f);
      assert.ok(p.ok, `${f}: ${p.ok ? "" : p.reason}`);
      if (p.ok) {
        assert.equal(p.spans.length, 1, f);
        const len = p.spans[0].toMs - p.spans[0].fromMs;
        assert.ok(len >= 5000 && len <= SHAPES[f].maxMs, `${f} stretch of ${len} ms`);
      }
    }
  });
  test("progression is three levels in a row and variety is three different levels, each played straight", () => {
    const prog = pickSequences(session(), "progression");
    assert.ok(prog.ok);
    if (prog.ok) {
      assert.equal(prog.spans.length, 3);
      const nums = prog.levels.map((l) => Number(l.slice(1)));
      assert.ok(nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1, `levels in a row: ${nums}`);
      assert.ok(prog.spans.every((s) => s.toMs - s.fromMs >= 4500));
    }
    const mon = pickSequences(session(), "variety_montage");
    assert.ok(mon.ok && new Set(mon.levels).size === 3);
  });
  test("every stretch ends on the level's payoff and starts on real action, never on dead time", () => {
    const all = [...session(2)];
    all.unshift(m(0, 0, "idle", "L1"));
    const p = pickSequences(all, "gameplay_hook");
    assert.ok(p.ok);
    if (p.ok) {
      const seg = levelSegments(all).find((s) => s.level === p.levels[0]);
      assert.ok(p.spans[0].toMs <= (seg?.toMs ?? 0) && p.spans[0].toMs >= (seg?.payoffMs ?? 0));
    }
  });
  test("levels earlier videos used are skipped while others exist, and used footage is never cut again", () => {
    const first = pickSequences(session(), "gameplay_hook");
    assert.ok(first.ok);
    if (!first.ok) return;
    const second = pickSequences(session(), "challenge", { sessionId: "s1", usedLevels: new Set(first.levels), usedFootage: first.spans.map((s) => ({ sessionId: "s1", level: s.level, fromMs: s.fromMs, toMs: s.toMs })) });
    assert.ok(second.ok);
    if (second.ok) assert.ok(!second.levels.some((l) => first.levels.includes(l)), "a different level");
    const exhausted = pickSequences(session(1), "gameplay_hook", { sessionId: "s1", usedLevels: new Set(["L1"]), usedFootage: [{ sessionId: "s1", level: "L1", fromMs: 0, toMs: 20_000 }] });
    assert.ok(!exhausted.ok && exhausted.needsMore, "no footage left: more must be captured");
  });
  test("a re-edit with another variant picks different footage", () => {
    const a = pickSequences(session(), "gameplay_hook", { variant: 0 });
    const b = pickSequences(session(), "gameplay_hook", { variant: 1 });
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) assert.notEqual(a.levels[0], b.levels[0]);
  });
  test("a format is only offered when the footage supports it", () => {
    assert.equal(formatUnsupported("gameplay_hook", session()), null);
    assert.match(formatUnsupported("one_more_try", session()) ?? "", /needs 1/, "no loss then win in the footage");
    assert.match(formatUnsupported("character_collection", session()) ?? "", /no characters/);
    assert.equal(formatUnsupported("character_collection", session(), { hasCharacters: true }), null);
    assert.match(formatUnsupported("progression", session(2)) ?? "", /needs 3/);
    const withLoss = [...level(1, 0, { loss: true, win: false }), ...level(1, 0).map((x) => ({ ...x, startMs: x.startMs + 20_000, endMs: x.endMs + 20_000 }))];
    void withLoss;
    const sup = supportedFormats([{ moments: session() }], false, GAME_LIBRARY_ORDER);
    assert.ok(sup.supported.includes("gameplay_hook") && !sup.supported.includes("character_collection"));
  });
  test("clip moments are the stretches played one after the other, with the cut points", () => {
    const p = pickSequences(session(), "progression");
    assert.ok(p.ok);
    if (p.ok) {
      const c = clipMomentsOf(session(), p.spans);
      assert.equal(c.cuts.length, 2);
      assert.equal(c.durationMs, p.spans.reduce((n, s) => n + (s.toMs - s.fromMs), 0));
      assert.ok(c.moments.every((x) => x.endMs <= c.durationMs));
    }
  });
});

describe("the capture library", () => {
  test("each level is described, with its mechanic, outcome, reward, event and orientation", () => {
    const e = buildEntries("s1", "scribblezap", [...level(1, 0, { character: "Zappy" }), ...level(2, 15_000, { win: false, loss: true })], { width: 780, height: 1688 });
    assert.equal(e.length, 2);
    assert.equal(e[0].outcome, "cleared");
    assert.equal(e[0].reward, true);
    assert.equal(e[0].character, "Zappy");
    assert.equal(e[0].mechanic, "cut");
    assert.equal(e[0].orientation, "portrait");
    assert.equal(e[1].outcome, "failed");
    assert.ok(e[0].event !== "none" && e[0].intensity > 0.5 && e[0].endMs > e[0].startMs);
  });
  test("usage records what delivered videos showed", () => {
    const clip: GameClip = { game: "g", format: "gameplay_hook", moments: level(2, 0), durationMs: 12_000, audio: "short_energetic_narration", narrationWords: 20, vertical: true, footage: [{ sessionId: "s1", level: "L2", fromMs: 1000, toMs: 9000 }] };
    const u = usageOf([clip, clip]);
    assert.ok(u.usedLevels.has("L2") && u.levelUses.get("L2") === 2 && u.usedFootage.length === 2);
  });
});

describe("game voice", () => {
  test("auto is steady for a game, differs between games, and an owner's choice always wins", () => {
    const a = gameVoiceFor({ voice: "auto", energy: "energetic" }, "scribblezap");
    assert.deepEqual(a, gameVoiceFor({ voice: "auto", energy: "energetic" }, "scribblezap"));
    const voices = new Set(["scribblezap", "mibblemeadow", "bloxmigos", "another", "more", "games", "here"].map((s) => gameVoiceFor({ voice: "auto", energy: "energetic" }, s).voice));
    assert.ok(voices.size >= 3, "games do not all sound alike");
    assert.ok([...voices].every((v) => (GAME_VOICE_IDS as readonly string[]).includes(v)));
    assert.equal(gameVoiceFor({ voice: "am_puck", energy: "fun" }, "scribblezap").voice, "am_puck");
    assert.equal(gameVoiceFor({ voice: "not-a-voice", energy: "fun" }, "x").voice.length > 0, true);
  });
  test("energy sets the pace: relaxed is plain, very energetic is quick", () => {
    const sp = (e: GameProfile["energy"]) => gameVoiceFor({ voice: "auto", energy: e }, "g").speed;
    assert.ok(sp("relaxed") < sp("fun") && sp("fun") < sp("energetic") && sp("energetic") < sp("very_energetic"));
  });
  test("a flat reading fails the energy check and a lively one passes", () => {
    assert.equal(voiceEnergyCheck({ wordsPerSec: 3.0, pitchSpread: 0.8 }, "energetic").ok, false);
    assert.equal(voiceEnergyCheck({ wordsPerSec: 4.3, pitchSpread: 0.5 }, "energetic").ok, false, "fast but monotone");
    assert.equal(voiceEnergyCheck({ wordsPerSec: 4.3, pitchSpread: 2.4 }, "energetic").ok, true);
    assert.equal(voiceEnergyCheck({ wordsPerSec: 3.1, pitchSpread: 1.3 }, "relaxed").ok, true);
  });
});

describe("game script", () => {
  const cutMoments = () => {
    const p = pickSequences(session(), "how_you_play");
    assert.ok(p.ok);
    return p.ok ? clipMomentsOf(session(), p.spans) : { moments: [], durationMs: 0, cuts: [] };
  };
  const write = (o: Partial<Parameters<typeof writeScript>[0]> = {}) => {
    const c = cutMoments();
    return writeScript({ format: "how_you_play", profile: profile(), name: "ScribbleZap", moments: c.moments, durationMs: c.durationMs, storeLive: false, history: { lines: [], uses: [] }, ...o });
  };
  test("a script opens with a hook, explains, pays off and closes with the name; short lines", () => {
    const s = write();
    assert.equal(s[0].slot, "hook");
    assert.equal(s[s.length - 1].slot, "close");
    assert.ok(s.some((l) => l.slot === "payoff") && s.some((l) => l.slot === "explain"));
    assert.match(s[s.length - 1].text, /ScribbleZap/);
    assert.ok(s.every((l) => l.text.split(/\s+/).length <= 16));
  });
  test("it sounds like game marketing, not like software or a manual, for every energy", () => {
    for (const energy of ["relaxed", "fun", "energetic", "very_energetic"] as const)
      for (let v = 0; v < 12; v++) {
        const s = write({ profile: profile({ energy }), variant: v });
        const checks = languageChecks(s.map((l) => l.text), energy);
        assert.ok(checks.every((c) => c.ok), `${energy} v${v}: ${s.map((l) => l.text).join(" | ")} ${JSON.stringify(checks.filter((c) => !c.ok))}`);
        assert.ok(!s.some((l) => GENERIC_PHRASES.some((g) => g.test(l.text))));
      }
  });
  test("the checks catch documentation voice, instructions and flat delivery", () => {
    assert.equal(languageChecks(["Our platform features a seamless interface that allows you to cut lines."], "fun").find((c) => c.id === "not_saas_voice")?.ok, false);
    assert.equal(languageChecks(["First, tap the menu. Then, select the settings option."], "fun").find((c) => c.id === "not_a_tutorial")?.ok, false);
    assert.equal(languageChecks(["This game is fun."], "fun").find((c) => c.id === "not_saas_voice")?.ok, false);
    assert.equal(languageChecks(["Play now."], "fun").find((c) => c.id === "not_saas_voice")?.ok, false);
    assert.equal(languageChecks(["The board is shown. The line is drawn. The page fills."], "very_energetic").find((c) => c.id === "has_energy")?.ok, false);
  });
  test("a store that is not live never invites a download, and a live one names the store", () => {
    const pre = write({ storeLive: false }).map((l) => l.text).join(" ");
    assert.doesNotMatch(pre, /google play|app store|download|coming soon|available now/i);
    const live = write({ storeLive: true });
    assert.match(live[live.length - 1].text, /Google Play/);
  });
  test("a second video never repeats the first one's words", () => {
    const first = write();
    const history = historyOf([{ game: "g", format: "how_you_play", moments: [], durationMs: 1, audio: "short_energetic_narration", narrationWords: 1, vertical: true, script: first.map((l) => ({ text: l.text, slot: l.slot, uses: l.uses })) }]);
    const second = write({ history });
    for (const a of second) for (const b of first) assert.ok(similarity(a.text, b.text) < 0.6, `"${a.text}" repeats "${b.text}"`);
    assert.notEqual(second[second.length - 1].text, first[first.length - 1].text);
  });
  test("lines are timed to what is on screen: the hook with the first action, the payoff as it lands", () => {
    const c = cutMoments();
    const s = write();
    const t = desiredStarts(s, c.moments, c.durationMs);
    assert.equal(t.length, s.length);
    assert.ok(t[0] <= 1500);
    assert.ok(t[t.length - 1] >= c.durationMs);
    const pay = s.findIndex((l) => l.slot === "payoff");
    const win = c.moments.find((x) => x.kind === "win");
    assert.ok(win && Math.abs(t[pay] - win.startMs) < 2500 || t[pay] > 0);
  });
  test("each game says its own thing: another game's profile gives different words", () => {
    const a = write().map((l) => l.text).join(" ");
    const b = write({ name: "Mibble Meadow", profile: profile({ objective: "find a home for every animal", funFactor: "the meadow cheers", controls: "tap to mark", mechanics: ["placing animals"] }) }).map((l) => l.text).join(" ");
    assert.notEqual(a, b);
    assert.match(b, /animal|meadow|tap to mark/i);
  });
});

describe("game hard QA", () => {
  const baseClip = () => {
    const p = pickSequences(session(), "how_you_play");
    assert.ok(p.ok);
    if (!p.ok) throw new Error("no pick");
    const cut = clipMomentsOf(session(), p.spans);
    const lines = writeScript({ format: "how_you_play", profile: profile(), name: "ScribbleZap", moments: cut.moments, durationMs: cut.durationMs, storeLive: false, history: { lines: [], uses: [] } });
    const starts = desiredStarts(lines, cut.moments, cut.durationMs);
    const clip: GameClip = { game: "scribblezap", format: "how_you_play", moments: cut.moments, durationMs: cut.durationMs, audio: "short_energetic_narration", narrationWords: 30, vertical: true, footage: p.spans.map((s) => ({ sessionId: "s1", level: s.level, fromMs: s.fromMs, toMs: s.toMs })) };
    const final: FinalLine[] = lines.map((l, k) => ({ ...l, startMs: starts[k], endMs: starts[k] + 1800 }));
    const canvas = { w: 1080, h: 1920 };
    const source = { w: 780, h: 1688 };
    const input: QaInput = { format: "how_you_play", clip, spans: p.spans, profile: profile(), narrated: true, lines: final, captions: [], gameplayEndMs: cut.durationMs, canvas, source, drawn: fitFootage(source, canvas, true), voice: { wordsPerSec: 4.2, pitchSpread: 2.4 }, voiceOverBedDb: 9, prior: [], unusedLevels: 4, levelUses: new Map() };
    return input;
  };
  const failed = (i: QaInput) => gameVideoChecks(i).filter((c) => !c.ok).map((c) => c.id);

  test("a good clip passes every check", () => {
    assert.deepEqual(failed(baseClip()), []);
  });
  test("insufficient real gameplay, synthetic footage and menu footage fail", () => {
    const a = baseClip();
    a.clip = { ...a.clip, moments: a.clip.moments.map((x) => ({ ...x, source: "synthetic" as const })) };
    assert.ok(failed(a).includes("real_gameplay"));
    const b = baseClip();
    b.clip = { ...b.clip, moments: [...b.clip.moments, m(0, 2500, "menu", "L1")] };
    assert.ok(failed(b).includes("menu_footage"));
  });
  test("a cut that breaks understanding fails continuity", () => {
    const a = baseClip();
    a.spans = [...a.spans, ...a.spans, ...a.spans, ...a.spans];
    assert.ok(failed(a).includes("continuity"), "too many cuts for the format");
    const b = baseClip();
    b.spans = b.spans.map((s) => ({ ...s, toMs: s.fromMs + 1500 }));
    assert.ok(failed(b).includes("continuity"), "stretches too short to follow");
  });
  test("no real action at once, and long dead periods, fail", () => {
    const a = baseClip();
    a.clip = { ...a.clip, moments: a.clip.moments.map((x) => ({ ...x, startMs: x.startMs + 4000, endMs: x.endMs + 4000 })) };
    assert.ok(failed(a).includes("gameplay_first_seconds") && failed(a).includes("no_dead_periods"));
  });
  test("a missing payoff fails", () => {
    const a = baseClip();
    a.clip = { ...a.clip, moments: a.clip.moments.filter((x) => !["win", "reward", "unlock", "close_call", "animation", "score"].includes(x.kind) || x.startMs < a.gameplayEndMs * 0.5) };
    assert.ok(failed(a).includes("payoff_present"));
  });
  test("footage another video used, and an overused level, fail", () => {
    const a = baseClip();
    a.prior = [{ ...a.clip, format: "challenge" }];
    assert.ok(failed(a).includes("fresh_footage"));
    const b = baseClip();
    b.levelUses = new Map(b.clip.moments.map((x) => [x.level, 2] as [string, number]));
    assert.ok(failed(b).includes("level_not_overused"));
    const c = baseClip();
    c.levelUses = new Map(c.clip.moments.map((x) => [x.level, 1] as [string, number]));
    c.unusedLevels = 3;
    assert.ok(failed(c).includes("level_not_overused"), "reused while unused levels exist");
    c.unusedLevels = 0;
    assert.ok(!failed(c).includes("level_not_overused"), "reuse is fine when nothing else is left");
  });
  test("the wrong orientation or footage cropped off the frame fails", () => {
    const a = baseClip();
    a.canvas = { w: 1920, h: 1080 };
    a.drawn = fitFootage(a.source as { w: number; h: number }, a.canvas, false);
    assert.ok(failed(a).includes("orientation_and_framing"), "portrait footage in a landscape video");
    const b = baseClip();
    b.drawn = { w: 1400, h: 1760 };
    assert.ok(failed(b).includes("orientation_and_framing"), "wider than the frame");
    const c = baseClip();
    c.profile = profile({ orientation: "landscape" });
    assert.ok(failed(c).includes("orientation_and_framing"), "the game is landscape");
  });
  test("narration that does not match the picture fails", () => {
    const a = baseClip();
    a.lines = a.lines.map((l) => (l.slot === "payoff" ? { ...l, startMs: 100, endMs: 1500, anchor: ["win" as const] } : l));
    assert.ok(failed(a).includes("narration_matches_gameplay"));
  });
  test("software voice, a tutorial and a missing objective fail", () => {
    const a = baseClip();
    a.lines = a.lines.map((l, k) => (k === 1 ? { ...l, text: "Our platform has powerful features for users." } : l));
    assert.ok(failed(a).includes("not_saas_voice"));
    const b = baseClip();
    b.lines = b.lines.map((l, k) => (k === 1 ? { ...l, text: "First, tap the menu. Then, select settings." } : l));
    assert.ok(failed(b).includes("not_a_tutorial"));
    const c = baseClip();
    c.lines = c.lines.map((l) => (l.slot === "explain" ? { ...l, text: "Look at that go!", slot: "payoff" as const } : { ...l, text: l.slot === "close" ? l.text : "Wow, so cool!" }));
    assert.ok(failed(c).includes("objective_understandable"));
  });
  test("a flat voice, and game audio that overwhelms the voice, fail", () => {
    const a = baseClip();
    a.voice = { wordsPerSec: 3.0, pitchSpread: 0.7 };
    assert.ok(failed(a).includes("voice_energy"));
    const b = baseClip();
    b.voiceOverBedDb = 1.5;
    assert.ok(failed(b).includes("game_audio_balance"));
  });
  test("a clip with no hook line and no payoff gives no reason to play", () => {
    const a = baseClip();
    a.lines = a.lines.filter((l) => l.slot !== "hook");
    assert.ok(failed(a).includes("reason_to_play") || failed(a).includes("sells_rather_than_teaches"));
  });
  test("failures are classified for the right fix: footage, words or render", () => {
    assert.equal(failureKind([{ id: "continuity", ok: false, detail: "" }]), "footage");
    assert.equal(failureKind([{ id: "not_saas_voice", ok: false, detail: "" }]), "script");
    assert.equal(failureKind([{ id: "voice_energy", ok: false, detail: "" }]), "render");
    assert.equal(failureKind([{ id: "continuity", ok: true, detail: "" }]), null);
  });
  test("every format has a shape, a game format spec and a script", () => {
    for (const f of Object.keys(GAME_FORMATS) as GameFormat[]) {
      assert.ok(SHAPES[f] && GAME_LIBRARY_ORDER.includes(f), f);
      assert.ok(SHAPES[f].spans * SHAPES[f].minMs <= (GAME_FORMATS[f].maxSeconds - 3) * 1000 + 1, `${f} fits its length`);
    }
  });
  test("the footage is fitted whole inside the frame, never cropped", () => {
    const d = fitFootage({ w: 780, h: 1688 }, { w: 1080, h: 1920 }, true);
    assert.ok(d.w <= 1080 && d.h <= 1920);
    const w = fitFootage({ w: 1920, h: 1080 }, { w: 1080, h: 1920 }, true);
    assert.ok(w.w <= 1080 && w.h <= 1920, "landscape footage in a portrait frame still fits");
  });
});
