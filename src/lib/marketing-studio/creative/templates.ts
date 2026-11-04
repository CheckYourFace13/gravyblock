/**
 * Deterministic HTML templates for static creatives. Same input, same output: no randomness, no model, no network.
 * Seven families x four sizes x three product-type styles. Every visible string is rendered through txt(), which tags it with
 * where it came from (a Product Truth fact id, the product name, an approved CTA, or a fixed structural label) so QA can prove
 * the creative says nothing that is not in Product Truth.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SIZES, type SizeKey, type Theme } from "./theme";

export const TEMPLATE_VERSION = "1.1.0";

export const TEMPLATE_FAMILIES = ["product_benefit", "feature_highlight", "announcement", "educational_tip", "screenshot_showcase", "comparison", "cta"] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

/** Fixed structural labels. They make no factual claim about any product. */
export const STRUCTURAL_LABELS = ["Feature", "Tip", "Compare", "Step"] as const;
/** Neutral framing patterns; {product} is replaced with the product name. */
export const NEUTRAL_PATTERNS = ["Meet {product}", "{product} at a glance", "Learn more", "How {product} plays"] as const;

export type Img = { dataUri: string; w: number; h: number; assetId: string; alt: string };

export type TextSrc = { kind: "fact"; factId: string } | { kind: "product" } | { kind: "label" } | { kind: "cta" } | { kind: "url" } | { kind: "neutral" };

export type TextBlock = { role: string; text: string; src: TextSrc; minPx: number };

export type CreativeInput = {
  family: TemplateFamily;
  size: SizeKey;
  theme: Theme;
  productName: string;
  headline: { text: string; src: TextSrc };
  subhead?: { text: string; src: TextSrc } | null;
  body?: { text: string; src: TextSrc } | null;
  badge?: { text: string; src: TextSrc } | null;
  cta?: { text: string; url: string } | null;
  steps?: Array<{ text: string; src: TextSrc }>;
  columns?: Array<{ label: { text: string; src: TextSrc }; text: { text: string; src: TextSrc } }>;
  logo?: Img | null;
  screenshot?: Img | null;
  /** Show the logo or app icon as a large hero mark. For products that have no screenshots, so the layout is a deliberate teaser, not an empty card. */
  hero?: boolean;
};

export type BuiltCreative = {
  html: string;
  textBlocks: TextBlock[];
  safe: { l: number; r: number; t: number; b: number };
  hasLogo: boolean;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---- fonts (bundled OFL fonts from npm, embedded so rendering needs no network) ---------------------------------------

const fontCache = new Map<string, string>();
function fontFace(family: string, pkg: string, file: string, weight: number): string {
  const key = `${pkg}/${file}`;
  let b64 = fontCache.get(key);
  if (!b64) {
    b64 = readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file)).toString("base64");
    fontCache.set(key, b64);
  }
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

function fontsCss(theme: Theme): string {
  const parts = [
    fontFace("Inter", "inter", "inter-latin-400-normal.woff2", 400),
    fontFace("Inter", "inter", "inter-latin-700-normal.woff2", 700),
    fontFace("Inter", "inter", "inter-latin-800-normal.woff2", 800),
  ];
  if (theme.headingFont === "Playfair Display") parts.push(fontFace("Playfair Display", "playfair-display", "playfair-display-latin-800-normal.woff2", 800));
  if (theme.headingFont === "Fredoka") parts.push(fontFace("Fredoka", "fredoka", "fredoka-latin-700-normal.woff2", 700));
  return parts.join("");
}

// ---- layout numbers per size ---------------------------------------------------------------------------------------------

type Metrics = { w: number; h: number; padTop: number; padBottom: number; padX: number; gap: number; head: [number, number, number]; sub: [number, number, number]; logoH: number; ctaPx: number; mediaMin: number };

