// Weekly search and competitor intelligence for the house sites (read only toward every site).
//   generate: tsx --env-file=.env scripts/ops/search-intel.ts generate [site name]   (builds and stores this week's report; Google quota use: about 10 requests per site)
//   status:   tsx --env-file=.env scripts/ops/search-intel.ts status                  (which sites have this week's report)
//   prompt:   tsx --env-file=.env scripts/ops/search-intel.ts prompt <site name>      (prints the stored development instruction)
//   email:    tsx --env-file=.env scripts/ops/search-intel.ts email                   (prints the search section of the Friday email; sends nothing)
import { listHouseAccounts } from "../../src/lib/house";
import { buildSearchSection, generateSearchIntelForSite, loadReports } from "../../src/lib/search-intel";
import { weekEndingFor } from "../../src/lib/search-intel/gather";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const name = rest.join(" ").toLowerCase();
  const houses = await listHouseAccounts();
  const week = weekEndingFor(new Date());
  if (cmd === "generate") {
    const todo = houses.filter((h) => !name || h.name.toLowerCase() === name);
    // three sites at a time: polite to Google and to competitor sites
    for (let i = 0; i < todo.length; i += 3) {
      await Promise.all(
        todo.slice(i, i + 3).map(async (h) => {
          const t0 = Date.now();
          const r = await generateSearchIntelForSite(h.id).catch((e) => ({ ok: false, reason: String(e) }));
          console.log(h.name.padEnd(16), JSON.stringify(r), `${Math.round((Date.now() - t0) / 1000)}s`);
        }),
      );
    }
    return;
  }
  if (cmd === "status") {
    const reports = await loadReports(week);
    for (const h of houses) {
      const r = reports.find((x) => x.businessId === h.id);
      console.log(h.name.padEnd(16), r ? `report ${r.createdAt} status=${r.data.status.status} w28=${r.data.w28?.cur.clicks ?? "n/a"} clicks, prompt ${r.prompt.length} chars` : "MISSING");
    }
    return;
  }
  if (cmd === "prompt") {
    const r = (await loadReports(week)).find((x) => x.name.toLowerCase() === name);
    console.log(r ? r.prompt : "no report");
    return;
  }
  if (cmd === "email") {
    console.log((await buildSearchSection()).text);
    return;
  }
  console.log("commands: generate | status | prompt | email");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
