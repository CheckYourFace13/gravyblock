/**
 * SSRF-safe remote import of a public image URL.
 *
 *  - https only, no credentials in the URL, port 443 only
 *  - every address the hostname resolves to is checked, and the check runs INSIDE the socket's DNS lookup, so a hostname
 *    cannot resolve to a public address for the check and a private one for the connection (rebinding)
 *  - redirects are followed manually (max 3) and each hop is validated the same way
 *  - hard timeout and hard size cap; the bytes are then validated as an image by content, not by header
 */
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import { LIMITS, type AssetKind } from "./config";
import { requireStudioDb, type StudioDb } from "./db";
import { storeImageAsset, UploadError, type StoredAsset } from "./uploads";
import type { OwnerScope } from "./scope";

const BLOCKED = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(net4, prefix, "ipv4");
}
for (const [net6, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(net6, prefix, "ipv6");
}

export function isBlockedAddress(addr: string): boolean {
  const family = net.isIP(addr);
  if (family === 0) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is judged by its embedded IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return BLOCKED.check(mapped[1], "ipv4");
  return BLOCKED.check(addr, family === 6 ? "ipv6" : "ipv4");
}

export function assertAllowedUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UploadError("That is not a valid URL");
  }
  if (u.protocol !== "https:") throw new UploadError("Only https URLs can be imported");
  if (u.username || u.password) throw new UploadError("URLs with credentials are not allowed");
  if (u.port && u.port !== "443") throw new UploadError("Only the standard https port is allowed");
  if (!u.hostname.includes(".") && net.isIP(u.hostname) === 0) throw new UploadError("The host name is not allowed");
  if (net.isIP(u.hostname) !== 0 && isBlockedAddress(u.hostname.replace(/^\[|\]$/g, ""))) throw new UploadError("That address is not allowed");
  return u;
}

/** DNS lookup that refuses to return any non-public address. Used as the socket's own lookup, so it cannot be bypassed. */
const guardedLookup: typeof dns.lookup = ((hostname: string, options: unknown, callback: unknown) => {
  const cb = (typeof options === "function" ? options : callback) as (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void;
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      return cb(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }));
    }
    const wantAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
    if (wantAll) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}) as typeof dns.lookup;

function fetchOnce(u: URL, maxBytes: number, timeoutMs: number): Promise<{ status: number; location: string | null; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { protocol: "https:", hostname: u.hostname, port: 443, path: `${u.pathname}${u.search}`, method: "GET", lookup: guardedLookup, headers: { "user-agent": "GravyBlockMarketingStudio/1.0", accept: "image/*" }, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location ?? null, body: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new UploadError("The remote file is larger than the import limit"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, location: null, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new UploadError("The remote server took too long")));
    req.on("error", (e) => reject(e instanceof UploadError ? e : new UploadError(e.message === "blocked address" ? "That address is not allowed" : "Could not fetch the URL")));
    req.end();
  });
}

export async function fetchPublicImage(rawUrl: string): Promise<{ bytes: Buffer; finalUrl: string }> {
  let url = assertAllowedUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetchOnce(url, LIMITS.maxRemoteImportBytes, 10_000);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new UploadError("The remote server redirected without a location");
      url = assertAllowedUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status !== 200) throw new UploadError(`The remote server answered ${res.status}`);
    return { bytes: res.body, finalUrl: url.toString() };
  }
  throw new UploadError("Too many redirects");
}

export async function importRemoteImage(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { url: string; kind: AssetKind },
  db: StudioDb = requireStudioDb(),
): Promise<StoredAsset> {
  const { bytes, finalUrl } = await fetchPublicImage(input.url);
  const name = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() || "import");
  return storeImageAsset(scope, actor, productId, { bytes, originalName: name, kind: input.kind, provenance: "public_fetch", sourceUrl: finalUrl }, db);
}

/**
 * Live check of a URL with the same SSRF guard as imports. Returns the final HTTP status, or null when it could not be checked
 * (network error, blocked address). Only the status line is read; the body is discarded.
 */
export async function probeUrl(rawUrl: string): Promise<number | null> {
  let url: URL;
  try {
    url = assertAllowedUrl(rawUrl);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= 3; hop++) {
    const status = await new Promise<{ status: number; location: string | null } | null>((resolve) => {
      const req = https.request(
        { protocol: "https:", hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: "GET", lookup: guardedLookup, headers: { "user-agent": "GravyBlockMarketingStudio/1.0", accept: "text/html,*/*" }, timeout: 8000 },
        (res) => {
          resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
          res.destroy();
        },
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
      req.end();
    });
    if (!status) return null;
    if (status.status >= 300 && status.status < 400 && status.location) {
      try {
        url = assertAllowedUrl(new URL(status.location, url).toString());
      } catch {
        return null;
      }
      continue;
    }
    return status.status;
  }
  return null;
}
