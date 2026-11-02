/**
 * Helpers for the Marketing Studio API routes (uploads and media preview). The upload path has its own bounded body reader
 * so the framework-wide Server Action body limit stays at its small default for every other form on the site.
 */
import { isAdminSession } from "@/lib/auth/admin-session";
import { LIMITS, studioEnabledByEnv } from "./config";

/** Studio must be on AND the caller must hold the operator session. Anything else is a plain 404, revealing nothing. */
export async function studioApiAuthorized(): Promise<boolean> {
  return studioEnabledByEnv() && (await isAdminSession());
}

export const notFoundResponse = () => new Response("Not found", { status: 404 });

/** Cross-site form posts are refused. Cookies are SameSite=Lax already; this is a second, explicit layer. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers and same-origin navigations may omit it; the session cookie is still required
  try {
    const host = new URL(origin).host;
    const site = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : null;
    const reqHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return host === reqHost || host === site;
  } catch {
    return false;
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("The upload is larger than the allowed size");
    this.name = "BodyTooLargeError";
  }
}

/** Reads a request body but stops, and refuses, as soon as it exceeds `maxBytes`. Never trusts Content-Length alone. */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Multipart overhead allowance on top of the file limit. */
export const MAX_UPLOAD_REQUEST_BYTES = LIMITS.maxUploadBytes + 64 * 1024;

export function redirectTo(path: string): Response {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return Response.redirect(new URL(path, base).toString(), 303);
}
