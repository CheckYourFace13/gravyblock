/**
 * Bounded FFmpeg and ffprobe runners. Every child is registered with the active-work registry so the kill switch and hard
 * timeouts end the real process, runs at low CPU priority through the worker's own nice level, and has a wall-clock limit.
 */
import { spawn } from "node:child_process";
import { registerKiller } from "../active-work";

export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

export function run(cmd: string, args: string[], opts: { timeoutMs: number; maxOutput?: number; cwd?: string } = { timeoutMs: 120_000 }): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = opts.maxOutput ?? 2_000_000;
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < cap) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < cap) stderr += d.toString();
    });
    const unregister = registerKiller(() => child.kill("SIGKILL"));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      unregister();
      resolve({ code, stdout, stderr, timedOut });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      unregister();
      resolve({ code: -1, stdout, stderr: stderr + String(e), timedOut });
    });
  });
}

export async function ffmpeg(args: string[], timeoutMs: number, cwd?: string): Promise<RunResult> {
  return run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-threads", "2", ...args], { timeoutMs, cwd });
}

export type ProbeInfo = {
  durationSec: number | null;
  video: { codec: string; width: number; height: number; pixFmt: string; fps: number } | null;
  audio: { codec: string; durationSec: number | null } | null;
  sizeBytes: number | null;
};

export async function ffprobe(file: string): Promise<ProbeInfo> {
  const r = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`ffprobe failed: ${r.stderr.slice(0, 200)}`);
  const j = JSON.parse(r.stdout) as { format?: { duration?: string; size?: string }; streams?: Array<Record<string, string>> };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const fr = (v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    durationSec: j.format?.duration ? Number(j.format.duration) : null,
    sizeBytes: j.format?.size ? Number(j.format.size) : null,
    video: v ? { codec: v.codec_name, width: Number(v.width), height: Number(v.height), pixFmt: v.pix_fmt, fps: fr[1] ? fr[0] / fr[1] : 0 } : null,
    audio: a ? { codec: a.codec_name, durationSec: a.duration ? Number(a.duration) : null } : null,
  };
}
