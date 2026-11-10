/**
 * Provider-agnostic object storage for GravyBlock-hosted customer video. The default provider is Cloudflare R2 (S3-compatible, private bucket, no egress fees); any S3-compatible
 * service works by changing the endpoint. The client signs requests itself (AWS Signature V4) so no vendor SDK is needed on the worker.
 *
 *   - The bucket is never public and never listable by customers: every read goes through a short-lived signed URL, and keys are prefixed by tenant (t/<productId>/...).
 *   - Uploads are verified: the response ETag must equal the MD5 we computed and the object's stored sha256 is checked with HEAD. A second put of the same bytes is a no-op.
 *   - Network and 5xx failures retry with backoff; a delete of a missing object succeeds, so every operation is safe to repeat.
 */
import { createHash, createHmac } from "node:crypto";

export type StoreConfig = { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; /** path (R2 and most providers) or virtual (bucket in the host name) */ style?: "path" | "virtual" };
export type ObjectHead = { key: string; bytes: number; contentType: string; sha256: string | null; etag: string | null };
export type PutResult = { key: string; bytes: number; sha256: string; skipped: boolean };

export interface ObjectStore {
  put(key: string, body: Buffer, opts: { contentType: string }): Promise<PutResult>;
  head(key: string): Promise<ObjectHead | null>;
  delete(key: string): Promise<void>;
  /** a time-limited URL that plays or downloads the object; the bucket itself is never public */
  signedUrl(key: string, opts: { ttlSec: number; download?: string }): string;
}

const sha256hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const md5hex = (b: Buffer) => createHash("md5").update(b).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p: string) => p.split("/").map(enc).join("/");

/** Keys are tenant-prefixed so one customer's key can never address another's. */
export function assertTenantKey(productId: string, key: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !key.startsWith(`t/${productId}/`) || key.includes("..") || key.includes("//")) throw new Error("object key is outside this tenant");
}

type Signed = { url: string; headers: Record<string, string> };

export class S3CompatibleStore implements ObjectStore {
  constructor(private readonly cfg: StoreConfig, private readonly deps: { fetch?: typeof fetch; now?: () => Date; sleep?: (ms: number) => Promise<void> } = {}) {}

  private target(key: string) {
    const ep = new URL(this.cfg.endpoint);
    const virtual = this.cfg.style === "virtual";
    const host = virtual ? `${this.cfg.bucket}.${ep.host}` : ep.host;
    const path = virtual ? `/${encPath(key)}` : `/${enc(this.cfg.bucket)}/${encPath(key)}`;
    return { origin: `${ep.protocol}//${host}`, host, path };
  }

  private signingKey(date: string) {
    return hmac(hmac(hmac(hmac(`AWS4${this.cfg.secretAccessKey}`, date), this.cfg.region), "s3"), "aws4_request");
  }

