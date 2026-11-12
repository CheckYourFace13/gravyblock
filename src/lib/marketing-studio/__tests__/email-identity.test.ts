import "./setup";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { replyNote, STUDIO_FROM, studioFrom, studioHeaders, studioReplyTo } from "../publishing/sender";
import { buildReviewEmail, type ReviewState } from "../publishing/video-review";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? (n === "__tests__" ? [] : walk(path.join(dir, n))) : [path.join(dir, n)]));

describe("Marketing Studio email identity", () => {
  test("the sender is always GravyBlock noreply, even when the deployment's general sender names a person", () => {
    assert.equal(STUDIO_FROM, "GravyBlock <noreply@gravyblock.com>");
    assert.equal(studioFrom({}), STUDIO_FROM);
    assert.equal(studioFrom({ RESEND_FROM_EMAIL: "Chris at GravyBlock <chris@gravyblock.com>" }), STUDIO_FROM, "the general sender is never read");
    assert.equal(studioFrom({ MARKETING_STUDIO_FROM_EMAIL: "Chris at GravyBlock <chris@gravyblock.com>" }), STUDIO_FROM, "a personal override is ignored");
    assert.equal(studioFrom({ MARKETING_STUDIO_FROM_EMAIL: "GravyBlock Studio <studio@gravyblock.com>" }), "GravyBlock Studio <studio@gravyblock.com>", "a team sender may be configured");
  });

  test("Reply-To is only ever a configured, non-personal address; otherwise the mail says replies are not read", () => {
    assert.equal(studioReplyTo({}), undefined);
    assert.equal(studioReplyTo({ SUPPORT_EMAIL: "chris@gravyblock.com" }), undefined);
    assert.equal(studioReplyTo({ MARKETING_REVIEW_EMAIL: "chris@iscreamstudio.com" }), undefined, "the private review recipient is never a reply address");
    assert.equal(studioReplyTo({ SUPPORT_EMAIL: "support@gravyblock.com" }), "support@gravyblock.com");
    assert.deepEqual(studioHeaders({ SUPPORT_EMAIL: "support@gravyblock.com" }), { from: STUDIO_FROM, reply_to: "support@gravyblock.com" });
    assert.deepEqual(studioHeaders({}), { from: STUDIO_FROM });
    assert.match(replyNote({}), /not monitored/);
    assert.doesNotMatch(replyNote({}), /chris/i);
  });

  test("the review email names no person and says replies are not read", () => {
    const r = { status: "unlisted_live", publicationId: "p", productId: "x", productName: "BoatingChicago", videoRowId: "v", videoId: "abcdefghijk", title: "A title", description: "A description", watchUrl: "https://www.youtube.com/watch?v=abcdefghijk", durationSec: 25, ctaText: "Go", ctaUrl: "https://example.com", intendedUse: "t", updated: true } as unknown as ReviewState;
    const mail = buildReviewEmail(r, { approve: "https://x/a", changes: "https://x/c", pause: "https://x/p" });
    assert.match(mail.subject, /^Your updated video is ready for review/);
    for (const part of [mail.text, mail.html, mail.subject]) assert.doesNotMatch(part, /chris/i);
    assert.match(mail.text, /not monitored/);
    assert.match(mail.html, /not monitored/);
  });

  test("no Marketing Studio source file reads the general sender or carries a personal sender identity", () => {
    const root = path.join(process.cwd(), "src", "lib", "marketing-studio");
    const offenders: string[] = [];
    for (const f of walk(root).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const t = readFileSync(f, "utf8");
      if (/process\.env\.RESEND_FROM_EMAIL/.test(t)) offenders.push(`${path.relative(root, f)}: reads RESEND_FROM_EMAIL`);
      if (/chris@gravyblock|chris at gravyblock/i.test(t)) offenders.push(`${path.relative(root, f)}: personal sender`);
    }
    assert.deepEqual(offenders, []);
  });
});
