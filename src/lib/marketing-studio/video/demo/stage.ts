/**
 * The stage: one HTML page whose entire look at time t is a pure function (window.__seek(ms)). Rendering a frame is "seek, screenshot", so
 * motion is perfectly smooth and repeatable whatever the machine's speed. It shows REAL captured screens of the product and animates only
 * what a screen recording tool would: the camera, a touch cursor with taps, focus highlights, captions and transitions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CANVAS, PLATE_CSS_W, TRANSITION_MS, WIN, type Timeline } from "./types";

function fontFace(family: string, pkg: string, file: string, weight: number): string {
  const b64 = readFileSync(path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file)).toString("base64");
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

// Plain JavaScript run inside the page. No template literals or ${} in here: it is embedded in a TypeScript string.
const ENGINE = String.raw`
(function(){
var TL=window.__TL, CFG=window.__CFG, W=CFG.w, H=CFG.h, WIN=CFG.win, S=CFG.S, TR=CFG.tr; var pending=[];
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,p){return a+(b-a)*p;}
function eio(p){p=clamp(p,0,1);return p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;}
function eout(p){p=clamp(p,0,1);return 1-Math.pow(1-p,3);}
function eback(p){p=clamp(p,0,1);var c1=1.70158,c3=c1+1;return 1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2);}
function el(tag,cls,parent){var e=document.createElement(tag);if(cls)e.className=cls;if(parent)parent.appendChild(e);return e;}
function px(n){return Math.round(n*100)/100+'px';}

var stage=document.getElementById('stage');
var bg=el('div','bg',stage); var blobs=[el('div','blob b1',bg),el('div','blob b2',bg),el('div','blob b3',bg)];
var brand=el('div','brand',stage); var blogo=el('img','blogo',brand); blogo.src=TL.brand.logo; var bname=el('div','bname',brand); bname.textContent=TL.brand.name;
var prog=el('div','prog',stage); var progBar=el('div','progbar',prog);
var headBox=el('div','headbox',stage);
var capBox=el('div','capbox',stage);

var scenes=TL.scenes.map(function(sc,i){
  var o={sc:sc,i:i};
  if(sc.kind==='screen'){
    var pl=TL.plates[sc.plate];
    o.win=el('div','win',stage);
    o.cam=el('div','cam',o.win); o.cam.style.width=px(pl.w*S); o.cam.style.height=px(pl.h*S);
    o.imgs={};
    if(sc.clip){o.clipImg=el('img','plateimg',o.cam);o.clipImg.style.width=px(pl.w*S);o.clipImg.style.height=px(pl.h*S);o.clipIdx=-1;}
    Object.keys(pl.states).forEach(function(k){var im=el('img','plateimg',o.cam);im.src=pl.states[k];im.style.width=px(pl.w*S);im.style.height=px(pl.h*S);im.style.display='none';o.imgs[k]=im;});
    o.dim=el('div','dim',o.win); o.spot=el('div','spot',o.win); o.chip=el('div','chip',o.win);
    o.ripple=el('div','ripple',o.win); o.cur=el('div','cursor',o.win);
    o.pl=pl;
  } else {
    o.end=el('div','endcard',stage);
    o.eg=el('div','eglow',o.end); o.elogo=el('img','elogo',o.end); o.elogo.src=TL.brand.logo;
    o.eh=el('div','eh',o.end); o.eh.textContent=sc.end_card.headline;
    o.eb=el('div','ebtn',o.end); o.eb.textContent=sc.end_card.button;
    o.eu=el('div','eurl',o.end); o.eu.textContent=sc.end_card.url;
    if(TL.brand.attribution){o.ea=el('div','eattr',o.end); o.ea.textContent=TL.brand.attribution;}
  }
  if(sc.headline){
    o.head=el('div','head',headBox); o.headWords=sc.headline.text.split(' ').map(function(w){var s=el('span','hw',o.head);s.textContent=w+' ';return s;});
    {var hn=sc.headline.text.length; o.head.style.fontSize=(hn<=18?84:hn<=32?62:50)+'px';} /* the box is 176px tall: a two-line headline at 84px spilled into the phone window */
    if(sc.kicker){o.kick=el('div','kick',headBox);o.kick.textContent=sc.kicker;}
  }
  return o;
});