function metrics(size: SizeKey): Metrics {
  const { w, h } = SIZES[size];
  switch (size) {
    case "story":
      // Extra top and bottom room for the platform interface that overlays stories and reels.
      return { w, h, padTop: 230, padBottom: 270, padX: 84, gap: 30, head: [118, 46, 470], sub: [42, 34, 250], logoH: 84, ctaPx: 40, mediaMin: 420 };
    case "portrait":
      return { w, h, padTop: 72, padBottom: 76, padX: 80, gap: 26, head: [100, 44, 400], sub: [38, 30, 230], logoH: 72, ctaPx: 36, mediaMin: 300 };
    case "landscape":
      return { w, h, padTop: 44, padBottom: 44, padX: 60, gap: 16, head: [58, 32, 190], sub: [28, 26, 110], logoH: 48, ctaPx: 26, mediaMin: 200 };
    default:
      return { w, h, padTop: 72, padBottom: 72, padX: 76, gap: 24, head: [92, 42, 330], sub: [36, 30, 200], logoH: 66, ctaPx: 34, mediaMin: 280 };
  }
}

const FIT_AND_MEASURE = `
(function(){
  function fit(){
    document.querySelectorAll('[data-fit]').forEach(function(el){
      var max=+el.dataset.max,min=+el.dataset.min,fs=max;
      el.style.fontSize=fs+'px';
      while((el.scrollHeight>el.clientHeight+Math.ceil(fs*0.2)||el.scrollWidth>el.clientWidth+4)&&fs>min){fs-=2;el.style.fontSize=fs+'px';}
      el.dataset.fs=String(fs);
    });
    budget();
  }
  // Column layouts: if the stacked content is taller than the space it has, shrink the largest text a step at a time so nothing spills over
  // the logo, the screenshot or the call to action. Text can only shrink down to its readable minimum; QA fails the creative beyond that.
  function budget(){
    var main=document.querySelector('.main');
    if(!main||getComputedStyle(main).flexDirection!=='column')return;
    var gap=parseFloat(getComputedStyle(main).rowGap)||0;
    function need(){var s=0,k=main.children;for(var i=0;i<k.length;i++)s+=k[i].getBoundingClientRect().height;return s+gap*Math.max(0,k.length-1);}
    var guard=0;
    while(need()>main.clientHeight+1&&guard++<300){
      var cand=Array.prototype.slice.call(main.querySelectorAll('[data-fit]')).filter(function(e){return ['headline','subhead','body','step','column'].indexOf(e.dataset.role)>=0&&parseFloat(e.style.fontSize)>+e.dataset.min;});
      if(!cand.length)break;
      cand.sort(function(a,b){return parseFloat(b.style.fontSize)-parseFloat(a.style.fontSize);});
      var fs=parseFloat(cand[0].style.fontSize)-2;cand[0].style.fontSize=fs+'px';cand[0].dataset.fs=String(fs);
    }
  }
  window.__fit=fit;
  window.__measure=function(){
    var c=document.querySelector('.canvas').getBoundingClientRect();
    return {
      canvas:{w:c.width,h:c.height},
      texts:Array.prototype.map.call(document.querySelectorAll('[data-fit]'),function(el){
        var r=document.createRange();r.selectNodeContents(el);var t=r.getBoundingClientRect();
        return {idx:+el.dataset.idx,role:el.dataset.role,text:el.textContent,fs:parseFloat(getComputedStyle(el).fontSize),min:+el.dataset.min,
          overflow:el.scrollHeight>el.clientHeight+Math.ceil(parseFloat(getComputedStyle(el).fontSize)*0.2)||el.scrollWidth>el.clientWidth+4,rect:{x:t.x,y:t.y,w:t.width,h:t.height}};
      }),
      frames:Array.prototype.map.call(document.querySelectorAll('.frame'),function(f){var r=f.getBoundingClientRect();return {rect:{x:r.x,y:r.y,w:r.width,h:r.height}};}),
      images:Array.prototype.map.call(document.querySelectorAll('img[data-asset]'),function(i){
        var r=i.getBoundingClientRect();
        return {asset:i.dataset.asset,role:i.dataset.role,rect:{x:r.x,y:r.y,w:r.width,h:r.height},natural:{w:i.naturalWidth,h:i.naturalHeight},ok:i.complete&&i.naturalWidth>0};
      })
    };
  };
  window.addEventListener('load',function(){document.fonts.ready.then(fit);});
})();`;

