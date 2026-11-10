// Object storage client, canonical video and storage lifecycle. No network: the store is exercised against an in-process S3-style server.
import "./setup";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { describe, test } from "node:test";
import { choosePlayback, embedSnippet, signMediaAccess, verifyMediaAccess, type CanonicalVideo } from "../media/canonical";
import { planPurge, RETENTION_DAYS, type LifecycleVideo } from "../media/lifecycle";
import { assertTenantKey, S3CompatibleStore, storeFromEnv } from "../media/object-store";

describe("request signing", () => {
  test("matches the published AWS Signature V4 example for a presigned GET", () => {
    const s = new S3CompatibleStore({ endpoint: "https://s3.amazonaws.com", bucket: "examplebucket", region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", style: "virtual" }, { now: () => new Date(Date.UTC(2013, 4, 24, 0, 0, 0)) });
    const url = s.signedUrl("test.txt", { ttlSec: 86400 });
    assert.ok(url.includes("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"), url);
  });
});

describe("tenant isolation of keys", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  test("a key only belongs to its own tenant", () => {
    assertTenantKey(A, `t/${A}/cv_x/a.mp4`);
    assert.throws(() => assertTenantKey(A, `t/${B}/cv_x/a.mp4`));
    assert.throws(() => assertTenantKey(A, `t/${A}/../${B}/a.mp4`));
    assert.throws(() => assertTenantKey("not-a-uuid", "t/not-a-uuid/a"));
  });
});

describe("storage client against an S3-style server", () => {
  test("uploads are verified, repeats are skipped, signed addresses never leak keys, deletes are idempotent, and 5xx retries", async () => {
    const objects = new Map<string, { body: Buffer; type: string; sha: string }>();
    let flaky = 1;
    let sawAuth = 0;
    const srv = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (String(req.headers.authorization ?? "").startsWith("AWS4-HMAC-SHA256 Credential=AK/")) sawAuth++;
        const key = decodeURIComponent((req.url ?? "").split("?")[0]);
        if (req.method === "PUT") {
          if (flaky-- > 0) return void res.writeHead(503).end();
          const body = Buffer.concat(chunks);
          objects.set(key, { body, type: String(req.headers["content-type"]), sha: String(req.headers["x-amz-meta-sha256"]) });
          return void res.writeHead(200, { etag: `"${createHash("md5").update(body).digest("hex")}"` }).end();
        }
        const o = objects.get(key);
        if (req.method === "HEAD") return void (o ? res.writeHead(200, { "content-length": String(o.body.length), "content-type": o.type, "x-amz-meta-sha256": o.sha }) : res.writeHead(404)).end();
        if (req.method === "DELETE") {
          objects.delete(key);
          return void res.writeHead(204).end();
        }
        res.writeHead(400).end();
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    const store = new S3CompatibleStore({ endpoint: `http://127.0.0.1:${port}`, bucket: "media", region: "auto", accessKeyId: "AK", secretAccessKey: "SK" }, { sleep: async () => {} });
    const body = Buffer.from("not really a video");
    const first = await store.put("t/p/cv_1/a.mp4", body, { contentType: "video/mp4" });
    assert.equal(first.skipped, false);
    assert.equal(first.sha256, createHash("sha256").update(body).digest("hex"));
    assert.equal((await store.put("t/p/cv_1/a.mp4", body, { contentType: "video/mp4" })).skipped, true, "the same bytes are never uploaded twice");
    const head = await store.head("t/p/cv_1/a.mp4");
    assert.equal(head?.bytes, body.length);
    assert.equal(await store.head("t/p/missing"), null);
    await store.delete("t/p/cv_1/a.mp4");
    await store.delete("t/p/cv_1/a.mp4");
    assert.equal(await store.head("t/p/cv_1/a.mp4"), null);
    assert.ok(sawAuth >= 6, "every request is signed");
    const url = store.signedUrl("t/p/cv_1/a.mp4", { ttlSec: 600 });
    assert.ok(url.includes("X-Amz-Expires=600") && !url.includes("SK"), "the secret never appears in a signed address");
    srv.close();
  });
  test("a checksum mismatch from the store is refused", async () => {
    const srv = createServer((req, res) => {
      req.resume();
      req.on("end", () => void (req.method === "HEAD" ? res.writeHead(404) : res.writeHead(200, { etag: '"00000000000000000000000000000000"' })).end());
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const store = new S3CompatibleStore({ endpoint: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, bucket: "m", region: "auto", accessKeyId: "AK", secretAccessKey: "SK" }, { sleep: async () => {} });
    await assert.rejects(store.put("t/p/x", Buffer.from("abc"), { contentType: "video/mp4" }), /integrity/);
    srv.close();
  });
  test("R2 needs only an account, a bucket and a key pair", () => {
    const none = storeFromEnv({});
    assert.ok(!none.ok && none.missing.length === 4);
    assert.ok(storeFromEnv({ R2_ACCOUNT_ID: "abc", MEDIA_STORE_BUCKET: "b", MEDIA_STORE_ACCESS_KEY_ID: "k", MEDIA_STORE_SECRET_ACCESS_KEY: "s" }).ok);
  });
});

describe("canonical video", () => {
  const base: CanonicalVideo = { id: "cv_abcdefghijklmnop", productId: "p", title: "T", status: "review", providers: [{ kind: "object", key: "t/p/cv/a.mp4", bytes: 1, sha256: "x", contentType: "video/mp4" }], createdAt: "2026-11-10" };
  test("a video in review plays only from hosted storage; public prefers the customer's own YouTube copy; retired plays nowhere", () => {
    assert.equal(choosePlayback(base)?.kind, "object");
    const both: CanonicalVideo = { ...base, status: "public", providers: [...base.providers, { kind: "youtube", videoId: "abc" }] };
    assert.equal(choosePlayback(both)?.kind, "youtube");
    assert.equal(choosePlayback({ ...both, providers: [{ kind: "youtube", videoId: "abc" }], status: "public" })?.kind, "youtube");
    assert.equal(choosePlayback({ ...base, status: "retired" }), null);
  });
  test("the website embed names the canonical id, so connecting YouTube later changes no site code", () => {
    const a = embedSnippet("https://gravyblock.com/", base.id, 'A "title"');
    assert.equal(a.url, `https://gravyblock.com/embed/${base.id}`);
    assert.ok(a.iframe.includes(a.url) && !a.iframe.includes("youtube") && !a.iframe.includes('"title"'));
  });
  test("review access links expire and cannot be reused for another video", () => {
    const k = "k".repeat(32);
    const t = signMediaAccess("cv_one", k, 1000, 5000);
    assert.ok(verifyMediaAccess("cv_one", t, k, 5500));
    assert.ok(!verifyMediaAccess("cv_two", t, k, 5500));
    assert.ok(!verifyMediaAccess("cv_one", t, k, 7000));
    assert.ok(!verifyMediaAccess("cv_one", "garbage", k, 5500));
  });
});

describe("storage lifecycle plan", () => {
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 10, 20);
  const v = (o: Partial<LifecycleVideo>): LifecycleVideo => ({ id: "v", assetId: "a", status: "superseded", createdAt: now - 10 * DAY, bytes: 10_000_000, onPlatform: false, onObjectStore: false, ...o });
  test("failed and superseded renders go after their retention; recent ones stay", () => {
    assert.equal(planPurge([v({ status: "failed", createdAt: now - 2 * DAY })], now).actions.length, 1);
    assert.equal(planPurge([v({ status: "superseded", createdAt: now - (RETENTION_DAYS.superseded - 1) * DAY })], now).actions.length, 0);
    assert.equal(planPurge([v({ status: "superseded", createdAt: now - (RETENTION_DAYS.superseded + 1) * DAY })], now).actions.length, 1);
  });
  test("a render still waiting to be uploaded, or approved with no platform copy, is the only copy and is never purged", () => {
    assert.equal(planPurge([v({ status: "ready_for_review", createdAt: now - 30 * DAY })], now).actions.length, 0);
    assert.equal(planPurge([v({ status: "approved", createdAt: now - 30 * DAY })], now).actions.length, 0);
  });
  test("a copy on YouTube leaves the VPS after a week; a verified hosted copy after a day", () => {
    assert.equal(planPurge([v({ status: "approved", onPlatform: true, createdAt: now - 8 * DAY })], now).actions[0]?.reason, "published");
    assert.equal(planPurge([v({ status: "approved", onPlatform: true, createdAt: now - 2 * DAY })], now).actions.length, 0);
    assert.equal(planPurge([v({ status: "approved", onObjectStore: true, createdAt: now - 2 * DAY })], now).actions[0]?.reason, "hosted");
  });
  test("a file shared with a record that still needs it is kept", () => {
    const shared = [v({ id: "old", status: "superseded", createdAt: now - 20 * DAY }), v({ id: "new", status: "ready_for_review", createdAt: now - 1 * DAY })];
    assert.equal(planPurge(shared, now).actions.length, 0);
  });
});

describe("voice descriptions come from measuring the audio", () => {
  test("pitch and pace are measured, silence is ignored, and the words follow the numbers", async () => {
    const { describeVoice, measureVoice } = await import("../video/voice-analysis");
    const rate = 24000;
    const tone = (hz: number, sec: number) => Float32Array.from({ length: Math.round(rate * sec) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / rate));
    const silence = new Float32Array(rate);
    const clip = Float32Array.from([...tone(200, 2), ...silence, ...tone(200, 1)]);
    const m = measureVoice(clip, rate, 9);
    assert.ok(m.pitchHz !== null && Math.abs(m.pitchHz - 200) <= 6, `pitch ${m.pitchHz}`);
    assert.ok(Math.abs(m.speechSec - 3) < 0.1, `speech ${m.speechSec}`);
    assert.equal(describeVoice({ pitchHz: 110, wordsPerSec: 2.2, speechSec: 5 }), "Deeper voice, unhurried pace");
    assert.equal(describeVoice({ pitchHz: 250, wordsPerSec: 3.4, speechSec: 5 }), "Higher voice, brisk pace");
    assert.equal(describeVoice({ pitchHz: null, wordsPerSec: 3, speechSec: 5 }), "Clear voice, even pace");
  });
});
