/**
 * Hard checks for a LIVE PRODUCT TOUR, run on the finished timeline and the pictures behind it:
 *   - every spoken line is about something that is really on screen while it is said (narration describing functionality that is not visually shown fails),
 *   - every picture is a usable real page (not black, not blank, not an error page, not almost empty of text),
 *   - the viewer sees a real page, an interaction with it, a visible result, and then the call to action (the tour has real steps in every scene, and at least one typed or clicked control).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LineTime } from "../demo/rentalnoodle";
import type { Manifest, Timeline } from "../demo/types";
import { stateAt, type VisualCheck } from "./align";
import { judgePicture } from "./tour";
import { EMPTY_STATE } from "./standard";
import type { Concept } from "./types";
import { contentTokens } from "./validate";

const plainOf = (s: string) => s.replace(/\{[a-z0-9]+\}/g, "").replace(/\s+/g, " ").trim();

export async function tourChecks(i: { concept: Concept; manifest: Manifest; lineTimes: Record<string, LineTime>; timeline: Pick<Timeline, "scenes">; platesDir: string }): Promise<VisualCheck[]> {
  const { concept: c, manifest, lineTimes: lt, timeline, platesDir } = i;
  const out: VisualCheck[] = [];
  const tour = c.tour;
  if (!tour) return out;
  const nameTokens = new Set(contentTokens(`${c.productName} ${c.ctaHost.replace(/\./g, " ")}`));
  const problems: string[] = [];
  let checked = 0;

  // ---- narration only describes what is on screen while it is said ----
  tour.scenes.forEach((_, si) => {
    const plate = `x${si + 1}`;
    const lines = c.narration.filter((l) => l.sceneId === `a${si + 1}`);
    lines.forEach((l, n) => {
      const t = lt[l.id];
      // what is on screen while the line is being said: the pages shown from its start to just before its end (the screen changes as the steps happen, and the words must be seen at some point)
      const probes: number[] = [];
      for (let x = t.start + 200; x < t.end - 250; x += 350) probes.push(x);
      probes.push(t.end - 300);
      const seen = probes.map((x) => stateAt(timeline, x));
      checked++;
      if (seen.some((s) => !s || s.plate !== plate)) {
        problems.push(`line ${l.id} is spoken while no real page of its scene is on screen`);
        return;
      }
      const vis = [...new Set(seen.map((s) => `${manifest.plates[plate]?.states[s!.state]?.visible ?? ""}`))].join(" ");
      const have = new Set(contentTokens(`${vis} ${manifest.plates[plate]?.title ?? ""} ${c.headlines[`a${si + 1}`] ?? ""}`));
      const words = [...new Set(contentTokens(plainOf(l.spoken)))].filter((w) => !nameTokens.has(w));
      const missing = words.filter((w) => !have.has(w));
      const isHook = si === 0 && n === 0;
      if (words.length >= 3 && (isHook ? words.every((w) => !have.has(w)) : missing.length / words.length > 0.5)) problems.push(`line ${l.id} ("${plainOf(l.spoken).slice(0, 60)}") talks about ${missing.slice(0, 4).join(", ")} which is not visible on the screen showing at the time`);
    });
  });
  out.push({ id: "visual_alignment", ok: problems.length === 0, severity: "fail", detail: problems.length ? problems.slice(0, 4).join(" | ") : `${checked} spoken lines each match a real page that is on screen while they are said` });

  // ---- the pictures are usable real pages ----
  const frame: string[] = [];
  for (const [pid, m] of Object.entries(manifest.plates)) {
    for (const [k, s] of Object.entries(m.states)) {
      try {
        const sharp = (await import("sharp")).default;
        const st = await sharp(await readFile(path.join(platesDir, s.file))).stats();
        const ch = st.channels.slice(0, 3);
        const bad = judgePicture({ meanLuma: ch.reduce((a, x) => a + x.mean, 0) / ch.length, stdev: ch.reduce((a, x) => a + x.stdev, 0) / ch.length, textChars: (s.visible ?? "").length, status: null, title: m.title, heading: "" });
        if (bad) frame.push(`${pid}/${k}: ${bad}`);
        if (k !== "s0" && s.result && EMPTY_STATE.test(s.visible ?? "") && /not found|error|failed to load/i.test(s.visible ?? "")) frame.push(`${pid}/${k} shows an error state`);
      } catch {
        frame.push(`${pid}/${k}: the picture could not be read`);
      }
    }
  }
  out.push({ id: "payoff_framing", ok: frame.length === 0, severity: "fail", detail: frame.length ? frame.slice(0, 4).join(" | ") : "every picture is a real, readable page: not black, not blank, not an error" });

  // ---- a real page, an interaction with it, a visible result ----
  const shape: string[] = [];
  tour.scenes.forEach((s, k) => {
    if (s.steps.length < 3) shape.push(`scene ${k + 1} has only ${s.steps.length - 1} real interactions`);
  });
  const acted = tour.scenes.flatMap((s) => s.steps).filter((s) => s.do === "click" || s.do === "type" || s.do === "submit").length;
  if (acted < 1) shape.push("no control is ever clicked or typed into");
  const total = tour.scenes.reduce((a, s) => a + s.steps.length - 1, 0);
  out.push({ id: "tour_real_interaction", ok: shape.length === 0, severity: "fail", detail: shape.length ? shape.join(" | ") : `${total} real interactions on the live product (${acted} clicks or typed values), shown one after another` });
  return out;
}