var capGroups=TL.captions.map(function(g){
  var d=el('div','capgrp',capBox); var ws=g.words.map(function(w){var s=el('span','cw',d);s.textContent=w.text+' ';return s;});
  return {g:g,d:d,ws:ws};
});

function sampleKeys(keys,t,props){
  if(!keys||!keys.length)return null;
  if(t<=keys[0].t){var r0={};props.forEach(function(p){r0[p]=keys[0][p];});return r0;}
  for(var i=0;i<keys.length-1;i++){var a=keys[i],b=keys[i+1];
    if(t<=b.t){var p=eio((t-a.t)/Math.max(1,b.t-a.t));var r={};props.forEach(function(k){r[k]=lerp(a[k],b[k],p);});r.seg=i;r.p=p;return r;}}
  var rl={};props.forEach(function(p){rl[p]=keys[keys.length-1][p];});return rl;
}

function seek(t){
  var dur=TL.durationMs;
  // background motion: always something moving
  blobs.forEach(function(b,i){var a=t/1000*(0.35+i*0.17)+i*2;b.style.transform='translate('+px(Math.sin(a)*120)+','+px(Math.cos(a*0.8)*160)+') scale('+(1+0.08*Math.sin(a*1.3))+')';});
  progBar.style.width=px(W*clamp(t/dur,0,1));

  var shownHead=null;
  scenes.forEach(function(o){
    var sc=o.sc, lt=t-sc.start, vis=t>=sc.start && t<=sc.end+8;
    if(sc.kind==='screen'){
      o.win.style.display=vis?'block':'none';
      if(vis){
        var pin=o.i===0?1:clamp(lt/TR,0,1);
        var pout=clamp((t-(sc.end-TR))/TR,0,1);
        var x=(1-eout(pin))*(W+80)-eio(pout)*(W+80);
        var sc2=0.94+0.06*eout(pin)-0.05*eio(pout);
        o.win.style.transform='translate('+px(x)+',0) scale('+sc2+') rotate('+(Math.round(((1-eout(pin))*2.2-eio(pout)*1.6)*100)/100)+'deg)';
        // state
        var cur=sc.states&&sc.states[0]?sc.states[0].state:null;
        (sc.states||[]).forEach(function(s){if(lt>=s.at)cur=s.state;});
        Object.keys(o.imgs).forEach(function(k){o.imgs[k].style.display=(k===cur)?'block':'none';});
        if(o.clipImg){var fi=clamp(Math.floor((lt+sc.clip.from)/1000*sc.clip.fps),0,sc.clip.frames.length-1);if(fi!==o.clipIdx){o.clipIdx=fi;o.clipImg.src=sc.clip.frames[fi];pending.push(o.clipImg.decode?o.clipImg.decode().catch(function(){}):Promise.resolve());}}
        // camera
        var cam=sampleKeys(sc.camera,lt,['cx','cy','zoom'])||{cx:o.pl.w/2,cy:WIN.h/S/2,zoom:1};
        var z=cam.zoom,vw=o.pl.w/z,vh=WIN.h/S/z;
        var cx=clamp(cam.cx,vw/2,o.pl.w-vw/2), cy=clamp(cam.cy,vh/2,Math.max(vh/2,o.pl.h-vh/2));
        var k=S*z, tx=WIN.w/2-cx*k, ty=WIN.h/2-cy*k;
        o.cam.style.transformOrigin='0 0';
        o.cam.style.transform='translate('+px(tx)+','+px(ty)+') scale('+z+')';
        function toWin(rx,ry){return [WIN.w/2+(rx-cx)*k, WIN.h/2+(ry-cy)*k];}
        // spotlight
        var spot=null;(sc.spots||[]).forEach(function(s){if(lt>=s.from&&lt<=s.to)spot=s;});
        if(spot){
          var a=Math.min(clamp((lt-spot.from)/200,0,1),clamp((spot.to-lt)/200,0,1));
          var p0=toWin(spot.rect[0],spot.rect[1]), pad=14;
          var rw=spot.rect[2]*k, rh=spot.rect[3]*k;
          // A highlight is only shown while its element is really in view; once the camera moves on, it leaves with it.
          var ix=Math.max(0,Math.min(p0[0]+rw,WIN.w)-Math.max(p0[0],0)), iy=Math.max(0,Math.min(p0[1]+rh,WIN.h)-Math.max(p0[1],0));
          a*=clamp(((ix*iy)/Math.max(1,rw*rh)-0.5)/0.3,0,1);
          if(a<=0.01){o.spot.style.display='none';o.dim.style.display='none';o.chip.style.display='none';spot=null;}
          else {
          o.spot.style.display='block';o.dim.style.display='block';
          o.spot.style.left=px(p0[0]-pad);o.spot.style.top=px(p0[1]-pad);o.spot.style.width=px(rw+pad*2);o.spot.style.height=px(rh+pad*2);
          o.spot.style.opacity=a;o.spot.style.borderWidth=px(6+2.5*Math.sin(lt/110));
          o.spot.style.boxShadow='0 0 0 3000px rgba(8,12,28,'+(0.36*a)+'), 0 0 '+px(30+10*Math.sin(lt/140))+' rgba(249,115,22,.8)';
          o.dim.style.display='none';
          if(spot.label){
            o.chip.style.display='block';o.chip.textContent=spot.label;
            var cw=o.chip.offsetWidth||260, ch=o.chip.offsetHeight||70;
            var cxp=clamp(p0[0]-pad,16,WIN.w-cw-16), cyp=p0[1]-pad-ch-16; if(cyp<12)cyp=p0[1]+rh+pad+16;
            cyp=clamp(cyp,12,WIN.h-ch-12);
            var pop=eback((lt-spot.from)/260);
            o.chip.style.left=px(cxp);o.chip.style.top=px(cyp);o.chip.style.opacity=a;o.chip.style.transform='scale('+(0.7+0.3*pop)+')';
          } else o.chip.style.display='none';
          }
        } else {o.spot.style.display='none';o.dim.style.display='none';o.chip.style.display='none';}
        // cursor and tap ripple
        var ck=sc.cursor||[];
        if(ck.length&&lt>=ck[0].t-250){
          var pos=sampleKeys(ck,lt,['x','y']); var wp=toWin(pos.x,pos.y);
          // slight arc on moves
          if(pos.seg!==undefined){var a2=ck[pos.seg],b2=ck[pos.seg+1];var dx=b2.x-a2.x,dy=b2.y-a2.y;var L=Math.sqrt(dx*dx+dy*dy)||1;var arc=Math.sin(Math.PI*pos.p)*Math.min(40,L*0.18);wp[0]+=(-dy/L)*arc*k*0.12;wp[1]+=(dx/L)*arc*k*0.12;}
          var hidden=false,last=ck[ck.length-1];if(lt>last.t+500&&last.hide)hidden=true;
          var press=1,ripO=0,ripS=1,ripX=wp[0],ripY=wp[1];
          ck.forEach(function(c){if(c.tap){var dt=lt-c.t;if(dt>=0&&dt<150)press=1-0.28*Math.sin(Math.PI*dt/150);if(dt>=0&&dt<600){ripO=(1-dt/600)*0.75;ripS=0.4+2.2*eout(dt/600);var tp=toWin(c.x,c.y);ripX=tp[0];ripY=tp[1];}}});
          o.cur.style.display=hidden?'none':'block';
          o.cur.style.left=px(wp[0]-34);o.cur.style.top=px(wp[1]-34);o.cur.style.transform='scale('+press+')';
          o.cur.style.opacity=clamp((lt-(ck[0].t-250))/250,0,1);
          o.ripple.style.display=ripO>0?'block':'none';o.ripple.style.left=px(ripX-60);o.ripple.style.top=px(ripY-60);o.ripple.style.opacity=ripO;o.ripple.style.transform='scale('+ripS+')';
        } else {o.cur.style.display='none';o.ripple.style.display='none';}
      }
    } else {
      var p=clamp(lt/TR,0,1);
      o.end.style.display=(t>=sc.start)?'flex':'none';
      if(t>=sc.start){
        o.end.style.opacity=eout(p);
        var q=clamp((lt-120)/700,0,1);
        o.elogo.style.transform='scale('+(0.4+0.6*eback(q))+')'; /* logo fidelity: uniform scale only, never rotation, clipping or effects */
        var q2=clamp((lt-300)/600,0,1);o.eh.style.opacity=q2;o.eh.style.transform='translateY('+px((1-eout(q2))*60)+')';
        var q3=clamp((lt-500)/600,0,1);o.eb.style.opacity=q3;o.eb.style.transform='translateY('+px((1-eout(q3))*60)+') scale('+(1+0.035*Math.sin(lt/190)*q3)+')';
        o.eu.style.opacity=clamp((lt-800)/500,0,1);
        o.eg.style.transform='scale('+(1+0.08*Math.sin(lt/400))+')';
        if(o.ea)o.ea.style.opacity=0.75*clamp((lt-1100)/500,0,1);
      }
    }
    // headline (top zone)
    if(o.head){
      var h=sc.headline, hl=t-sc.start, on=hl>=h.from&&hl<=h.to;
      o.head.style.display=on?'block':'none'; if(o.kick)o.kick.style.display=on?'block':'none';
      if(on){
        var fade=clamp((h.to-hl)/220,0,1);
        o.head.style.opacity=fade;
        o.headWords.forEach(function(w,i){var pp=eback((hl-h.from-i*85)/300);w.style.transform='translateY('+px((1-pp)*46)+') scale('+(0.6+0.4*pp)+')';w.style.opacity=clamp((hl-h.from-i*85)/120,0,1);});
        if(o.kick){o.kick.style.opacity=fade*clamp((hl-h.from)/200,0,1);}
      }
    }
  });
  // captions
  capGroups.forEach(function(c){
    var g=c.g, on=t>=g.from-40&&t<=g.to;
    c.d.style.display=on?'block':'none';
    if(on){
      var inP=eout((t-g.from)/150), outP=clamp((g.to-t)/110,0,1);
      c.d.style.opacity=Math.min(inP,outP);c.d.style.transform='translateY('+px((1-inP)*22)+') scale('+(0.94+0.06*inP)+')';
      g.words.forEach(function(w,i){var a=t>=w.from&&t<w.to;c.ws[i].className=a?'cw on':'cw';c.ws[i].style.transform=a?'scale(1.025)':'scale(1)';});
    }
  });
}
window.__seek=function(t){pending=[];seek(t);return Promise.all(pending);};
window.__ready=Promise.all([].slice.call(document.images).map(function(i){return i.decode?i.decode().catch(function(){}):Promise.resolve();})).then(function(){return document.fonts.ready;});
})();`;

export function buildStageHtml(tl: Timeline): string {
  const win = tl.win ?? WIN;
  const css = `
