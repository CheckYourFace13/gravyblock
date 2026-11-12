import "./setup";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { CUSTOMER_FROM, CUSTOMER_REPLY_TO, outreachFrom } from "../../email/identity";
import { replyNote, STUDIO_FROM, studioHeaders } from "../publishing/sender";
import { buildReviewEmail, type ReviewState } from "../publishing/video-review";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? (n === "__tests__" || n === "node_modules" ? [] : walk(path.join(dir, n))) : [path.join(dir, n)]));

/** Places that deliberately use the owner's own address or the general sender: owner-only reports and admin/health displays. */
const INTERNAL_ONLY = [/lib[\\/]email[\\/]daily-owner-report\.ts$/, /worker[\\/]index\.ts$/, /app[\\/]api[\\/]health[\\/]route\.ts$/];

describe("customer email identity: Casey at GravyBlock, hello@gravyblock.com", () => {
  test("the standard identity is Casey at hello@gravyblock.com, replies go to the same address, and no setting can swap in a person", () => {
    assert.equal(CUSTOMER_FROM, "Casey at GravyBlock <hello@gravyblock.com>");
    assert.equal(CUSTOMER_REPLY_TO, "hello@gravyblock.com");
    assert.equal(STUDIO_FROM, CUSTOMER_FROM);
    assert.deepEqual(studioHeaders(), { from: CUSTOMER_FROM, reply_to: CUSTOMER_REPLY_TO });
    assert.equal(outreachFrom({}), CUSTOMER_FROM);
    assert.equal(outreachFrom({ OUTREACH_FROM_EMAIL: "Chris at GravyBlock <chris@gravyblock.com>" }), CUSTOMER_FROM, "a personal outreach override is ignored");
    assert.equal(outreachFrom({ OUTREACH_FROM_EMAIL: "Casey at GravyBlock <casey@mail.gravyblock.com>" }), "Casey at GravyBlock <casey@mail.gravyblock.com>", "a dedicated non-personal outreach sender is allowed");
    assert.doesNotMatch(replyNote(), /chris|noreply/i);
  });

  test("the review email names no person, is not from noreply, and invites replies", () => {
    const r = { status: "unlisted_live", publicationId: "p", productId: "x", productName: "BoatingChicago", videoRowId: "v", videoId: "abcdefghijk", title: "A title", description: "A description", watchUrl: "https://www.youtube.com/watch?v=abcdefghijk", durationSec: 25, ctaText: "Go", ctaUrl: "https://example.com", intendedUse: "t", updated: true } as unknown as ReviewState;
    const mail = buildReviewEmail(r, { approve: "https://x/a", changes: "https://x/c", pause: "https://x/p" });
    assert.match(mail.subject, /^Your updated video is ready for review/);
    for (const part of [mail.text, mail.html, mail.subject]) assert.doesNotMatch(part, /chris|noreply/i);
    assert.match(mail.text, /hello@gravyblock\.com/);
  });

  test("no customer-facing source reads the general sender, names a person, or sends as noreply", () => {
    const root = path.join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const f of walk(root).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const rel = path.relative(root, f);
      if (INTERNAL_ONLY.some((re) => re.test(rel))) continue;
      const t = readFileSync(f, "utf8");
      if (/process\.env\.RESEND_FROM_EMAIL/.test(t)) offenders.push(`${rel}: reads RESEND_FROM_EMAIL`);
      if (/noreply@gravyblock/i.test(t)) offenders.push(`${rel}: sends as noreply`);
      if (/chris@gravyblock|chris at gravyblock/i.test(t)) offenders.push(`${rel}: personal sender or address`);
      if (/SENDER_NAME\s*=\s*"Chris"/.test(t)) offenders.push(`${rel}: signs as Chris`);
    }
    assert.deepEqual(offenders, []);
  });
});
