/**
 * Signed first-party publishing feed.
 *
 * GravyBlock publishes what it wants a connected site to show as a JSON feed,
 * signed with an Ed25519 key. The key pair is derived deterministically from the
 * server's existing ADMIN_SECRET, so there is no new secret to provision or rotate
 * by hand. Connected sites embed only the PUBLIC key and refuse any feed whose
 * signature does not verify — a compromised network path or DNS cannot inject content.
 */
import { createHmac, createPrivateKey, createPublicKey, sign as edSign } from "node:crypto";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function privateKey() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  const seed = createHmac("sha256", secret).update("gravyblock-managed-site-signing-v1").digest();
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function signFeedBody(body: string): string | null {
  const key = privateKey();
  if (!key) return null;
  return edSign(null, Buffer.from(body, "utf8"), key).toString("base64");
}

/** Base64 of the raw 32-byte public key (what a connected site embeds). */
export function feedPublicKeyBase64(): string | null {
  const key = privateKey();
  if (!key) return null;
  const spki = createPublicKey(key).export({ format: "der", type: "spki" }) as Buffer;
  return spki.subarray(spki.length - 32).toString("base64");
}
