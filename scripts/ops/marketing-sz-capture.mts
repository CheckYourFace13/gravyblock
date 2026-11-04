// The ScribbleZap gameplay capture (v2, multi-level): scripted touch input plays the private web tester through many levels, then shows the level
// picker, the home screen and a Daily Challenge, inside a disposable browser profile. GET only to iscreamstudio.com, nothing is saved or changed,
// no code is touched, nothing is deployed. Frames come from a CDP screencast (about 50 fps while the game moves); a HUD text log is kept beside it.
// Run on the VPS as the Studio user; output goes to STUDIO_GAME_CAPTURE_OUT. See docs/marketing-studio/ROLLOUT-AND-PAID-ROADMAP.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
const OUT = process.env.STUDIO_GAME_CAPTURE_OUT ?? "/tmp/szcap";
const MAX_LEVELS = Number(process.env.STUDIO_GAME_CAPTURE_LEVELS ?? 10);
mkdirSync(OUT, { recursive: true });
const h = await launchBrowser();
const ctx = await h.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route("**/*", (r) => { const u = new URL(r.request().url()); return u.hostname === "iscreamstudio.com" && r.request().method() === "GET" ? r.continue() : r.abort(); });
const p = await ctx.newPage();
await p.goto("https://iscreamstudio.com/test/scribblezap/play/", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(p);
const frames: Array<{ t: number; f: string }> = []; let i = 0;
cdp.on("Page.screencastFrame", (fr: any) => { const f = `${OUT}/f${String(i++).padStart(5, "0")}.jpg`; writeFileSync(f, Buffer.from(fr.data, "base64")); frames.push({ t: fr.metadata.timestamp, f }); cdp.send("Page.screencastFrameAck", { sessionId: fr.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 });
const log: Array<{ t: number; tag: string; txt: string }> = [];
const text = async () => ((await p.evaluate(`document.body.innerText`)) as string).replace(/\s+/g, " ");
const sample = async (tag: string) => { log.push({ t: Date.now() / 1000, tag, txt: (await text()).slice(0, 300) }); };
const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
const tapXY = async (x: number, y: number) => { await touch("touchStart", x, y); await p.waitForTimeout(60); await touch("touchEnd", x, y); };
const tapText = async (re: string) => { const b = (await p.evaluate(`(function(){var e=[...document.querySelectorAll("button,div,span")].filter(function(x){return /^${re}$/i.test((x.innerText||"").trim())&&x.getBoundingClientRect().width>0}).sort(function(a,b){return a.innerText.length-b.innerText.length})[0];if(!e)return null;var r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[] | null; if (!b) return false; await tapXY(b[0], b[1]); return true; };
const drag = async (x0: number, y0: number, x1: number, y1: number, ms: number, hold = 160) => { await touch("touchStart", x0, y0); const n = Math.round(ms / 16); for (let k = 1; k <= n; k++) { await touch("touchMove", x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n); await p.waitForTimeout(16); } await p.waitForTimeout(hold); await touch("touchEnd", x1, y1); };
const board = (await p.evaluate(`(function(){var r=document.querySelector("canvas").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`)) as number[];
const [bx, by, bw, bh] = board;
// Only text that is really on screen counts: the page keeps hidden overlays in the DOM, so plain innerText would report stale results.
const shown = async (needle: string) => (await p.evaluate(`(function(){var n=${JSON.stringify(needle)};return [...document.querySelectorAll("div,span,button")].some(function(e){if(e.childElementCount>0)return false;var b=e.getBoundingClientRect(),cs=getComputedStyle(e);return b.width>0&&b.height>0&&b.bottom>0&&cs.visibility!=="hidden"&&cs.display!=="none"&&parseFloat(cs.opacity||"1")>0.5&&(e.innerText||"").indexOf(n)>=0})})()`)) as boolean;
const state = async () => { const t = await text(); const m = /(\d+)% \/ (\d+)%/.exec(t); return { t, fill: m ? +m[1] : 0, goal: m ? +m[2] : 60, clear: (m ? +m[1] >= +m[2] : false) || (await shown("CLEAR!")), over: await shown("Out of lives"), level: Number(/LEVEL (\d+) ▲/.exec(t)?.[1] ?? 0) }; };
// a spread of cut lines (fractions of the board) so successive levels are not played identically
const lines: Array<[number, number, number, number]> = [[0, 0.4, 1, 0.4], [0.5, 0, 0.5, 0.45], [1, 0.65, 0, 0.65], [0.5, 1, 0.5, 0.55], [0, 0.2, 1, 0.2], [0, 0.8, 1, 0.8], [0.25, 0, 0.25, 1], [0.75, 1, 0.75, 0], [0, 0.55, 1, 0.55], [0.4, 0, 0.4, 1]];
const cutsFor = async (level: number, maxCuts: number) => {
  let s = await state();
  for (let c = 0; c < maxCuts && !s.clear && !s.over; c++) {
    const pl = lines[(c + level * 3) % lines.length];
    await drag(bx + 3 + pl[0] * (bw - 6), by + 3 + pl[1] * (bh - 6), bx + 3 + pl[2] * (bw - 6), by + 3 + pl[3] * (bh - 6), 480);
    await p.waitForTimeout(380); await sample(`L${level}cut${c + 1}`); s = await state();
    console.log(`level ${level} cut ${c + 1}: fill ${s.fill}/${s.goal} clear=${s.clear} over=${s.over}`);
  }
  return s;
};
console.log("tap START:", await tapText("START"));
await p.waitForTimeout(1800); await sample("start");
let played = 0;
for (let level = 1; level <= MAX_LEVELS; level++) {
  await tapXY(bx + bw / 2, by + bh / 2); await p.waitForTimeout(600); // dismiss any intro card
  await sample(`level${level}-board`);
  let s = await cutsFor(level, 14);
  if (s.over) { await p.waitForTimeout(1200); await sample(`L${level}-lost`); if (await tapText("RETRY")) { await p.waitForTimeout(1200); await tapXY(bx + bw / 2, by + bh / 2); await p.waitForTimeout(500); s = await cutsFor(level, 14); } }
  if (!s.clear) { console.log(`level ${level} not cleared; stopping`); break; }
  played = level;
  await p.waitForTimeout(2400); await sample(`L${level}-clear`);
  if (level === 6) { // the level picker, between levels
    if (await tapText("(LEVEL \d+ ▲|LEVEL \d+)")) { await p.waitForTimeout(1600); await sample("picker"); await tapText("✕"); await p.waitForTimeout(700); }
  }
  if (level === MAX_LEVELS || !(await tapText("NEXT LEVEL"))) break;
  await p.waitForTimeout(1300);
}
// home screen, then the Daily Challenge
if (await tapText("HOME")) { await p.waitForTimeout(2600); await sample("home"); }
if (await tapText("DAILY CHALLENGE")) { await p.waitForTimeout(1800); await sample("daily-start"); await tapXY(bx + bw / 2, by + bh / 2); await p.waitForTimeout(600); const s = await cutsFor(99, 12); console.log(`daily: fill ${s.fill}/${s.goal} clear=${s.clear} over=${s.over}`); await p.waitForTimeout(2000); await sample("daily-end"); }
await p.waitForTimeout(600);
await cdp.send("Page.stopScreencast");
const dur = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
console.log(`levels cleared ${played}; frames ${frames.length} over ${dur.toFixed(1)}s = ${(frames.length / dur).toFixed(1)} fps`);
writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
writeFileSync(`${OUT}/log.json`, JSON.stringify(log));
await h.close();
