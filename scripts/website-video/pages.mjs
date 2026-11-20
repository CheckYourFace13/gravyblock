/**
 * Purpose-made full-screen pages the videos open next to the real site: an illustration of the problem, a stage for a real Marketing Studio video, and the end card. Anything shown as
 * product is the real site; these pages are only ever labelled as an illustration or built from real assets.
 */
const FONT = `font-family:'Segoe UI',system-ui,sans-serif;`;
const BASE = `*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{${FONT}color:#18181b}`;

/** "A typical SEO tool": a score and a growing pile of tasks. Clearly an illustration, with no product claim in it. */
export const problemPage = () => `<!doctype html><meta charset=utf-8><title>illustration</title><style>${BASE}
body{background:#f4f4f5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.tag{font-size:22px;letter-spacing:.28em;text-transform:uppercase;color:#a1a1aa;font-weight:700}
.row{display:flex;gap:44px;align-items:flex-start}
.card{background:#fff;border-radius:26px;box-shadow:0 18px 50px rgba(0,0,0,.10);padding:38px 46px;width:760px;height:600px;overflow:hidden}
h3{margin:0 0 22px;font-size:34px}
.score{display:flex;align-items:baseline;gap:14px;margin-bottom:22px}.score b{font-size:110px;line-height:1;color:#d97706}.score span{font-size:34px;color:#71717a}
.it{display:flex;gap:16px;align-items:center;font-size:29px;padding:11px 0;border-bottom:1px solid #f0f0f2;opacity:0;transform:translateY(14px);animation:in .45s ease forwards}
.dot{width:16px;height:16px;border-radius:50%;background:#dc2626;flex:none}
.box{width:26px;height:26px;border:3px solid #a1a1aa;border-radius:7px;flex:none}
@keyframes in{to{opacity:1;transform:none}}
.count{font-size:34px;font-weight:800;color:#dc2626;margin-left:auto}
.now{position:absolute;left:0;right:0;bottom:84px;text-align:center;font-size:84px;font-weight:900;letter-spacing:-.02em;opacity:0;animation:in .6s ease forwards;animation-delay:3.9s}
</style>
<div class=tag>Illustration: a typical SEO tool</div>
<div class=row>
 <div class=card><h3>SEO report</h3><div class=score><b>54</b><span>/ 100</span></div>
  ${["Meta descriptions missing on 14 pages", "Page speed needs work", "Few quality backlinks", "Thin content on service pages", "No structured data found", "Duplicate page titles"].map((t, i) => `<div class=it style="animation-delay:${0.5 + i * 0.4}s"><i class=dot></i>${t}</div>`).join("")}
 </div>
 <div class=card><h3>Your to-do list <span class=count>27 tasks</span></h3>
  ${["Rewrite meta descriptions", "Compress images", "Build backlinks", "Write 4 new service pages", "Add schema markup", "Fix duplicate titles", "Update listings", "Ask for reviews"].map((t, i) => `<div class=it style="animation-delay:${0.9 + i * 0.35}s"><i class=box></i>${t}</div>`).join("")}
 </div>
</div>
<div class=now>Now it is all on you.</div>`;

/** A real Marketing Studio video, in a phone frame, beside a short label. */
export const studioPage = () => `<!doctype html><meta charset=utf-8><title>studio</title><style>${BASE}
body{background:linear-gradient(135deg,#18181b,#27272a 55%,#3f1d1d);color:#fff;display:flex;align-items:center;justify-content:center;gap:110px}
.phone{width:506px;height:900px;border-radius:44px;border:10px solid #3f3f46;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6);background:#000;opacity:0;transform:translateY(30px) scale(.97);animation:in .7s ease .1s forwards}
video{width:100%;height:100%;object-fit:cover;display:block}
.t{max-width:700px;opacity:0;transform:translateX(30px);animation:in2 .7s ease .5s forwards}
.k{font-size:24px;letter-spacing:.28em;text-transform:uppercase;color:#f87171;font-weight:800}
h1{font-size:78px;line-height:1.05;margin:20px 0 26px;letter-spacing:-.02em}
p{font-size:34px;line-height:1.35;color:#d4d4d8;margin:0}
@keyframes in{to{opacity:1;transform:none}}@keyframes in2{to{opacity:1;transform:none}}
</style>
<div class=phone><video src="/__v/studio.mp4" autoplay muted loop playsinline></video></div>
<div class=t><div class=k>Marketing Studio</div><h1>A real video, made from a real website.</h1><p>Created automatically from gravyblock.com. Customers get the same for their own site.</p></div>`;

/** The closing card: the offer exactly as the site states it. */
export const endPage = () => `<!doctype html><meta charset=utf-8><title>start</title><style>${BASE}
body{background:radial-gradient(circle at 50% 38%,#fff,#fdeaea 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center}
.a{opacity:0;transform:translateY(24px);animation:in .7s ease forwards}
img{height:130px}
h1{font-size:104px;margin:0;letter-spacing:-.03em;line-height:1}
.btn{background:#d90000;color:#fff;font-size:46px;font-weight:800;padding:26px 62px;border-radius:999px;box-shadow:0 18px 40px rgba(217,0,0,.35)}
.offer{font-size:44px;font-weight:700;color:#18181b}
.fine{font-size:29px;color:#52525b;max-width:1300px;line-height:1.35}
.url{font-size:38px;font-weight:800;color:#d90000;letter-spacing:.02em}
@keyframes in{to{opacity:1;transform:none}}
</style>
<img class=a src="https://gravyblock.com/brand/logo.png" style="animation-delay:.05s">
<h1 class=a style="animation-delay:.25s">Start with the free scan.</h1>
<div class="btn a" style="animation-delay:.6s">Scan my business free</div>
<div class="offer a" style="animation-delay:1.0s">14-day free trial, then $29.99/month or $299/year</div>
<div class="fine a" style="animation-delay:1.3s">Free scan, no credit card. Cancel anytime. 30-day money-back guarantee after your first payment.</div>
<div class="url a" style="animation-delay:1.6s">gravyblock.com/scan</div>`;
