/**
 * Bounded fetch for third-party/customer websites: hard timeout, response
 * size cap, and a private-network guard so a customer-supplied URL can never
 * be used to reach internal services. Used by the Business Truth crawler,
 * the citation/authority verifiers, and the site watchdog.
 */

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|\[::1\]|fc|fd)/i;

export type SafeFetchResult =
  | { ok: true; status: number; finalUrl: string; body: string; headers: Headers }
  | { ok: false; error: string; status?: number };

export function isSafePublicUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (PRIVATE_HOST.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export async function safeFetchText(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; accept?: string; headers?: Record<string, string> } = {},
): Promise<SafeFetchResult> {
  const url = isSafePublicUrl(rawUrl);
  if (!url) return { ok: false, error: "unsafe_or_invalid_url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": "GravyBlockBot/1.0 (+https://gravyblock.com/bot)",
        accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
        ...(opts.headers ?? {}),
      },
    });
    // Re-check after redirects: a public URL must not bounce us to a private host.
    if (!isSafePublicUrl(res.url)) return { ok: false, error: "redirected_to_unsafe_url", status: res.status };
    const max = opts.maxBytes ?? 400_000;
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (received < max) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
      }
      void reader.cancel().catch(() => undefined);
    }
    const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    return { ok: true, status: res.status, finalUrl: res.url, body, headers: res.headers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
