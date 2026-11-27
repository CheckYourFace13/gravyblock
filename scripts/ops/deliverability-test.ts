// Controlled deliverability test. Sends ONLY to authorized addresses: the GrokBot address (one TEST message) and GravyBlock's own inbound test address on
// reply.gravyblock.com, where Resend's receiving API shows the receiver's SPF/DKIM/DMARC verdicts and every header of the real message.
//   tsx --env-file=.env scripts/ops/deliverability-test.ts send     (sends the messages, prints Resend ids)
//   tsx --env-file=.env scripts/ops/deliverability-test.ts inspect  (reads what our inbound received: authentication results, spam verdict, key headers)
import { sql } from "drizzle-orm";
import { getDb } from "../../src/lib/db";
import { sendGrokbotTest, sendViaResend, type SendFn } from "../../src/lib/search-intel/grokbot";
import { listUnsubscribeHeaders } from "../../src/lib/email/optout";
import { CUSTOMER_FROM } from "../../src/lib/email/identity";

const INBOUND = "deliverability-test@reply.gravyblock.com";

async function main() {
  const cmd = process.argv[2];
  const key = process.env.RESEND_API_KEY!;
  if (cmd === "send") {
    // 1) the real GrokBot recommendation format, as a marked TEST, to GrokBot and to our own inbound
    console.log("grokbot TEST ->", JSON.stringify(await sendGrokbotTest()));
    const toInbound: SendFn = (m) => sendViaResend({ ...m, to: INBOUND, idempotencyKey: `${m.idempotencyKey}:inbound` });
    console.log("grokbot TEST copy -> inbound", JSON.stringify(await sendGrokbotTest(new Date(), toInbound)));
    // 2) a marketing-class message with the new one-click unsubscribe headers, to our own inbound only
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: CUSTOMER_FROM, to: [INBOUND], subject: "TEST: marketing-format headers check", text: "TEST message to GravyBlock's own inbound address. Checks one-click unsubscribe headers.", html: "<p>TEST message to GravyBlock's own inbound address. Checks one-click unsubscribe headers.</p>", headers: listUnsubscribeHeaders(INBOUND) }),
    });
    console.log("marketing-format TEST -> inbound", res.status, await res.text());
    return;
  }
  if (cmd === "inspect") {
    const list = (await (await fetch("https://api.resend.com/emails/receiving?limit=10", { headers: { Authorization: `Bearer ${key}` } })).json()) as { data?: Array<{ id: string; to: string[]; subject: string; created_at: string }> };
    for (const m of (list.data ?? []).filter((x) => x.to.includes(INBOUND)).slice(0, 4)) {
      const full = (await (await fetch(`https://api.resend.com/emails/receiving/${m.id}`, { headers: { Authorization: `Bearer ${key}` } })).json()) as { headers?: Record<string, unknown>; text?: string; html?: string };
      const h = full.headers ?? {};
      console.log(`\n== ${m.created_at} ${m.subject}`);
      console.log("  authentication-results:", String(h["authentication-results"] ?? "").replace(/\s+/g, " "));
      console.log("  ses spam verdict:", h["x-ses-spam-verdict"], "| virus:", h["x-ses-virus-verdict"]);
      console.log("  return-path:", h["return-path"]);
      console.log("  list-unsubscribe:", h["list-unsubscribe"] ?? "none", "| list-unsubscribe-post:", h["list-unsubscribe-post"] ?? "none");
      console.log("  content-type:", String(h["content-type"] ?? ""), "| html part:", full.html ? `${full.html.length} chars` : "none", "| text part:", full.text ? `${full.text.length} chars` : "none");
    }
    return;
  }
  void getDb;
  void sql;
  console.log("commands: send | inspect");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
