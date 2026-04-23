import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function secret() {
  return process.env.REPORT_UNLOCK_SECRET ?? process.env.NEXTAUTH_SECRET ?? "gravyblock-report-unlock-dev-secret";
}

function signature(publicId: string, expiresAt: number) {
  return createHmac("sha256", secret()).update(`${publicId}.${expiresAt}`).digest("base64url");
}

export function createReportUnlockToken(publicId: string, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + Math.max(60_000, ttlMs);
  return `${expiresAt}.${signature(publicId, expiresAt)}`;
}

export function verifyReportUnlockToken(publicId: string, token?: string | null) {
  if (!token) return false;
  const [expiresRaw, sig] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!expiresAt || Number.isNaN(expiresAt) || !sig) return false;
  if (Date.now() > expiresAt) return false;
  const expected = signature(publicId, expiresAt);
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

