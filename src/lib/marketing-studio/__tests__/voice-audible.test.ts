import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GAME_AUDIO_MODES, GAME_FORMATS, MAX_NARRATION_WORDS, MIN_NARRATION_WORDS, gameFunChecks, gameNarrationLines, narrationExpected, type GameClip, type GameFormat } from "../video/game/engine";
import { correlate, envelope, judgeLines } from "../video/voice-audible";

const RATE = 8000;
/** 8 kHz test audio: a steady music bed with a louder tone burst wherever a line is spoken (what a ducked mix looks like). */
function mix(totalMs: number, lines: Array<{ startMs: number; endMs: number }>, voiceAmp: number, bedAmp = 0.05): Float32Array {
  const s = new Float32Array(Math.round((totalMs / 1000) * RATE));
  for (let i = 0; i < s.length; i++) s[i] = Math.sin((2 * Math.PI * 220 * i) / RATE) * bedAmp;
  for (const l of lines) for (let i = Math.round((l.startMs / 1000) * RATE); i < Math.round((l.endMs / 1000) * RATE) && i < s.length; i++) s[i] += Math.sin((2 * Math.PI * 440 * i) / RATE) * voiceAmp * (0.6 + 0.4 * Math.sin(i / 300));
  return s;
}
const LINES = [
  { startMs: 600, endMs: 3000 },
  { startMs: 4200, endMs: 7000 },
  { startMs: 8200, endMs: 10500 },
];

describe("narration must be audible in the final file", () => {
  it("passes when every line sits clearly above the music bed", () => {
    const r = judgeLines(mix(12000, LINES, 0.3), LINES);
    assert.equal(r.audible, true, r.reason);
    assert.equal(r.linesHeard, 3);
  });
  it("fails when the voice was dropped from the mix (music only)", () => {
    const r = judgeLines(mix(12000, LINES, 0), LINES);
    assert.equal(r.audible, false);
    assert.match(r.reason, /NOT audible/);
  });
  it("fails for a silent track", () => {
    assert.equal(judgeLines(new Float32Array(RATE * 12), LINES).audible, false);
  });
  it("fails when the file has no audio stream at all", () => {
    const r = judgeLines(null, LINES);
    assert.equal(r.audible, false);
    assert.match(r.reason, /no audio stream/);
  });
  it("fails when narration is expected but there are no spoken lines", () => {
    const r = judgeLines(mix(12000, [], 0), []);
    assert.equal(r.audible, false);
    assert.match(r.reason, /no spoken lines/);
  });
  it("fails when only some lines were heard (a line that was cut)", () => {
    const r = judgeLines(mix(12000, [LINES[0]], 0.3), LINES);
    assert.equal(r.audible, false);
  });
  it("envelope correlation helper follows a voice", () => {
    const a = envelope(mix(12000, LINES, 0.3));
    assert.ok(correlate(a, a) > 0.99);
    assert.equal(correlate([1, 2], [1, 2]), 0);
  });
});

describe("game clips: a promised voice is required", () => {
  const clip = (format: GameFormat, audio: GameClip["audio"], words: number): GameClip => ({
    game: "g",
    format,
    audio,
    narrationWords: words,
    vertical: GAME_FORMATS[format].vertical,
    durationMs: 9000,
    moments: [
      { startMs: 0, endMs: 1200, kind: "input", level: "L1", mechanic: "place", intensity: 0.8, source: "real_capture" },
      { startMs: 1200, endMs: 2400, kind: "input", level: "L1", mechanic: "place", intensity: 0.8, source: "real_capture" },
      { startMs: 2400, endMs: 4000, kind: "reward", level: "L1", mechanic: "reward", intensity: 0.9, source: "real_capture" },
    ],
  });
  it("a narrated mode with no spoken words fails the audio check", () => {
    const c = gameFunChecks(clip("mechanic_spotlight", "short_energetic_narration", 0)).find((x) => x.id === "audio_choice");
    assert.equal(c?.ok, false);
  });
  it("a captions-and-music mode needs no voice", () => {
    assert.equal(gameFunChecks(clip("challenge", "challenge_text", 0)).find((x) => x.id === "audio_choice")?.ok, true);
  });
  it("every format's default mode has a script inside its word limits", () => {
    for (const f of Object.keys(GAME_FORMATS) as GameFormat[]) {
      const mode = GAME_AUDIO_MODES[f][0];
      const lines = gameNarrationLines(f, mode, "Mibble Meadow");
      if (!narrationExpected(mode)) {
        assert.equal(lines.length, 0, f);
        continue;
      }
      const words = lines.join(" ").split(/\s+/).length;
      assert.ok(words >= MIN_NARRATION_WORDS[mode] && words <= MAX_NARRATION_WORDS[mode], `${f}: ${words} words`);
      assert.match(lines[lines.length - 1], /Mibble Meadow/);
    }
  });
  it("the formats other than challenge and short-form are narrated by default", () => {
    for (const f of ["gameplay_hook", "progression", "reward_unlock", "mechanic_spotlight", "variety_montage"] as GameFormat[]) assert.ok(narrationExpected(GAME_AUDIO_MODES[f][0]), f);
  });
});
