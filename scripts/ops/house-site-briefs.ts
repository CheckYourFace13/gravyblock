// Read-only: turns the on-site findings GravyBlock cannot apply to house sites (they are read-only) into one brief per site for that site's own agent.
//   tsx --env-file=/home/deploy/gravyblock/.env scripts/ops/house-site-briefs.ts [--out <dir>]
// Without --out it prints the briefs. With --out it writes <dir>/<site>.md. It never writes to a site.
import fs from "node:fs";
import path from "node:path";
import { buildHouseSiteBriefs, renderHouseBrief } from "../../src/lib/house/site-briefs";

const i = process.argv.indexOf("--out");
const out = i > -1 ? process.argv[i + 1] : null;
buildHouseSiteBriefs()
  .then((briefs) => {
    if (out) fs.mkdirSync(out, { recursive: true });
    for (const b of briefs) {
      const text = renderHouseBrief(b);
      if (out) fs.writeFileSync(path.join(out, `${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`), text);
      else console.log(text + "\n");
    }
    console.log(`${briefs.length} site brief(s)${out ? ` written to ${out}` : ""}: ${briefs.map((b) => `${b.name} ${b.total}`).join(", ")}`);
  })
  .catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 200));
