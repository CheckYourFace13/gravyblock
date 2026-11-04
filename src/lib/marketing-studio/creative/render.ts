/**
 * Renders a built creative to PNG with headless Chromium (playwright-core, which downloads nothing). The page receives only
 * the HTML string we built: every request that is not a data: URL is aborted, so a template or an asset can never fetch
 * anything from the network or the filesystem. Chromium runs inside the Studio worker's cgroup, so the memory and CPU limits apply.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { STUDIO_DIRS } from "../config";
import { registerKiller } from "../active-work";
import { SIZES } from "./theme";
import type { BuiltCreative } from "./templates";
import type { SizeKey } from "./theme";

export type Measure = {
  canvas: { w: number; h: number };
  texts: Array<{ idx: number; role: string; text: string; fs: number; min: number; overflow: boolean; rect: { x: number; y: number; w: number; h: number } }>;
  frames?: Array<{ rect: { x: number; y: number; w: number; h: number } }>;
  images: Array<{ asset: string; role: string; rect: { x: number; y: number; w: number; h: number }; natural: { w: number; h: number }; ok: boolean }>;
};

export function chromiumExecutable(): string {
  const p = process.env.MARKETING_CHROMIUM_PATH?.trim();
  if (!p) throw new Error("MARKETING_CHROMIUM_PATH is not set (path to a Chromium or headless shell binary)");
  return p;
}

export type BrowserHandle = { browser: Browser; kill: () => void; close: () => Promise<void> };

/**
 * Starts Chromium as OUR child process and attaches over CDP. Owning the process handle is what lets the worker watchdog (kill
 * switch, hard timeout) end the real process, and its profile lives in the Studio temp directory so cleanup and disk accounting apply.
 */
export async function launchBrowser(): Promise<BrowserHandle> {
  await mkdir(STUDIO_DIRS.tmp, { recursive: true });
  const profile = await mkdtemp(path.join(STUDIO_DIRS.tmp, "chromium-"));
  const child: ChildProcess = spawn(
    chromiumExecutable(),
    [
      "--headless",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      // --no-sandbox is acceptable here: the page only ever contains our own generated HTML with all network access aborted.
      "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-networking",
      "--no-first-run", "--mute-audio", "--hide-scrollbars", "--font-render-hinting=none", "--disable-features=Translate,OptimizationHints",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const kill = () => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  };
  const unregister = registerKiller(kill);
  const cleanup = async () => {
    unregister();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  child.once("exit", () => void cleanup());
  try {
    const wsUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chromium did not start within 20s")), 20_000);
      let buf = "";
      child.stderr!.on("data", (d: Buffer) => {
        buf += d.toString();
        const m = /DevTools listening on (wss?:\/\/\S+)/.exec(buf);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited early (code ${code})`));
      });
    });
    const browser = await chromium.connectOverCDP(wsUrl, { timeout: 20_000 });
    return {
      browser,
      kill,
      close: async () => {
        // The process is ours and its pages hold nothing worth saving, so end it directly instead of waiting on a graceful CDP shutdown.
        void browser.close().catch(() => {});
        kill();
        await cleanup();
      },
    };
  } catch (e) {
    kill();
    await cleanup();
    throw e;
  }
}

export async function renderCreative(browser: Browser, built: BuiltCreative, size: SizeKey): Promise<{ png: Buffer; measure: Measure }> {
  const { w, h } = SIZES[size];
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, javaScriptEnabled: true, offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const url = route.request().url();
      return url.startsWith("data:") || url === "about:blank" ? route.continue() : route.abort();
    });
    await page.setContent(built.html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluate(async () => {
      await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
      (window as unknown as { __fit: () => void }).__fit();
    });
    const measure = (await page.evaluate(() => (window as unknown as { __measure: () => unknown }).__measure())) as Measure;
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h }, timeout: 20_000 });
    return { png, measure };
  } finally {
    await context.close();
  }
}
