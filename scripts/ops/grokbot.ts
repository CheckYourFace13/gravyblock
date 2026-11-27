// GrokBot recommendation emails (Resend, house accounts only). Nothing is ever sent for backlog: only occurrences that begin after activation.
//   status:     tsx --env-file=.env scripts/ops/grokbot.ts status                 (activation, sender, cap, recent deliveries)
//   test:       tsx --env-file=.env scripts/ops/grokbot.ts test                   (ONE clearly marked TEST email; no real recommendation)
//   activate:   tsx --env-file=.env scripts/ops/grokbot.ts activate               (from now on, new/reopened occurrences are emailed; backlog is excluded)
//   deactivate: tsx --env-file=.env scripts/ops/grokbot.ts deactivate
//   process:    tsx --env-file=.env scripts/ops/grokbot.ts process                (run the queue once, same as the worker)
import { sql } from "drizzle-orm";
import { getDb, jobs } from "../../src/lib/db";
import { getActivation, grokbotConfig, processGrokbotQueue, sendGrokbotTest } from "../../src/lib/search-intel/grokbot";
import { auditPhase, chicagoParts, nextAuditSend, sendWeeklyAudit } from "../../src/lib/search-intel/weekly-audit";

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const cmd = process.argv[2];
  const cfg = grokbotConfig();
  if (cmd === "status") {
    console.log("activated:", (await getActivation())?.toISOString() ?? "no", "| to:", cfg.to, "| from:", cfg.from, "| daily cap:", cfg.dailyCap, "| paused:", cfg.paused, "| RESEND_FROM_EMAIL (other mail):", process.env.RESEND_FROM_EMAIL);
    const rows = (await db.execute(sql`select kind, status, count(*)::int n, max(sent_at) last_sent from grokbot_deliveries group by 1, 2 order by 1, 2`)) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) console.log(" ", JSON.stringify(r));
    return;
  }
  if (cmd === "test") {
    const r = await sendGrokbotTest();
    console.log(JSON.stringify(r));
    return;
  }
  if (cmd === "activate") {
    await db.insert(jobs).values({ type: "grokbot_activation", status: "completed", payload: { to: cfg.to, from: cfg.from, dailyCap: cfg.dailyCap, note: "only occurrences beginning after this moment are emailed" } });
    console.log("activated at", (await getActivation())?.toISOString());
    return;
  }
  if (cmd === "deactivate") {
    await db.insert(jobs).values({ type: "grokbot_deactivation", status: "completed", payload: {} });
    console.log("deactivated");
    return;
  }
  if (cmd === "audit-now") {
    // one-time initial delivery: refresh every site's data now, then send this week's audit (idempotent: the scheduled 06:00 run will not repeat it)
    const r = await sendWeeklyAudit(new Date(), { freshSince: new Date(Date.now() - 5 * 60_000) });
    console.log(JSON.stringify(r, null, 1));
    return;
  }
  if (cmd === "audit-resend") {
    // Owner-authorized one-time resend of the full audit under its own batch id (keys audit:resend:<batch>:...), paced parts, refreshed data.
    // Refuses to start a second resend batch within 24 hours, so a repeated command cannot trigger another batch by accident.
    const batch = process.argv[3];
    if (!batch || !/^[a-z0-9-]{6,60}$/.test(batch)) throw new Error("usage: audit-resend <batch-id> (lowercase letters, digits, dashes)");
    const other = (await db.execute(sql`select distinct split_part(idempotency_key, ':', 3) b from grokbot_deliveries where idempotency_key like 'audit:resend:%' and created_at > now() - interval '24 hours'`)) as unknown as Array<{ b: string }>;
    if (other.some((o) => o.b !== batch)) throw new Error(`another resend batch already ran in the last 24 hours (${other.map((o) => o.b).join(", ")}); not starting a second one`);
    const { sendWeeklyAudit: send } = await import("../../src/lib/search-intel/weekly-audit");
    const started = new Date();
    for (let i = 0; i < 80; i++) {
      const r = await send(new Date(), { batch, freshSince: new Date(started.getTime() - 1000) });
      console.log(new Date().toISOString(), JSON.stringify({ sites: r.sites, parts: r.parts, sent: r.sent, alreadySent: r.alreadySent, failed: r.failed, complete: r.complete, refreshed: r.refreshed.length, results: r.results }));
      if (r.complete) break;
      await new Promise((res) => setTimeout(res, 30_000));
    }
    return;
  }
  if (cmd === "audit-dryrun") {
    // builds this week's audit from stored reports exactly as it would be sent, and prints the checks; sends and writes nothing
    const { weekEndingFor } = await import("../../src/lib/search-intel/gather");
    const { composeWeeklyAudit } = await import("../../src/lib/search-intel/weekly-audit");
    const week = weekEndingFor(new Date());
    const c = await composeWeeklyAudit(new Date(), week);
    console.log(`week ${week}: ${c.ordered.length} of ${c.houses.length} sites, ${c.parts.length} parts, all sections placed with instructions: ${c.complete}`);
    c.parts.forEach((p, n) => {
      const text = `${n === 0 ? c.summary : ""}${p.map((i) => c.blocks[i]).join("")}`;
      const urls = text.match(/https?:\/\/\S+/g) ?? [];
      console.log(`  part ${n + 1}: ${text.length} chars, ${urls.length} full URLs, sites: ${p.map((i) => c.ordered[i]!.name).join(", ")}`);
    });
    return;
  }
  if (cmd === "schedule") {
    const now = new Date();
    const next = nextAuditSend(now);
    const p = chicagoParts(next);
    console.log("now (Chicago):", JSON.stringify(chicagoParts(now)), "phase:", auditPhase(now));
    console.log("next weekly audit:", next.toISOString(), "UTC =", p.weekday, p.ymd, `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, "America/Chicago");
    const rows = (await db.execute(sql`select idempotency_key, status, resend_email_id, sent_at from grokbot_deliveries where kind = 'weekly_audit' order by created_at`)) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) console.log(" ", JSON.stringify(r));
    return;
  }
  if (cmd === "process") {
    console.log(JSON.stringify(await processGrokbotQueue()));
    return;
  }
  console.log("commands: status | test | activate | deactivate | process");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
