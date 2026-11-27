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
  if (cmd === "pilot") {
    // Builds the improved (v2) audit for one site exactly as it would be emailed, WITHOUT storing a report, changing any recommendation or sending anything.
    const { gatherSearchIntel } = await import("../../src/lib/search-intel/gather");
    const { growthOpportunities } = await import("../../src/lib/search-intel/growth");
    const { candidateImprovements } = await import("../../src/lib/search-intel/prompt");
    const { buildSiteAuditEmail } = await import("../../src/lib/search-intel/weekly-audit");
    const { fingerprintOf, shortRef } = await import("../../src/lib/search-intel/recommendation-model");
    const { loadQueue } = await import("../../src/lib/search-intel/recommendations");
    const h = houses.find((x) => x.name.toLowerCase() === name);
    if (!h) throw new Error("unknown site");
    const now = new Date();
    const intel = await gatherSearchIntel(h.id, now);
    if (!intel) throw new Error("no intel");
    const v1 = candidateImprovements(intel);
    const v2 = growthOpportunities(intel);
    const existing = await loadQueue(h.id);
    // a simulated queue: v2 items keep the status of an existing record with the same identity, otherwise they would be NEW; nothing is written
    const queue = v2.map((imp, n) => {
      const fp = fingerprintOf(h.id, imp.kind, imp.issue, imp.identityUrls);
      const ex = existing.find((e) => e.fingerprint === fp);
      return ex ? { ...ex, improvement: { ...imp, ref: ex.ref }, priority: imp.priority } : {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, businessId: h.id, fingerprint: fp, ref: shortRef(fp), kind: imp.kind, issue: imp.issue, title: imp.title, improvement: { ...imp, ref: shortRef(fp) }, priority: imp.priority,
        status: "new" as const, occurrence: 1, baseline: null, verification: null, outcome: null, firstSeenAt: now, lastSeenAt: now, lastReportWeek: intel.weekEnding, openedAt: null, inProgressAt: null, completedAt: null, verifiedAt: null, dismissedAt: null, reopenedAt: null, copiedAt: null, copyCount: 0, firstEmailedAt: null, verifiedNotifiedAt: null,
      };
    });
    const email = buildSiteAuditEmail({ report: { businessId: h.id, name: h.name, weekEnding: intel.weekEnding, createdAt: now.toISOString(), data: intel, prompt: "" }, queue, sent: new Map(), previousAuditAt: null, index: 1, total: 1, week: intel.weekEnding, now });
    console.log(`=== OLD FORMAT (v1) would have proposed ${v1.length} items: ${v1.map((i) => `${i.kind}: ${i.title}`).join(" | ")}`);
    console.log(`=== NEW FORMAT (v2): ${v2.length} candidates, ${email.text.length} characters, ${(email.text.match(/https?:\/\/\S+/g) ?? []).length} full URLs`);
    console.log(email.text);
    return;
  }
  if (cmd === "email") {
    console.log((await buildSearchSection()).text);
    return;
  }
  console.log("commands: generate | status | prompt | email");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
