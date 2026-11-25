// GrokBot recommendation emails (Resend, house accounts only). Nothing is ever sent for backlog: only occurrences that begin after activation.
//   status:     tsx --env-file=.env scripts/ops/grokbot.ts status                 (activation, sender, cap, recent deliveries)
//   test:       tsx --env-file=.env scripts/ops/grokbot.ts test                   (ONE clearly marked TEST email; no real recommendation)
//   activate:   tsx --env-file=.env scripts/ops/grokbot.ts activate               (from now on, new/reopened occurrences are emailed; backlog is excluded)
//   deactivate: tsx --env-file=.env scripts/ops/grokbot.ts deactivate
//   process:    tsx --env-file=.env scripts/ops/grokbot.ts process                (run the queue once, same as the worker)
import { sql } from "drizzle-orm";
import { getDb, jobs } from "../../src/lib/db";
import { getActivation, grokbotConfig, processGrokbotQueue, sendGrokbotTest } from "../../src/lib/search-intel/grokbot";

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
  if (cmd === "process") {
    console.log(JSON.stringify(await processGrokbotQueue()));
    return;
  }
  console.log("commands: status | test | activate | deactivate | process");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
