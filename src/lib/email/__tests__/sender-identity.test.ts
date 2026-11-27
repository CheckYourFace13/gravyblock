import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CUSTOMER_FROM, PERSONAL_IDENTITY, outreachFrom } from "../identity";
import { senderExceptions } from "../sender-health";
import { grokbotConfig } from "@/lib/search-intel/grokbot";

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "__tests__" ? [] : walk(path.join(d, e.name))) : e.name.endsWith(".ts") || e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));

test("customer and GrokBot mail use Casey at GravyBlock, never a personal identity", () => {
  assert.equal(CUSTOMER_FROM, "Casey at GravyBlock <hello@gravyblock.com>");
  assert.equal(grokbotConfig({}).from, CUSTOMER_FROM);
  assert.equal(outreachFrom({ OUTREACH_FROM_EMAIL: "Chris at GravyBlock <chris@gravyblock.com>" }), CUSTOMER_FROM);
  assert.ok(!PERSONAL_IDENTITY.test(CUSTOMER_FROM));
});

test("only the two owner-only reports may read the general RESEND_FROM_EMAIL setting (it names a person)", () => {
  const root = path.resolve(__dirname, "../../..");
  const users = walk(root)
    .filter((f) => /process\.env\.RESEND_FROM_EMAIL/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(root, f).replace(/\\/g, "/"))
    .sort();
  assert.deepEqual(users, ["lib/email/daily-owner-report.ts", "lib/email/weekly-house-report.ts"]);
});

test("sender-health flags high bounce rates, complaints and GrokBot failures only", () => {
  const ex = senderExceptions([
    { t: "cold_outreach", delivered: 90, bounced: 6, hard: 3, complained: 0 },
    { t: "lead_drip", delivered: 40, bounced: 0, hard: 0, complained: 1 },
    { t: "tiny", delivered: 3, bounced: 1, hard: 1, complained: 0 },
  ], 2);
  assert.equal(ex.length, 3);
  assert.match(ex[0]!, /cold_outreach: bounce rate 6\.3%/);
  assert.match(ex[1]!, /lead_drip: 1 spam complaint/);
  assert.match(ex[2]!, /GrokBot: 2 email/);
  assert.equal(senderExceptions([{ t: "ok", delivered: 100, bounced: 1, hard: 0, complained: 0 }], 0).length, 0);
});

test("the alert threshold is 10 sends", () => {
  assert.equal(senderExceptions([{ t: "authority_outreach", delivered: 16, bounced: 2, hard: 2, complained: 0 }], 0).length, 1);
  assert.equal(senderExceptions([{ t: "nine", delivered: 8, bounced: 1, hard: 1, complained: 0 }], 0).length, 0);
});
