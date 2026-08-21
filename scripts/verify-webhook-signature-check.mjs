#!/usr/bin/env node
// Standalone algorithm check for Resend/Svix webhook signature verification.
// No test framework exists in this repo yet, so this is a runnable script
// (not a unit test) — covers: valid fixture, altered body, invalid signature,
// missing headers, stale timestamp, wrong secret. This mirrors the exact
// algorithm in src/lib/integrations/verify-resend-signature.ts (kept as a
// literal copy here rather than imported, to sidestep an environment-specific
// ESM/tsx resolution quirk when importing a sibling .ts file from a script
// outside src/ — the real, live end-to-end proof is the production curl test
// in the session notes, not this file alone).
// Run: node scripts/verify-webhook-signature-check.mjs
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyResendSignature(body, svixId, svixTimestamp, svixSignature, secret) {
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;
  const timestampNum = Number(svixTimestamp);
  if (!Number.isFinite(timestampNum)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNum) > 5 * 60) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");
  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });
}

const SECRET = "whsec_" + Buffer.from("test-secret-bytes-1234567890ab").toString("base64");
const ID = "msg_test123";
const TIMESTAMP = String(Math.floor(Date.now() / 1000));
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "abc123", to: ["test@example.com"] } });

function sign(id, timestamp, body, secret) {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${sig}`;
}

let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? "PASS" : "FAIL"} — ${name} (expected ${expected}, got ${actual})`);
  if (!pass) failures++;
}

const validSig = sign(ID, TIMESTAMP, BODY, SECRET);
check("valid signed fixture accepted", verifyResendSignature(BODY, ID, TIMESTAMP, validSig, SECRET), true);

const alteredBody = BODY.replace("delivered", "clicked");
check("altered body rejected", verifyResendSignature(alteredBody, ID, TIMESTAMP, validSig, SECRET), false);

check("invalid signature rejected", verifyResendSignature(BODY, ID, TIMESTAMP, "v1,not-a-real-signature==", SECRET), false);

check("missing svix-id rejected", verifyResendSignature(BODY, null, TIMESTAMP, validSig, SECRET), false);
check("missing svix-timestamp rejected", verifyResendSignature(BODY, ID, null, validSig, SECRET), false);
check("missing svix-signature rejected", verifyResendSignature(BODY, ID, TIMESTAMP, null, SECRET), false);

const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
const staleSig = sign(ID, staleTimestamp, BODY, SECRET);
check("stale timestamp rejected (replay protection)", verifyResendSignature(BODY, ID, staleTimestamp, staleSig, SECRET), false);

check(
  "wrong secret rejected",
  verifyResendSignature(BODY, ID, TIMESTAMP, validSig, "whsec_" + Buffer.from("different-secret-bytes-xxxxxx").toString("base64")),
  false,
);

console.log(failures === 0 ? `\nAll checks passed.` : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
