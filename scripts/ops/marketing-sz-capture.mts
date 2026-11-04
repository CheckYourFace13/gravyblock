// The ScribbleZap gameplay capture: scripted touch input played in the private web tester inside a disposable browser profile. GET only to iscreamstudio.com,
// nothing is saved or changed, no code is touched, nothing is deployed. Frames come from a CDP screencast (about 50 fps while the game moves).
// Run on the VPS (as the Studio user); output goes to STUDIO_GAME_CAPTURE_OUT. See docs/marketing-studio/ROLLOUT-AND-PAID-ROADMAP.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser } from "../../src/lib/marketing-studio/creative/render";
const OUT = process.env.STUDIO_GAME_CAPTURE_OUT ?? "/tmp/szcap"; mkdirSync(OUT, { recursive: true });
const h = await launchBrowser();
const ctx = await h.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route("**/*", (r) => { const u = new URL(r.request().url()); return u.hostname === "iscreamstudio.com" && r.request().method() === "GET" ? r.continue() : r.abort(); });
const p = await ctx.newPage();
await p.goto("https://iscreamstudio.com/test/scribblezap/play/", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(p);
const frames: Array<{ t: number; f: string }> = []; let i = 0;
cdp.on("Page.screencastFrame", (fr: any) => { const f = `${OUT}/f${String(i++).padStart(5, "0")}.jpg`; writeFileSync(f, Buffer.from(fr.data, "base64")); frames.push({ t: fr.metadata.timestamp, f }); cdp.send("Page.screencastFrameAck", { sessionId: fr.sessionId }).catch(() => {}); });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
const log: Array<{ t: number; txt: string }> = [];
const sample = async () => { log.push({ t: Date.now() / 1000, txt: ((await p.evaluate(`document.body.innerText`)) as string).replace(/\s+/g, " ").slice(0, 260) }); };
const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
const tapXY = async (x: number, y: number) => { await touch("touchStart", x, y); await p.waitForTimeout(60); await touch("touchEnd", x, y); };
const tapText = async (re: string) => { const b = (await p.evaluate(`(function(){var e=[...document.querySelectorAll("button,div,span")].filter(function(x){return /^${re}$/i.test((x.innerText||"").trim())&&x.getBoundingClientRect().width>0}).sort(function(a,b){return a.innerText.length-b.innerText.length})[0];if(!e)return null;var r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`)) as number[] | null; if (!b) return false; await tapXY(b[0], b[1]); return true; };
const drag = async (x0: number, y0: number, x1: number, y1: number, ms: number, hold = 250) => { await touch("touchStart", x0, y0); const n = Math.round(ms / 16); for (let k = 1; k <= n; k++) { await touch("touchMove", x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n); await p.waitForTimeout(16); } await p.waitForTimeout(hold); await touch("touchEnd", x1, y1); };
const board = (await p.evaluate(`(function(){var r=document.querySelector("canvas").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`)) as number[];
const [bx, by, bw, bh] = board;
const state = async () => { const t = ((await p.evaluate(`document.body.innerText`)) as string).replace(/\s+/g, " "); const m = /(\d+)% \/ (\d+)%/.exec(t); return { t, fill: m ? +m[1] : 0, goal: m ? +m[2] : 60, clear: /CLEAR!/.test(t), over: /GAME OVER|OUT OF HEARTS|TRY AGAIN/i.test(t) }; };
console.log("tap START:", await tapText("START"));
await p.waitForTimeout(1800); await sample();
const plans = [
  [0.0, 0.40, 1.0, 0.40], [0.5, 0.0, 0.5, 0.45], [1.0, 0.65, 0.0, 0.65], [0.5, 1.0, 0.5, 0.55], [0.0, 0.2, 1.0, 0.2], [0.0, 0.8, 1.0, 0.8],
];
for (let level = 1; level <= 3; level++) {
  await tapXY(bx + bw / 2, by + bh / 2); // dismiss any intro card
  await p.waitForTimeout(700);
  let s = await state();
  for (let c = 0; c < plans.length * 2 - (level === 3 ? 4 : 0) && !s.clear && !s.over; c++) {
    const pl = plans[c % plans.length];
    const jitter = (c >= plans.length ? 0.07 : 0);
    await drag(bx + 3 + pl[0] * (bw - 6), by + 3 + (pl[1] + jitter) * (bh - 6), bx + 3 + pl[2] * (bw - 6), by + 3 + (pl[3] + jitter) * (bh - 6), 480, 160);
    await p.waitForTimeout(380); await sample(); s = await state();
    console.log(`level ${level} cut ${c + 1}: fill ${s.fill}/${s.goal} clear=${s.clear} over=${s.over}`);
  }
  await p.waitForTimeout(2200); await sample();
  if (!(await tapText("NEXT LEVEL"))) { console.log("no NEXT LEVEL button; stop"); break; }
  await p.waitForTimeout(1500);
}
await p.waitForTimeout(800);
await cdp.send("Page.stopScreencast");
const dur = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
console.log(`frames ${frames.length} over ${dur.toFixed(1)}s = ${(frames.length / dur).toFixed(1)} fps`);
writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
writeFileSync(`${OUT}/log.json`, JSON.stringify(log));
await h.close();
