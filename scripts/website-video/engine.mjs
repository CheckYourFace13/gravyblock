/**
 * GravyBlock website video engine. This is how the explainer videos on gravyblock.com are made: a scripted, deliberate walk through the REAL live site
 * (real mouse movement, real typing, real navigation, a real scan), recorded as high quality frames, with free offline narration (Kokoro, made by
 * tts-run), captions, original music and a clean 16:9 encode. It is separate from the autonomous Marketing Studio pipeline on purpose.
 *
 * A video is a list of BEATS. Each beat has one narration line (by id) and a function that performs its actions while that line is spoken. The beat lasts as long
 * as its audio (plus a short breath); if the actions run longer, the beat stretches and the audio is placed at the real start time, so picture and voice cannot drift.
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const W = 1920;
const H = 1080;
const FPS = 30;
const CHROME = process.env.WV_CHROME ?? "C:/Users/chris/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe";
export const SITE = process.env.WV_SITE ?? "https://gravyblock.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Injected into every page of the recording: the visible cursor, click ripple, spotlight, callout label, captions and the fade veil. */
const OVERLAY = `(() => {
  if (window.__gb) return;
  const mk = (tag, css) => { const e = document.createElement(tag); e.style.cssText = css; return e; };
  const root = () => document.documentElement;
  const st = { x: 960, y: 560 };
  try { const s = JSON.parse(sessionStorage.getItem("__gbpos") || "null"); if (s) { st.x = s.x; st.y = s.y; } } catch {}
  const cur = mk("div", "position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483646;pointer-events:none;transition:none;will-change:transform;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))");
  cur.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const veil = mk("div", "position:fixed;inset:0;background:#fff;z-index:2147483647;pointer-events:none;opacity:1;transition:opacity .28s ease");
  const spot = mk("div", "position:fixed;z-index:2147483640;pointer-events:none;border-radius:14px;border:4px solid #e11;opacity:0;transition:opacity .3s ease, left .35s ease, top .35s ease, width .35s ease, height .35s ease;box-shadow:0 0 0 9999px rgba(10,10,10,.50)");
  const label = mk("div", "position:fixed;z-index:2147483641;pointer-events:none;background:#e11;color:#fff;font:700 26px/1.2 'Segoe UI',system-ui,sans-serif;padding:10px 18px;border-radius:999px;opacity:0;transition:opacity .3s ease;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35)");
  const cap = mk("div", "position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;max-width:1500px;text-align:center;background:rgba(12,12,12,.80);color:#fff;font:600 40px/1.25 'Segoe UI',system-ui,sans-serif;padding:14px 30px;border-radius:16px;opacity:0;transition:opacity .18s ease");
  const place = () => { cur.style.transform = "translate(" + (st.x - 6) + "px," + (st.y - 4) + "px)"; };
  const mount = () => { const r = root(); for (const e of [spot, label, cap, cur, veil]) if (!e.isConnected) r.appendChild(e); place(); };
  document.addEventListener("mousemove", (ev) => { st.x = ev.clientX; st.y = ev.clientY; place(); try { sessionStorage.setItem("__gbpos", JSON.stringify(st)); } catch {} }, true);
  document.addEventListener("mousedown", (ev) => {
    const r = mk("div", "position:fixed;z-index:2147483644;pointer-events:none;width:20px;height:20px;border-radius:50%;border:5px solid #e11;left:" + (ev.clientX - 10) + "px;top:" + (ev.clientY - 10) + "px;opacity:.95;transition:all .55s ease-out");
    root().appendChild(r);
    requestAnimationFrame(() => { r.style.width = "86px"; r.style.height = "86px"; r.style.left = ev.clientX - 43 + "px"; r.style.top = ev.clientY - 43 + "px"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 700);
  }, true);
  window.__gb = {
    mount,
    veil: (on) => { mount(); veil.style.opacity = on ? "1" : "0"; },
    spot: (x, y, w, h, text, where) => {
      mount();
      Object.assign(spot.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px", opacity: "1" });
      if (text) {
        label.textContent = text; label.style.opacity = "1";
        const lw = label.offsetWidth;
        const lx = Math.max(24, Math.min(1920 - lw - 24, x + (where === "left" ? 0 : w - lw)));
        const ly = where === "above" ? y - 62 : y + h + 16;
        label.style.left = lx + "px"; label.style.top = Math.max(16, Math.min(1010 - 60, ly)) + "px";
      } else label.style.opacity = "0";
    },
    unspot: () => { spot.style.opacity = "0"; label.style.opacity = "0"; },
    cap: (t) => { mount(); if (!t) { cap.style.opacity = "0"; return; } cap.textContent = t; cap.style.opacity = "1"; },
    smoothScroll: (to, ms) => new Promise((res) => {
      const from = window.scrollY, max = document.documentElement.scrollHeight - innerHeight, target = Math.max(0, Math.min(max, to));
      const t0 = performance.now();
      const e = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const f = (now) => { const k = Math.min(1, (now - t0) / ms); window.scrollTo(0, from + (target - from) * e(k)); k < 1 ? requestAnimationFrame(f) : res(); };
      requestAnimationFrame(f);
    }),
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-600)}`);
  return r.stdout;
}
const durationOf = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());