  /** Header-signed request (put, head, delete). */
  private sign(method: string, key: string, headers: Record<string, string>, payloadHash: string): Signed {
    const t = this.target(key);
    const d = (this.deps.now?.() ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, "");
    const date = d.slice(0, 8);
    const all: Record<string, string> = { ...headers, host: t.host, "x-amz-content-sha256": payloadHash, "x-amz-date": d };
    const names = Object.keys(all).map((n) => n.toLowerCase()).sort();
    const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
    const canonical = [method, t.path, "", ...names.map((n) => `${n}:${lower[n]}`), "", names.join(";"), payloadHash].join("\n");
    const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", d, scope, sha256hex(canonical)].join("\n");
    const signature = createHmac("sha256", this.signingKey(date)).update(toSign).digest("hex");
    return { url: `${t.origin}${t.path}`, headers: { ...all, Authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` } };
  }

  signedUrl(key: string, opts: { ttlSec: number; download?: string }): string {
    const t = this.target(key);
    const d = (this.deps.now?.() ?? new Date()).toISOString().replace(/[-:]|\.\d{3}/g, "");
    const date = d.slice(0, 8);
    const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
    const q: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${this.cfg.accessKeyId}/${scope}`, "X-Amz-Date": d, "X-Amz-Expires": String(Math.min(Math.max(opts.ttlSec, 1), 604_800)), "X-Amz-SignedHeaders": "host" };
    if (opts.download) q["response-content-disposition"] = `attachment; filename="${opts.download.replace(/[^\w. -]/g, "_")}"`;
    const query = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join("&");
    const canonical = ["GET", t.path, query, `host:${t.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
    const toSign = ["AWS4-HMAC-SHA256", d, scope, sha256hex(canonical)].join("\n");
    const signature = createHmac("sha256", this.signingKey(date)).update(toSign).digest("hex");
    return `${t.origin}${t.path}?${query}&X-Amz-Signature=${signature}`;
  }

  private async call(method: string, key: string, headers: Record<string, string>, body: Buffer | undefined, payloadHash: string): Promise<Response> {
    const f = this.deps.fetch ?? fetch;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const s = this.sign(method, key, headers, payloadHash); // re-signed each attempt: the timestamp stays fresh
        const res = await f(s.url, { method, headers: s.headers, ...(body ? { body: new Uint8Array(body) } : {}) });
        if (res.status < 500 && res.status !== 429) return res;
        last = new Error(`storage answered ${res.status}`);
      } catch (e) {
        last = e;
      }
      await sleep(400 * 2 ** attempt);
    }
    throw new Error(`storage request failed after retries: ${last instanceof Error ? last.message : String(last)}`);
  }

  async head(key: string): Promise<ObjectHead | null> {
    const res = await this.call("HEAD", key, {}, undefined, sha256hex(""));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`head failed: ${res.status}`);
    return { key, bytes: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") ?? "application/octet-stream", sha256: res.headers.get("x-amz-meta-sha256"), etag: res.headers.get("etag")?.replace(/"/g, "") ?? null };
  }

  async put(key: string, body: Buffer, opts: { contentType: string }): Promise<PutResult> {
    const sha = sha256hex(body);
    const existing = await this.head(key);
    if (existing && existing.sha256 === sha && existing.bytes === body.length) return { key, bytes: body.length, sha256: sha, skipped: true };
    const res = await this.call("PUT", key, { "content-type": opts.contentType, "content-length": String(body.length), "x-amz-meta-sha256": sha }, body, sha);
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const etag = res.headers.get("etag")?.replace(/"/g, "");
    if (etag && /^[0-9a-f]{32}$/.test(etag) && etag !== md5hex(body)) throw new Error("upload integrity check failed: the stored checksum does not match what was sent");
    const check = await this.head(key);
    if (!check || check.bytes !== body.length || (check.sha256 && check.sha256 !== sha)) throw new Error("upload verification failed: the stored object differs from what was sent");
    return { key, bytes: body.length, sha256: sha, skipped: false };
  }

  async delete(key: string): Promise<void> {
    const res = await this.call("DELETE", key, {}, undefined, sha256hex(""));
    if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
  }
}

/** Cloudflare R2 endpoint for an account. */
export const r2Endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

/** Reads the store settings from the environment. The only one-time owner setup is putting these four values in the worker and app environment files. */
export function storeFromEnv(env: Record<string, string | undefined> = process.env, deps: ConstructorParameters<typeof S3CompatibleStore>[1] = {}): { ok: true; store: ObjectStore; bucket: string } | { ok: false; missing: string[] } {
  const account = env.R2_ACCOUNT_ID?.trim();
  const endpoint = env.MEDIA_STORE_ENDPOINT?.trim() || (account ? r2Endpoint(account) : "");
  const need: Array<[string, string | undefined]> = [["R2_ACCOUNT_ID or MEDIA_STORE_ENDPOINT", endpoint], ["MEDIA_STORE_BUCKET", env.MEDIA_STORE_BUCKET?.trim()], ["MEDIA_STORE_ACCESS_KEY_ID", env.MEDIA_STORE_ACCESS_KEY_ID?.trim()], ["MEDIA_STORE_SECRET_ACCESS_KEY", env.MEDIA_STORE_SECRET_ACCESS_KEY?.trim()]];
  const missing = need.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, missing };
  return { ok: true, bucket: env.MEDIA_STORE_BUCKET!.trim(), store: new S3CompatibleStore({ endpoint, bucket: env.MEDIA_STORE_BUCKET!.trim(), region: env.MEDIA_STORE_REGION?.trim() || "auto", accessKeyId: env.MEDIA_STORE_ACCESS_KEY_ID!.trim(), secretAccessKey: env.MEDIA_STORE_SECRET_ACCESS_KEY!.trim() }, deps) };
}
