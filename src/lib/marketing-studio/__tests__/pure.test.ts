// Run: npx tsx --test src/lib/marketing-studio/__tests__/pure.test.ts
import "./setup";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { decryptSecret, encryptSecret } from "../credentials";
import { detectImage, sanitizeDisplayName } from "../uploads";
import { assertCanStore, safeJoin, StorageLimitError } from "../storage";
import { assertAllowedUrl, isBlockedAddress } from "../remote-import";
import { backoffMs, governorDecision } from "../runtime";
import { slugify } from "../repository";
import { LIMITS } from "../config";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 1, 0, 0, 0, 0, 128]), Buffer.alloc(16)]);

test("credentials: AES-GCM round trip never stores plaintext", () => {
  const { ciphertext, keyId } = encryptSecret("super-secret-token-123");
  assert.equal(keyId, "k1");
  assert.ok(!Buffer.from(ciphertext, "base64").toString("utf8").includes("super-secret-token-123"));
  assert.equal(decryptSecret(ciphertext, keyId), "super-secret-token-123");
  assert.notEqual(encryptSecret("super-secret-token-123").ciphertext, ciphertext, "fresh IV per encryption");
});

test("credentials: tampering and wrong key are rejected", () => {
  const { ciphertext } = encryptSecret("another-secret-value");
  const buf = Buffer.from(ciphertext, "base64");
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => decryptSecret(buf.toString("base64"), "k1"));
  assert.throws(() => decryptSecret(ciphertext, "k9"), /not configured/);
});

test("uploads: type is decided by bytes; SVG, text, scripts and disguised files are rejected", () => {
  assert.equal(detectImage(PNG)?.mime, "image/png");
  assert.equal(detectImage(PNG)?.width, 256);
  assert.equal(detectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")), null);
  assert.equal(detectImage(Buffer.from("MZ\x90\x00 this is an executable")), null);
  assert.equal(detectImage(Buffer.from("#!/bin/sh\nrm -rf /")), null);
  assert.equal(detectImage(Buffer.alloc(0)), null);
  assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0]))?.mime, "image/jpeg");
  assert.equal(detectImage(Buffer.from("GIF89a\x10\x00\x10\x00....."))?.mime, "image/gif");
});

test("uploads: display names are sanitized and can never carry a path", () => {
  assert.equal(sanitizeDisplayName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeDisplayName("C:\\Windows\\evil<>.png"), "evil.png");
  assert.equal(sanitizeDisplayName("\u0000\u0001"), "upload");
  assert.ok(sanitizeDisplayName("a".repeat(500)).length <= 120);
});

test("storage: safeJoin refuses traversal, absolute and NUL segments", () => {
  const root = "/var/lib/gravyblock-marketing/media";
  assert.equal(safeJoin(root, "abc", "x.png"), path.resolve(root, "abc", "x.png"));
  assert.throws(() => safeJoin(root, "..", "etc"));
  assert.throws(() => safeJoin(root, "abc/../../etc"));
  assert.throws(() => safeJoin(root, "/etc/passwd"));
  assert.throws(() => safeJoin(root, "a\0b"));
  assert.throws(() => safeJoin(root, ""));
});

test("storage: quota and ceiling checks stop storage instead of proceeding", async () => {
  await assert.rejects(assertCanStore("11111111-1111-4111-8111-111111111111", LIMITS.perProductQuotaBytes + 1), StorageLimitError);
  await assert.rejects(assertCanStore("11111111-1111-4111-8111-111111111111", LIMITS.totalDiskCeilingBytes + 1), StorageLimitError);
});

test("ssrf: private, loopback, link-local, metadata and mapped addresses are blocked", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.9.9", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"]) {
    assert.equal(isBlockedAddress(a), true, a);
  }
  for (const a of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) assert.equal(isBlockedAddress(a), false, a);
  assert.equal(isBlockedAddress("not-an-ip"), true);
});

test("ssrf: only plain https URLs to public hosts are accepted", () => {
  assert.doesNotThrow(() => assertAllowedUrl("https://example.com/logo.png"));
  for (const u of ["http://example.com/a.png", "ftp://example.com/a", "https://user:pw@example.com/a.png", "https://example.com:8443/a.png", "https://127.0.0.1/a.png", "https://169.254.169.254/latest/meta-data", "https://localhost/a.png", "https://[::1]/a.png", "file:///etc/passwd", "not a url"]) {
    assert.throws(() => assertAllowedUrl(u), u);
  }
});

test("governor: heavy work waits on low RAM, high load, low disk or a deploy; light work waits only on low disk", () => {
  const ok = { availableRamBytes: LIMITS.minAvailableRamBytes + 1, load1: 0.2, freeDiskBytes: LIMITS.freeDiskFloorBytes + 1, deployRunning: false };
  assert.equal(governorDecision(ok, { heavy: true }).allowed, true);
  assert.equal(governorDecision({ ...ok, availableRamBytes: 1 }, { heavy: true }).allowed, false);
  assert.equal(governorDecision({ ...ok, load1: 5 }, { heavy: true }).allowed, false);
  assert.equal(governorDecision({ ...ok, deployRunning: true }, { heavy: true }).allowed, false);
  assert.equal(governorDecision({ ...ok, freeDiskBytes: 1 }, { heavy: false }).allowed, false);
  assert.equal(governorDecision({ ...ok, availableRamBytes: 1, load1: 5, deployRunning: true }, { heavy: false }).allowed, true);
});

test("queue: backoff grows and stays bounded", () => {
  const a = backoffMs(1);
  const b = backoffMs(2);
  const c = backoffMs(3);
  assert.ok(a >= 100_000 && a <= 140_000);
  assert.ok(b > a && c > b);
  assert.ok(backoffMs(99) <= 45 * 60_000 * 1.15 + 1);
});

test("repository: slugify", () => {
  assert.equal(slugify("Scribble Zap!"), "scribble-zap");
  assert.equal(slugify("  Rental—Noodle  "), "rental-noodle");
});