/** Splits a spoken line into caption phrases of at most about 8 words, breaking at punctuation first. */
export function phrases(text) {
  const parts = text.replace(/\s+/g, " ").split(/(?<=[.,:;!?])\s+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const w = p.split(" ");
    if (w.length <= 9) out.push(p);
    else {
      const n = Math.ceil(w.length / 8);
      const size = Math.ceil(w.length / n);
      for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(" "));
    }
  }
  return out;
}

/** The helpers a beat uses. Everything is deliberate: moves have a duration and an easing, typing has a pace, pages fade rather than flash. */
function helpers(page) {
  let pos = { x: 960, y: 560 };
  const h = {
    page,
    async fade(on) { await page.evaluate((o) => window.__gb?.veil(o), on).catch(() => {}); },
    async go(url, { settle = 450, first = false } = {}) {
      if (!first) {
        await h.fade(true);
        await sleep(300);
      }
      await page.goto(url.startsWith("http") ? url : SITE + url, { waitUntil: "load" });
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 1200 }).catch(() => {});
      await page.evaluate(OVERLAY).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(settle);
      await h.fade(false);
      await sleep(first ? 100 : 280);
    },
    async box(target) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await loc.waitFor({ state: "visible", timeout: 15000 });
      const b = await loc.boundingBox();
      if (!b) throw new Error("no box for " + String(target));
      return b;
    },
    /** scroll so the element sits comfortably in the upper-middle of the picture */
    async reveal(target, { ms = 900, top = 260 } = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await loc.waitFor({ state: "attached", timeout: 15000 });
      const y = await loc.evaluate((e, t) => e.getBoundingClientRect().top + window.scrollY - t, top);
      await page.evaluate(([to, d]) => window.__gb.smoothScroll(to, d), [y, ms]);
      await sleep(120);
    },
    async scroll(to, ms = 1200) { await page.evaluate(([t, d]) => window.__gb.smoothScroll(t, d), [to, ms]); },
    async move(target, { ms = 800, dx = 0, dy = 0 } = {}) {
      let tx, ty;
      if (Array.isArray(target)) [tx, ty] = target;
      else { const b = await h.box(target); tx = b.x + b.width / 2 + dx; ty = b.y + b.height / 2 + dy; }
      const sx = pos.x, sy = pos.y;
      const mx = (sx + tx) / 2 + (ty - sy) * 0.12, my = (sy + ty) / 2 - (tx - sx) * 0.12; // a slight arc, like a hand
      const n = Math.max(8, Math.round(ms / 16));
      const t0 = Date.now();
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n);
        const x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * mx + k * k * tx;
        const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * my + k * k * ty;
        await page.mouse.move(x, y);
        const wait = t0 + (i * ms) / n - Date.now();
        if (wait > 0) await sleep(wait);
      }
      pos = { x: tx, y: ty };
    },
    async click(target, o = {}) {
      await h.move(target, o);
      await sleep(140);
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
    },
    async type(target, text, { cps = 11 } = {}) {
      await h.click(target, { ms: 650 });
      await sleep(180);
      await page.keyboard.type(text, { delay: Math.round(1000 / cps) });
    },
    /** dim the page, ring one element and label it */
    async spot(target, label, { pad = 14, where = "below", viewportTop = false } = {}) {
      const b = await h.box(target);
      await page.evaluate(([x, y, w, hh, t, wh]) => window.__gb.spot(x, y, w, hh, t, wh), [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, label ?? "", where]);
    },
    async unspot() { await page.evaluate(() => window.__gb.unspot()); },
    async caption(t) { await page.evaluate((x) => window.__gb.cap(x), t).catch(() => {}); },
    sleep,
  };
  return h;
}

