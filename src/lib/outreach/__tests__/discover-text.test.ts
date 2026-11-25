import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTextEmails } from "../discover-contact-email";

test("finds addresses written in visible text, including [at] obfuscation, and ignores scripts and file names", () => {
  const html = "<p>Write to press@club.org or editor [at] club.org</p><script>var x = \"track@evil.com\"</script><img src=\"logo@2x.png\">";
  const got = extractTextEmails(html);
  assert.ok(got.includes("press@club.org"));
  assert.ok(got.includes("editor@club.org"));
  assert.ok(!got.includes("track@evil.com"));
  assert.ok(!got.some((e) => e.endsWith(".png")));
});