function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function buildCreative(input: CreativeInput): BuiltCreative {
  const m = metrics(input.size);
  const t = input.theme;
  const landscape = input.size === "landscape";
  const blocks: TextBlock[] = [];

  function txt(role: "headline" | "subhead" | "body" | "label" | "badge" | "cta" | "url" | "product" | "step" | "column", text: string, src: TextSrc, o: { max: number; min: number; boxH: number; cls?: string }): string {
    const idx = blocks.length;
    blocks.push({ role, text, src, minPx: o.min });
    return `<div class="fit ${o.cls ?? ""}" data-fit data-idx="${idx}" data-role="${role}" data-max="${o.max}" data-min="${o.min}" style="max-height:${o.boxH}px">${esc(text)}</div>`;
  }

  const logo = input.logo
    ? `<img data-asset="${esc(input.logo.assetId)}" data-role="logo" class="logo" alt="${esc(input.logo.alt)}" src="${input.logo.dataUri}" style="height:${m.logoH}px;width:auto">`
    : "";
  const hasShot = Boolean(input.screenshot) && (input.family === "screenshot_showcase" || input.family === "feature_highlight" || input.family === "product_benefit");
  const frame = hasShot
    ? `<div class="frame ${t.layout}"><div class="chrome"><i></i><i></i><i></i></div><img data-asset="${esc(input.screenshot!.assetId)}" data-role="screenshot" alt="${esc(input.screenshot!.alt)}" src="${input.screenshot!.dataUri}"></div>`
    : "";

  const heroOn = Boolean(input.hero && input.logo && !hasShot);
  const heroH = { story: 360, portrait: 300, square: 250, landscape: 220 }[input.size];
  const hero = heroOn ? `<img data-asset="${esc(input.logo!.assetId)}" data-role="logo" class="hero" alt="${esc(input.logo!.alt)}" src="${input.logo!.dataUri}" style="height:${heroH}px;width:auto">` : "";

  const headMax = input.family === "cta" ? m.head[0] + 8 : m.head[0];
  const headline = txt("headline", input.headline.text, input.headline.src, { max: headMax, min: m.head[1], boxH: m.head[2], cls: "headline" });
  // The landscape link-card showcase gives the screenshot the space; its supporting line stays in the caption instead of overflowing the card.
  const dropSubhead = input.family === "screenshot_showcase" && landscape;
  const subhead = input.subhead && !dropSubhead ? txt("subhead", input.subhead.text, input.subhead.src, { max: m.sub[0], min: m.sub[1], boxH: m.sub[2], cls: "subhead" }) : "";
  const body = input.body ? txt("body", input.body.text, input.body.src, { max: m.sub[0], min: m.sub[1], boxH: m.sub[2], cls: "subhead" }) : "";
  const labelFor = (text: string) => txt("label", text, { kind: "label" }, { max: 32, min: 26, boxH: 46, cls: "kicker" });
  const badge = input.badge ? txt("badge", input.badge.text, input.badge.src, { max: landscape ? 30 : 38, min: landscape ? 26 : 28, boxH: landscape ? 56 : 70, cls: "badge" }) : "";
  const productLabel = txt("product", input.productName, { kind: "product" }, { max: landscape ? 28 : 36, min: 26, boxH: landscape ? 44 : 56, cls: "pname" });

  const ctaBtn = input.cta
    ? `<div class="cta">${txt("cta", input.cta.text, { kind: "cta" }, { max: m.ctaPx, min: landscape ? 26 : 28, boxH: m.ctaPx * 2 + 20, cls: "btn" })}${txt("url", hostPath(input.cta.url), { kind: "url" }, { max: landscape ? 28 : 30, min: landscape ? 26 : 28, boxH: 46, cls: "urlLabel" })}</div>`
    : "";

  let main = "";
  const stepsHtml = (input.steps ?? [])
    .map((s, i) => `<li><span class="num">${i + 1}</span>${txt("step", s.text, s.src, { max: m.sub[0] + 10, min: m.sub[1], boxH: Math.round(m.sub[2] * 0.9), cls: "step" })}</li>`)
    .join("");
  const colsHtml = (input.columns ?? [])
    .map((c) => `<div class="card">${txt("label", c.label.text, c.label.src, { max: landscape ? 30 : 40, min: landscape ? 26 : 28, boxH: landscape ? 80 : 120, cls: "colLabel" })}${txt("column", c.text.text, c.text.src, { max: landscape ? 30 : 36, min: landscape ? 26 : 28, boxH: landscape ? 140 : 300, cls: "colText" })}</div>`)
    .join("");

  switch (input.family) {
    case "product_benefit":
      main = `${hasShot ? frame : ""}${headline}${subhead}`;
      break;
    case "feature_highlight":
      main = `${labelFor("Feature")}${headline}${body}${hasShot ? frame : ""}`;
      break;
    case "announcement":
      main = `${badge}${headline}${subhead}`;
      break;
    case "educational_tip":
      main = `${labelFor("Tip")}${headline}<ol class="steps">${stepsHtml}</ol>`;
      break;
    case "screenshot_showcase":
      main = `${frame}${headline}${subhead}`;
      break;
    case "comparison":
      main = landscape
        ? `<div style="flex:0 0 36%;display:flex;flex-direction:column;gap:${m.gap}px;min-width:0">${labelFor("Compare")}${headline}</div><div class="cols">${colsHtml}</div>`
        : `${labelFor("Compare")}${headline}<div class="cols">${colsHtml}</div>`;
      break;
    default:
      main = `${headline}${subhead}`;
  }

  if (hero) main = landscape ? `${hero}<div style="flex:1 1 0;display:flex;flex-direction:column;gap:${m.gap}px;min-width:0;justify-content:center">${main}</div>` : `${hero}${main}`;
  const row = landscape && (hasShot || input.family === "comparison" || heroOn);
  const css = `
${fontsCss(t)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${m.w}px;height:${m.h}px;background:${t.bg1}}
.canvas{position:relative;width:${m.w}px;height:${m.h}px;overflow:hidden;display:flex;flex-direction:column;gap:${m.gap}px;padding:${m.padTop}px ${m.padX}px ${m.padBottom}px;
  background:linear-gradient(135deg,${t.bg1},${t.bg2});color:${t.fg};font-family:'Inter',sans-serif}
.top{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:${m.logoH}px;flex:0 0 auto}
.logo{display:block;object-fit:contain}
.hero{display:block;flex:0 0 auto;object-fit:contain;border-radius:22%;align-self:${input.family === "cta" ? "center" : "flex-start"};box-shadow:0 0 0 6px rgba(255,255,255,.14),0 24px 60px rgba(0,0,0,.45),0 0 90px ${t.accent}66}
.pname{font-weight:700;color:${t.muted};flex:1 1 0;min-width:0;text-align:right;white-space:nowrap}
.main{position:relative;z-index:2;flex:1 1 0;min-height:0;display:flex;flex-direction:${row ? "row" : "column"};justify-content:center;gap:${m.gap}px;${input.family === "cta" ? "align-items:center;text-align:center;" : ""}${row ? "align-items:center;" : ""}}
.main>*{min-width:0}
.foot{position:relative;z-index:2;flex:0 0 auto}
.fit{flex:0 0 auto;overflow:hidden;overflow-wrap:break-word;line-height:1.14}
.headline{font-family:'${t.headingFont}',serif;font-weight:${t.headingWeight};color:${t.fg};letter-spacing:${t.layout === "editorial" ? "-0.01em" : "-0.02em"}}
.subhead{color:${t.muted};font-weight:400;line-height:1.3}
.kicker{font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${t.accentText}}
.badge{display:inline-block;align-self:flex-start;padding:10px 28px;border-radius:999px;background:${t.accent};color:${t.accentFg};font-weight:800;${t.layout === "playful" ? "transform:rotate(-3deg);" : ""}${input.family === "cta" ? "align-self:center;" : ""}}
.cta{display:flex;align-items:center;gap:${landscape ? 22 : 30}px;flex-wrap:wrap;${input.family === "cta" ? "justify-content:center;" : ""}}
.btn{display:inline-block;padding:${landscape ? "12px 28px" : "20px 44px"};background:${t.accent};color:${t.accentFg};font-weight:800;border-radius:${t.layout === "editorial" ? "6px" : "999px"};${t.layout === "playful" ? `box-shadow:0 8px 0 rgba(0,0,0,.28);` : t.layout === "clean" ? "box-shadow:0 8px 24px rgba(15,23,42,.18);" : ""}white-space:normal;max-width:${m.w - m.padX * 2}px}
.urlLabel{color:${t.muted};font-weight:700}
.frame{flex:1 1 0;min-height:${m.mediaMin}px;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:${t.card};border-radius:${t.layout === "editorial" ? "10px" : "24px"};
  box-shadow:${t.layout === "playful" ? "0 10px 0 rgba(0,0,0,.3)" : "0 18px 50px rgba(15,23,42,.22)"};border:${t.layout === "editorial" ? "2px solid " + t.fg : "0"}}
.frame .chrome{flex:0 0 38px;display:flex;align-items:center;gap:8px;padding:0 16px;background:rgba(0,0,0,.07)}
.frame .chrome i{width:12px;height:12px;border-radius:50%;background:rgba(0,0,0,.25);display:block}
.frame img{flex:1 1 0;min-height:0;width:100%;object-fit:cover;object-position:top;display:block}
.steps{list-style:none;display:flex;flex-direction:column;gap:${landscape ? 10 : 18}px}
.steps li{display:flex;align-items:flex-start;gap:20px}
.steps .num{flex:0 0 ${landscape ? 40 : 56}px;height:${landscape ? 40 : 56}px;border-radius:50%;background:${t.accent};color:${t.accentFg};font-weight:800;font-size:${landscape ? 22 : 30}px;display:flex;align-items:center;justify-content:center}
.step{flex:1 1 0;min-width:0;color:${t.fg}}
.cols{display:flex;gap:${m.gap}px;flex:1 1 0;min-height:0;${landscape ? "" : "flex-direction:column;"}}
.card{flex:1 1 0;min-width:0;background:${t.card};color:${t.cardFg};border-radius:${t.layout === "editorial" ? "8px" : "22px"};padding:${landscape ? "20px 24px" : "32px 36px"};display:flex;flex-direction:column;gap:12px;box-shadow:${t.layout === "playful" ? "0 8px 0 rgba(0,0,0,.28)" : "0 10px 30px rgba(15,23,42,.14)"};${t.layout === "editorial" ? "border:2px solid " + t.fg : ""}}
.colLabel{font-weight:800;color:${t.cardFg}}
.colText{color:${t.cardFg};font-weight:400}
.deco{position:absolute;z-index:1;pointer-events:none}
${t.layout === "playful" ? `.d1{width:${Math.round(m.w * 0.62)}px;height:${Math.round(m.w * 0.62)}px;border-radius:50%;background:${t.accent};opacity:.18;right:-${Math.round(m.w * 0.2)}px;top:-${Math.round(m.w * 0.18)}px}.d2{width:${Math.round(m.w * 0.4)}px;height:${Math.round(m.w * 0.4)}px;border-radius:50%;background:#ffffff;opacity:.07;left:-${Math.round(m.w * 0.12)}px;bottom:${Math.round(m.padBottom * 0.2)}px}` : ""}
${t.layout === "clean" ? `.d1{left:0;top:0;bottom:0;width:14px;background:${t.accent}}.d2{right:-${Math.round(m.w * 0.15)}px;top:-${Math.round(m.w * 0.15)}px;width:${Math.round(m.w * 0.5)}px;height:${Math.round(m.w * 0.5)}px;border-radius:50%;background:${t.accent};opacity:.1}` : ""}
${t.layout === "editorial" ? `.d1{left:${m.padX}px;right:${m.padX}px;top:${Math.max(24, m.padTop - 28)}px;height:3px;background:${t.fg}}.d2{left:${m.padX}px;right:${m.padX}px;bottom:${Math.max(22, m.padBottom - 30)}px;height:1px;background:${t.fg};opacity:.5}` : ""}
`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>${css}</style></head><body>
<div class="canvas" data-size="${input.size}" data-family="${input.family}" data-layout="${t.layout}">
<div class="deco d1"></div><div class="deco d2"></div>
<div class="top">${heroOn ? productLabel : logo || productLabel}${!heroOn && logo ? productLabel : ""}</div>
<div class="main">${row && hasShot ? `<div style="flex:1 1 0;display:flex;flex-direction:column;gap:${m.gap}px;min-width:0">${main.replace(frame, "")}</div>${frame}` : main}</div>
<div class="foot">${ctaBtn}</div>
</div><script>${FIT_AND_MEASURE}</script></body></html>`;

  return {
    html,
    textBlocks: blocks,
    safe: { l: Math.round(m.padX * 0.75), r: m.w - Math.round(m.padX * 0.75), t: Math.round(m.padTop * 0.75), b: m.h - Math.round(m.padBottom * 0.75) },
    hasLogo: Boolean(input.logo),
  };
}
