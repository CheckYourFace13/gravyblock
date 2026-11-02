/**
 * Automated video QA. A video may enter READY_FOR_REVIEW only if every "fail" check passes: it plays and decodes cleanly, has
 * the expected duration and 1080x1920 H.264, stays under the size limit, has no black or long frozen stretches, its cards passed
 * the creative QA, its captions are inside the safe area and traceable to Product Truth, all media exists and is approved, the
 * CTA card is readable, and any audio track is valid and not silent.
 */
import { VIDEO } from "../config";
import { run, ffprobe } from "./ffmpeg";
import type { QaCheck } from "../creative/qa";

export type VideoQaInput = {
  file: string;
  expectedSeconds: number;
  expectAudio: boolean;
  cardResults: Array<{ index: number; passed: boolean; failed: string[]; isCta: boolean }>;
  captions: Array<{ text: string; wrapped: boolean; traced: boolean; prohibited: boolean }>;
  media: Array<{ id: string; present: boolean; approved: boolean }>;
  maxBytes?: number;
};

export async function runVideoQa(i: VideoQaInput): Promise<{ passed: boolean; checks: QaCheck[]; probe: Awaited<ReturnType<typeof ffprobe>> | null }> {
  const checks: QaCheck[] = [];
  const add = (id: string, ok: boolean, detail: string, severity: "fail" | "warn" = "fail") => checks.push({ id, ok, severity, detail });
  let probe: Awaited<ReturnType<typeof ffprobe>> | null = null;
  try {
    probe = await ffprobe(i.file);
    add("playable", Boolean(probe.video), probe.video ? "container and video stream read correctly" : "no video stream");
  } catch (e) {
    add("playable", false, e instanceof Error ? e.message : String(e));
    return { passed: false, checks, probe };
  }
  const v = probe.video!;
  add("dimensions_and_codec", v.width === VIDEO.width && v.height === VIDEO.height && v.codec === "h264" && v.pixFmt === "yuv420p", `${v.width}x${v.height} ${v.codec} ${v.pixFmt}, expected ${VIDEO.width}x${VIDEO.height} h264 yuv420p`);
  add("frame_rate", Math.abs(v.fps - VIDEO.fps) < 0.5, `${v.fps.toFixed(2)} fps`);
  const dur = probe.durationSec ?? 0;
  add("duration", Math.abs(dur - i.expectedSeconds) <= 0.6, `${dur.toFixed(2)}s, expected ${i.expectedSeconds}s`);
  add("duration_limit", dur <= VIDEO.maxSeconds + 0.5, `${dur.toFixed(1)}s of ${VIDEO.maxSeconds}s allowed`);
  const bytes = probe.sizeBytes ?? 0;
  add("file_size", bytes > 0 && bytes <= (i.maxBytes ?? VIDEO.maxBytes), `${(bytes / 1024 / 1024).toFixed(2)} MB of ${((i.maxBytes ?? VIDEO.maxBytes) / 1024 / 1024).toFixed(0)} MB allowed`);

  // Whole-file decode, plus black and frozen-frame detection, in one pass.
  const scan = await run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "info", "-threads", "2", "-i", i.file, "-vf", "blackdetect=d=0.4:pix_th=0.08,freezedetect=n=-60dB:d=6", "-an", "-f", "null", "-"], { timeoutMs: 180_000 });
  const decodeErrors = scan.stderr.split("\n").filter((l) => /error|invalid|corrupt|non-monotonic|missing/i.test(l) && !/blackdetect|freezedetect/.test(l));
  add("decodes_cleanly", scan.code === 0 && decodeErrors.length === 0, scan.code === 0 ? (decodeErrors.length ? decodeErrors[0].slice(0, 160) : "decoded every frame without errors") : `ffmpeg exited ${scan.code}`);
  const black = (scan.stderr.match(/black_start/g) ?? []).length;
  add("no_black_frames", black === 0, black ? `${black} black segment(s) longer than 0.4s` : "no black segments");
  const frozen = (scan.stderr.match(/freeze_start/g) ?? []).length;
  add("no_long_freeze", frozen === 0, frozen ? `${frozen} frozen stretch(es) longer than 6s` : "no long frozen stretch");

  const badCards = i.cardResults.filter((c) => !c.passed);
  add("cards_passed_creative_qa", badCards.length === 0, badCards.length ? `cards failed QA: ${badCards.map((c) => `scene ${c.index + 1}: ${c.failed[0] ?? ""}`).join("; ")}` : "every card passed the creative QA");
  const cta = i.cardResults.find((c) => c.isCta);
  add("cta_readable", Boolean(cta?.passed), cta ? (cta.passed ? "CTA card passed readability, size and contrast checks" : "CTA card failed QA") : "no CTA card");
  const wrapFail = i.captions.filter((c) => !c.wrapped);
  add("captions_in_safe_area", wrapFail.length === 0, wrapFail.length ? `caption does not fit ${VIDEO.captionMaxLines} lines of ${VIDEO.captionMaxCharsPerLine} characters: "${wrapFail[0].text.slice(0, 40)}"` : `${i.captions.length} caption(s) fit the safe area (clear of the bottom 360px)`);
  const untraced = i.captions.filter((c) => !c.traced);
  add("captions_grounded_in_product_truth", untraced.length === 0, untraced.length ? `caption not traceable to Product Truth: "${untraced[0].text.slice(0, 50)}"` : "every caption traces to a verified fact");
  const prohibited = i.captions.filter((c) => c.prohibited);
  add("no_prohibited_claims", prohibited.length === 0, prohibited.length ? `caption contains a prohibited claim: "${prohibited[0].text.slice(0, 50)}"` : "no prohibited claims in captions");
  const missing = i.media.filter((m) => !m.present || !m.approved);
  add("media_present_and_approved", missing.length === 0, missing.length ? `missing or unapproved media: ${missing.map((m) => m.id).join(", ")}` : "all media present and approved");

  if (i.expectAudio) {
    const a = probe.audio;
    add("audio_track_valid", Boolean(a && a.codec === "aac" && (a.durationSec ?? 0) >= dur - 0.6), a ? `${a.codec}, ${(a.durationSec ?? 0).toFixed(1)}s` : "expected an audio track but none was found");
    const vol = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", i.file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { timeoutMs: 120_000 });
    const mean = /mean_volume: (-?[\d.]+) dB/.exec(vol.stderr);
    add("audio_not_silent", Boolean(mean && Number(mean[1]) > -60), mean ? `mean volume ${mean[1]} dB` : "could not measure audio level");
  } else {
    add("audio_track_valid", !probe.audio, probe.audio ? "unexpected audio track" : "no audio track (none requested)", "warn");
  }
  const passed = checks.every((c) => c.ok || c.severity === "warn");
  return { passed, checks, probe };
}