${fontFace("Inter", "inter", "inter-latin-400-normal.woff2", 400)}${fontFace("Inter", "inter", "inter-latin-700-normal.woff2", 700)}${fontFace("Inter", "inter", "inter-latin-800-normal.woff2", 800)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${CANVAS.w}px;height:${CANVAS.h}px;background:${tl.brand.dark};overflow:hidden;font-family:'Inter',sans-serif}
#stage{position:relative;width:${CANVAS.w}px;height:${CANVAS.h}px;overflow:hidden;background:linear-gradient(160deg,#0f172a 0%,#1e293b 55%,#111827 100%)}
.bg{position:absolute;inset:0;overflow:hidden}
.blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55}
.b1{width:760px;height:760px;left:-220px;top:-160px;background:${tl.brand.accent}}
.b2{width:640px;height:640px;right:-240px;top:760px;background:${tl.brand.palette?.blobs[0] ?? "#f59e0b"};opacity:.28}
.b3{width:700px;height:700px;left:120px;bottom:-300px;background:${tl.brand.palette?.blobs[1] ?? "#fb7185"};opacity:.25}
.brand{position:absolute;left:60px;top:48px;height:64px;display:flex;align-items:center;gap:18px;z-index:5}
.blogo{height:60px;width:auto;max-width:200px;object-fit:contain}
.bname{color:#fff;font-weight:800;font-size:38px;letter-spacing:-.01em}
.prog{position:absolute;left:0;top:0;width:${CANVAS.w}px;height:10px;background:rgba(255,255,255,.12);z-index:6}
.progbar{height:10px;width:0;background:${tl.brand.accent}}
.headbox{position:absolute;left:60px;right:60px;top:138px;height:176px;z-index:5}
.head{position:absolute;left:0;right:0;top:34px;color:#fff;font-weight:800;font-size:84px;line-height:1.02;letter-spacing:-.025em;text-shadow:0 6px 30px rgba(0,0,0,.35)}
.hw{display:inline-block;white-space:pre;will-change:transform}
.kick{position:absolute;left:0;top:0;color:${tl.brand.accent};font-weight:800;font-size:30px;letter-spacing:.16em;text-transform:uppercase}
.win{position:absolute;left:${win.x}px;top:${win.y}px;width:${win.w}px;height:${win.h}px;border-radius:${win.r}px;overflow:hidden;background:#fff;box-shadow:0 40px 100px rgba(0,0,0,.55),0 0 0 3px rgba(255,255,255,.18);z-index:3;transform-origin:50% 50%}
.cam{position:absolute;left:0;top:0}
.plateimg{position:absolute;left:0;top:0;display:block}
.spot{position:absolute;display:none;border:6px solid ${tl.brand.accent};border-radius:26px;z-index:4;pointer-events:none}
.dim{display:none}
.chip{position:absolute;display:none;z-index:6;background:${tl.brand.accent};color:#fff;font-weight:800;font-size:42px;line-height:1;padding:18px 30px;border-radius:999px;box-shadow:0 12px 30px rgba(0,0,0,.35);white-space:nowrap}
.cursor{position:absolute;display:none;width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.88);border:5px solid #0f172a;box-shadow:0 10px 26px rgba(0,0,0,.45);z-index:7}
.ripple{position:absolute;display:none;width:120px;height:120px;border-radius:50%;border:8px solid ${tl.brand.accent};background:${tl.brand.palette?.ripple ?? "rgba(249,115,22,.25)"};z-index:6}
.capbox{position:absolute;left:50px;right:50px;top:1560px;height:300px;z-index:8}
.capgrp{position:absolute;left:0;right:0;top:0;text-align:center;color:#fff;font-weight:800;font-size:76px;line-height:1.12;letter-spacing:-.015em;text-shadow:0 4px 0 rgba(0,0,0,.55),0 8px 28px rgba(0,0,0,.6);-webkit-text-stroke:2px rgba(0,0,0,.35);paint-order:stroke fill}
.cw{display:inline-block;white-space:pre;margin-right:.06em;transition:none}
.cw.on{color:${tl.brand.accent}}
.endcard{position:absolute;inset:0;z-index:9;display:none;flex-direction:column;align-items:center;justify-content:center;gap:44px;background:linear-gradient(155deg,${tl.brand.palette?.endFrom ?? "#f97316"} 0%,${tl.brand.palette?.endMid ?? "#ea580c"} 60%,${tl.brand.palette?.endTo ?? "#9a3412"} 100%)}
.eglow{position:absolute;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.32),rgba(255,255,255,0) 62%);left:-10px;top:260px}
.elogo{position:relative;width:auto;height:300px;max-width:520px;object-fit:contain}
.eattr{position:relative;color:#fff;opacity:.75;font-weight:600;font-size:30px;letter-spacing:.02em;text-align:center;padding:0 80px}
.eh{position:relative;color:#fff;font-weight:800;font-size:112px;line-height:1.02;text-align:center;letter-spacing:-.03em;padding:0 80px}
.ebtn{position:relative;background:#fff;color:${tl.brand.palette?.button ?? "#c2410c"};font-weight:800;font-size:66px;padding:34px 84px;border-radius:999px;box-shadow:0 22px 50px rgba(0,0,0,.35)}
.eurl{position:relative;color:#fff;font-weight:700;font-size:56px;letter-spacing:.01em}
`;
  const safe = JSON.stringify(tl).replace(/</g, "\\u003c");
  const cfg = JSON.stringify({ w: CANVAS.w, h: CANVAS.h, win, S: win.w / PLATE_CSS_W, tr: TRANSITION_MS });
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="stage"></div><script>window.__TL=${safe};window.__CFG=${cfg};</script><script>${ENGINE}</script></body></html>`;
}
