import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body"
 * using the base64 payload after the "whsec_" prefix, base64-encoded, and
 * sent as one or more space-separated "v1,<sig>" values in svix-signature.
 * Any match is valid (supports secret rotation). Matches Resend's documented
 * verification method (resend.com/docs/dashboard/webhooks/verify-webhooks-requests)
 * byte-for-byte — verified against their published example.
 *
 * `body` must be the RAW request text, never JSON.parse'd-then-stringified —
 * the signature is sensitive to any reformatting.
 */
export function verifyResendSignature(
  body: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;

  const timestampNum = Number(svixTimestamp);
  if (!Number.isFinite(timestampNum)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNum) > TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  return svixSignature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((sig): sig is string => Boolean(sig))
    .some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });
}