/** Records a video. `beats`: [{ id, run(h, ctx) }], `lines`: the narration lines of the script, `routes`: custom pages { "/__v/x": html } the video may open. */
export async function capture({ name, beats, lines, outDir, audioDir, routes = {}, files = {}, lead = 0.25, breath = 0.4 }) {
  const dur = Object.fromEntries(lines.map((l) => [l.id, durationOf(path.join(audioDir, l.id + ".wav"))]));
  fs.rmSync(path.join(outDir, "frames"), { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--force-device-scale-factor=1", "--hide-scrollbars", "--disable-lcd-text"] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await context.addInitScript(OVERLAY);
  // every capture session is marked internal so it never counts as a real visitor, scan or conversion
  await context.addCookies([{ name: "gb_internal", value: "1", url: SITE }]);
  const page = await context.newPage();
  for (const [p, html] of Object.entries(routes)) await page.route(SITE + p, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  for (const [p, f] of Object.entries(files)) await page.route(SITE + p, (r) => r.fulfill({ status: 200, contentType: f.type, body: fs.readFileSync(f.path) }));
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(outDir, "frames", String(n).padStart(6, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, ts: f.metadata.timestamp });
    n++;
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await page.goto("about:blank");
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const h = helpers(page);
  const ctx = { dur };
  const starts = [];
  let T0 = null;
  for (const beat of beats) {
    const d = dur[beat.id] ?? 0;
    if (beat.pre) await beat.pre(h, ctx); // set-up before the clock starts: the first picture is already the page, never a blank
    const t = Date.now() / 1000;
    if (T0 === null) T0 = t;
    starts.push({ id: beat.id, t });
    // captions follow the voice: each phrase is on screen for its share of the line
    const ph = phrases(lines.find((l) => l.id === beat.id)?.text ?? "");
    const total = ph.reduce((a, p) => a + p.length, 0) || 1;
    const capTimer = (async () => {
      await sleep(lead * 1000);
      for (const p of ph) {
        await h.caption(p);
        await sleep((d * 1000 * p.length) / total);
      }
      await h.caption("");
    })();
    const endAt = Date.now() + (lead + d + breath) * 1000;
    await Promise.all([beat.run(h, ctx), sleep(Math.max(0, endAt - Date.now()))]);
    await capTimer;
  }
  const end = Date.now() / 1000;
  await sleep(300);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await browser.close();
  if (!frames.length) throw new Error("no frames were captured");
  // frame list with durations; the last frame before T0 becomes the first frame
  let first = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].ts <= T0) first = i;
  const use = frames.slice(first);
  const lines2 = [];
  for (let i = 0; i < use.length; i++) {
    const t = Math.max(use[i].ts, T0);
    const next = i + 1 < use.length ? use[i + 1].ts : end;
    lines2.push(`file '${use[i].file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - t).toFixed(4)}`);
  }
  lines2.push(`file '${use[use.length - 1].file.replace(/\\/g, "/")}'`);
  fs.writeFileSync(path.join(outDir, "frames.txt"), lines2.join("\n"));
  const timeline = starts.map((s) => ({ id: s.id, at: +(s.t - T0 + lead).toFixed(3), dur: dur[s.id] }));
  fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify({ total: +(end - T0).toFixed(3), beats: timeline }, null, 2));
  return { total: end - T0, timeline, frames: use.length };
}

/** Narration track from the timeline, original music underneath with ducking, then the final 16:9 mp4 plus poster and captions file. */
export function assemble({ name, outDir, audioDir, musicWav, final }) {
  const tl = JSON.parse(fs.readFileSync(path.join(outDir, "timeline.json"), "utf8"));
  const total = tl.total + 0.6;
  const inputs = [];
  const parts = [];
  tl.beats.forEach((b, i) => {
    inputs.push("-i", path.join(audioDir, b.id + ".wav"));
    const ms = Math.round(b.at * 1000);
    parts.push(`[${i}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${ms}|${ms}[v${i}]`);
  });
  const mi = tl.beats.length;
  inputs.push("-i", musicWav);
  const vo = tl.beats.map((_, i) => `[v${i}]`).join("");
  const fade = Math.max(0, total - 2.2);
  const filter = [
    ...parts,
    `${vo}amix=inputs=${tl.beats.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)},asplit=2[vo][vosc]`,
    `[${mi}:a]aresample=48000,atrim=0:${total.toFixed(2)},volume=0.5,afade=t=in:d=1.2,afade=t=out:st=${fade.toFixed(2)}:d=2.2[m]`,
    `[m][vosc]sidechaincompress=threshold=0.02:ratio=9:attack=10:release=500:makeup=1[md]`,
    `[vo][md]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=9,alimiter=limit=0.89:level=disabled[out]`,
  ].join(";");
  const audioOut = path.join(outDir, "mix.wav");
  run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "48000", "-ac", "2", audioOut]);
  fs.mkdirSync(path.dirname(final), { recursive: true });
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(outDir, "frames.txt"), "-i", audioOut,
    "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-movflags", "+faststart", "-g", "60",
    "-c:a", "aac", "-b:a", "128k", "-t", total.toFixed(2), final,
  ]);
  return { duration: durationOf(final), bytes: fs.statSync(final).size };
}

/** WebVTT captions from the timeline, with the same phrase splitting and timing as the burned-in captions. */
export function writeVtt({ lines, outDir, file }) {
  const tl = JSON.parse(fs.readFileSync(path.join(outDir, "timeline.json"), "utf8"));
  const ts = (s) => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`; };
  const out = ["WEBVTT", ""];
  let i = 1;
  for (const b of tl.beats) {
    const ph = phrases(lines.find((l) => l.id === b.id).text);
    const total = ph.reduce((a, p) => a + p.length, 0) || 1;
    let t = b.at;
    for (const p of ph) {
      const d = (b.dur * p.length) / total;
      out.push(String(i++), `${ts(t)} --> ${ts(t + d)}`, p, "");
      t += d;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join("\n"));
}

export const poster = (video, at, file) => run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", video, "-frames:v", "1", "-q:v", "3", "-vf", "scale=1280:720", file]);
