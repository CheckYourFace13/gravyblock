/**
 * Frame-by-frame rendering of the stage. For each frame: seek the page to that exact time, screenshot it, and stream it to FFmpeg together
 * with the finished audio mix. Deterministic: the same timeline always gives the same video, however busy the machine is.
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerKiller } from "../../active-work";
import { launchBrowser } from "../../creative/render";
import type { LogoProbe } from "../../brand/logo-integrity";
import { buildStageHtml } from "./stage";
import { CANVAS, type Timeline } from "./types";

export type RenderStats = { frames: number; wallMs: number; /** the logo as measured and photographed in the live render, for the logo-integrity QA */ logo: { probes: LogoProbe[]; shot: Buffer | null } };

/** `dir` must hold stage assets: the plate images and the logo, at the paths the timeline names. */
export async function renderDemo(opts: { dir: string; timeline: Timeline; audioFile: string; outFile: string; onProgress?: (done: number, total: number) => void }): Promise<RenderStats> {
  const { dir, timeline, audioFile, outFile } = opts;
  const t0 = Date.now();
  const total = Math.ceil((timeline.durationMs / 1000) * CANVAS.fps);
  const stagePath = path.join(dir, "stage.html");
  await writeFile(stagePath, buildStageHtml(timeline));

  const ff = spawn(
    "ffmpeg",
    [
      "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-threads", "2",
      "-f", "image2pipe", "-framerate", String(CANVAS.fps), "-c:v", "mjpeg", "-i", "-",
      "-i", audioFile,
      "-map", "0:v", "-map", "1:a",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-x264-params", "rc-lookahead=8:sync-lookahead=0:threads=2", "-pix_fmt", "yuv420p", "-r", String(CANVAS.fps),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", (timeline.durationMs / 1000).toFixed(3),
      "-movflags", "+faststart",
      outFile,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let ffErr = "";
  ff.stderr.on("data", (d: Buffer) => {
    if (ffErr.length < 4000) ffErr += d.toString();
  });
  const unregisterFf = registerKiller(() => ff.kill("SIGKILL"));
  const ffDone = new Promise<number | null>((resolve) => ff.on("close", (code) => resolve(code)));
  ff.stdin.on("error", () => {
    /* surfaced through the exit code */
  });

  const logo: RenderStats["logo"] = { probes: [], shot: null };
  const handle = await launchBrowser();
  try {
    const ctx = await handle.browser.newContext({ viewport: { width: CANVAS.w, height: CANVAS.h }, deviceScaleFactor: 1, offline: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    // Only local files may load: the stage never touches the network.
    await page.route("**/*", (route) => (route.request().url().startsWith("file:") || route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.goto(pathToFileURL(stagePath).href, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => (window as unknown as { __ready: Promise<unknown> }).__ready);
    // logo fidelity: measure and photograph the logo while the end card shows it at full size, before any frame is encoded
    const endAt = timeline.scenes.find((s) => s.kind === "end");
    if (endAt) await page.evaluate((ms) => (window as unknown as { __seek: (n: number) => void }).__seek(ms), Math.min(timeline.durationMs - 50, endAt.start + 1500));
    logo.probes = (await page.evaluate(() =>
      ["blogo", "elogo"].flatMap((c) => {
        const el = document.querySelector("." + c) as HTMLImageElement | null;
        if (!el) return [];
        const cs = getComputedStyle(el);
        return [{ selector: "." + c, naturalW: el.naturalWidth, naturalH: el.naturalHeight, boxW: el.offsetWidth, boxH: el.offsetHeight, objectFit: cs.objectFit, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, filter: cs.filter, clip: cs.clipPath, opacity: cs.opacity, transform: cs.transform }];
      }),
    )) as LogoProbe[];
    if (endAt) logo.shot = await page.locator(".elogo").screenshot({ type: "png", timeout: 15_000 }).catch(() => null);
    for (let f = 0; f < total; f++) {
      const t = (f * 1000) / CANVAS.fps;
      await page.evaluate((ms) => (window as unknown as { __seek: (n: number) => void }).__seek(ms), t);
      const buf = await page.screenshot({ type: "jpeg", quality: 90, timeout: 30_000 });
      if (!ff.stdin.write(buf)) await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
      if (opts.onProgress && f % 30 === 0) opts.onProgress(f, total);
    }
    ff.stdin.end();
    const code = await ffDone;
    if (code !== 0) throw new Error(`video encode failed: ${ffErr.slice(0, 300)}`);
  } finally {
    unregisterFf();
    ff.stdin.destroy();
    ff.kill("SIGKILL");
    await handle.close();
  }
  return { frames: total, wallMs: Date.now() - t0, logo };
}
