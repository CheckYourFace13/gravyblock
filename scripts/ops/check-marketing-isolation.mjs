#!/usr/bin/env node
// Fails (exit 1) if any Marketing Studio source imports code that can write a site, publish content, send outreach or
// drive the growth engine. House Accounts are READ-ONLY toward their websites; Studio must have no import path to a write.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src/lib/marketing-studio", "src/worker/marketing.ts", "src/app/admin/(dashboard)/marketing-studio", "src/lib/db/studio-schema.ts"];
const FORBIDDEN = [
  "@/lib/site-publish",
  "@/lib/publishing",
  "@/lib/wordpress",
  "@/lib/house",
  "@/lib/autopilot",
  "@/lib/opportunities",
  "@/lib/growth",
  "@/lib/outreach",
  "@/lib/authority",
  "@/lib/social",
  "@/lib/seo",
  "@/lib/integrations/wordpress",
  "@/lib/integrations/gbp-write",
  "@/lib/integrations/facebook",
  "@/lib/integrations/reddit",
  "@/lib/integrations/resend",
  "@/lib/integrations/openrouter",
];

function* walk(p) {
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isFile()) return yield p;
  for (const e of readdirSync(p)) yield* walk(path.join(p, e));
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      if (FORBIDDEN.some((f) => spec === f || spec.startsWith(f + "/"))) hits.push(`${file}: imports ${spec}`);
    }
  }
}
if (hits.length) {
  console.error("MARKETING STUDIO ISOLATION VIOLATION:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("marketing studio isolation: OK (no import path to site writes, publishing, outreach or the growth engine)");
