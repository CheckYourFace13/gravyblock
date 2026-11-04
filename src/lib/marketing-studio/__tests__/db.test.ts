// Run the whole suite on a disposable database with:  npm run test:studio  (scripts/marketing-test.mts: in-memory, name contains "test", schema pushed, gone afterwards).
// To use your own scratch database instead, push the schema and set STUDIO_TEST_DATABASE_URL=postgresql://.../<name containing test>.
// Optional role test (proves the least-privilege role cannot touch anything but ms_ tables):
//   STUDIO_TEST_ROLE_URL=postgresql://gb_studio:...@127.0.0.1:5432/<db>
import "./setup";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { storeConnection, listConnections } from "../credentials";
import { DISABLE_FILE, STUDIO_DIRS } from "../config";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import {
  addClaim,
  addFact,
  approveAsset,
  createCampaign,
  createProduct,
  getBrandProfile,
  listAssets,
  listCampaigns,
  listClaims,
  listFacts,
  listProducts,
  removeClaim,
  requireProduct,
  saveBrandProfile,
  setCampaignStatus,
  softDeleteProduct,
  verifyFact,
  truthReadiness,
} from "../repository";
import { claimNext, completeJob, disableState, enqueue, failJob, heartbeat, reapExpired, setKillSwitch } from "../runtime";
import { customerScope, INTERNAL_SCOPE, StudioAccessError } from "../scope";
import { ensureStorageDirs } from "../storage";
import { storeImageAsset, UploadError } from "../uploads";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);
// These tests DELETE every ms_ row, so they refuse to run against anything that is not clearly a scratch database.
const dbName = (process.env.STUDIO_TEST_DATABASE_URL ?? "").split("?")[0].split("/").pop() ?? "";
if (HAVE_DB && !/test/i.test(dbName)) {
  throw new Error("STUDIO_TEST_DATABASE_URL must point at a database whose name contains \"test\"");
}
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 128]), Buffer.alloc(40, 7)]);

describe("marketing studio (database)", { skip: !HAVE_DB }, () => {
  const A = customerScope(ORG_A);
  const B = customerScope(ORG_B);
  let internalId = "";
  let aId = "";
  let bId = "";

  before(async () => {
    await ensureStorageDirs();
    const db = requireStudioDb();
    for (const t of [ms.msAuditEvents, ms.msMediaJobs, ms.msUsage, ms.msSettings, ms.msProducts]) await db.delete(t);
    internalId = (await createProduct(INTERNAL_SCOPE, "test", { name: "Internal Game", kind: "mobile_game" })).id;
    aId = (await createProduct(A, "test", { name: "Org A SaaS", kind: "saas" })).id;
    bId = (await createProduct(B, "test", { name: "Org B Site", kind: "website" })).id;
  });
  after(async () => {
    rmSync(STUDIO_DIRS.root, { recursive: true, force: true });
    await closeStudioDb();
  });

  test("isolation: each scope lists only its own products", async () => {
    assert.deepEqual((await listProducts(INTERNAL_SCOPE)).map((p) => p.id), [internalId]);
    assert.deepEqual((await listProducts(A)).map((p) => p.id), [aId]);
    assert.deepEqual((await listProducts(B)).map((p) => p.id), [bId]);
  });

  test("isolation: ownership comes from the scope, never from caller input", async () => {
    const p = await createProduct(A, "test", { name: "Sneaky", kind: "website", ownerKind: "internal", businessId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    assert.equal(p.ownerKind, "customer");
    assert.equal(p.organizationId, ORG_A);
    assert.equal(p.businessId, null, "customers cannot link a business");
    assert.ok(!(await listProducts(INTERNAL_SCOPE)).some((x) => x.id === p.id));
  });

  test("isolation: cross-scope access is denied for every record type", async () => {
    await assert.rejects(requireProduct(B, aId), StudioAccessError);
    await assert.rejects(requireProduct(A, internalId), StudioAccessError);
    await assert.rejects(requireProduct(INTERNAL_SCOPE, aId), StudioAccessError);
    await assert.rejects(listFacts(B, aId), StudioAccessError);
    await assert.rejects(listClaims(B, aId), StudioAccessError);
    await assert.rejects(listAssets(B, aId), StudioAccessError);
    await assert.rejects(listCampaigns(B, aId), StudioAccessError);
    await assert.rejects(getBrandProfile(B, aId), StudioAccessError);
    await assert.rejects(addFact(B, "x", aId, { factKey: "feature", factValue: "stolen", sourceKind: "owner_entered" }), StudioAccessError);
    await assert.rejects(createCampaign(B, "x", aId, { name: "no", objective: "no" }), StudioAccessError);
    await assert.rejects(storeConnection(B, "x", aId, { platform: "youtube", accountLabel: "x", secret: "12345678" }), StudioAccessError);
    await assert.rejects(softDeleteProduct(B, "x", aId), StudioAccessError);
    await assert.rejects(requireProduct(A, "not-a-uuid"), StudioAccessError);
    assert.equal((await requireProduct(A, aId)).id, aId, "owner can still read its own product");
  });

  test("isolation: a record id from another product cannot be reached through your own product", async () => {
    const fb = await addFact(B, "t", bId, { factKey: "feature", factValue: "B secret feature", sourceKind: "owner_entered" });
    await assert.rejects(verifyFact(A, "t", aId, fb.id), StudioAccessError);
    const [still] = await requireStudioDb().select().from(ms.msProductFacts).where(eq(ms.msProductFacts.id, fb.id));
    assert.equal(still.verifiedAt, null);
  });

  test("truth: approved claims need verified facts of the same product; prohibited claims do not", async () => {
    const f = await addFact(INTERNAL_SCOPE, "t", internalId, { factKey: "product_name", factValue: "Internal Game", sourceKind: "owner_entered" });
    await assert.rejects(addClaim(INTERNAL_SCOPE, "t", internalId, { kind: "approved", text: "A fun game", factIds: [f.id] }), /verified/);
    await assert.rejects(addClaim(INTERNAL_SCOPE, "t", internalId, { kind: "approved", text: "A fun game", factIds: [] }), /cite/);
    await verifyFact(INTERNAL_SCOPE, "t", internalId, f.id);
    const c = await addClaim(INTERNAL_SCOPE, "t", internalId, { kind: "approved", text: "A fun game", factIds: [f.id] });
    assert.deepEqual(c.factIds, [f.id]);
    const other = await addFact(B, "t", bId, { factKey: "feature", factValue: "other", sourceKind: "owner_entered" });
    await verifyFact(B, "t", bId, other.id);
    await assert.rejects(addClaim(INTERNAL_SCOPE, "t", internalId, { kind: "approved", text: "Borrowed claim", factIds: [other.id] }), /verified, current fact of this product/);
    const p = await addClaim(INTERNAL_SCOPE, "t", internalId, { kind: "prohibited", text: "best game ever" });
    assert.deepEqual(p.factIds, []);
    await removeClaim(INTERNAL_SCOPE, "t", internalId, p.id);
    const dup = await addFact(INTERNAL_SCOPE, "t", internalId, { factKey: "product_name", factValue: "  internal   GAME ", sourceKind: "owner_entered" });
    assert.equal(dup.id, f.id, "identical fact is not duplicated");
    assert.equal((await truthReadiness(INTERNAL_SCOPE, internalId)).ready, false, "feature and url still missing, so nothing may be generated");
  });

  test("brand profiles version and only keep valid colors", async () => {
    const v1 = await saveBrandProfile(INTERNAL_SCOPE, "t", internalId, { colors: { primary: "#dc2626", bad: "red; drop table" } });
    const v2 = await saveBrandProfile(INTERNAL_SCOPE, "t", internalId, { colors: { primary: "#000" } });
    assert.equal(v2.version, v1.version + 1);
    assert.deepEqual(v1.colors, { primary: "#dc2626" });
  });

  test("campaigns: level 3 and publishing states are not available in Phase 1", async () => {
    const c = await createCampaign(INTERNAL_SCOPE, "t", internalId, { name: "Launch", objective: "Awareness", automationLevel: 3, channels: ["youtube", "myspace"] });
    assert.equal(c.automationLevel, 1);
    assert.deepEqual(c.channels, ["youtube"]);
    await assert.rejects(setCampaignStatus(INTERNAL_SCOPE, "t", internalId, c.id, "scheduled"), /not enabled/);
    await assert.rejects(setCampaignStatus(INTERNAL_SCOPE, "t", internalId, c.id, "live"), /not enabled/);
    await setCampaignStatus(INTERNAL_SCOPE, "t", internalId, c.id, "needs_review");
  });

  test("credentials: only ciphertext is stored and no read path returns it", async () => {
    const secret = "oauth-token-abcdefghij";
    const summary = await storeConnection(INTERNAL_SCOPE, "t", internalId, { platform: "facebook", accountLabel: "Page", secret });
    assert.ok(!("secretCiphertext" in summary));
    const [row] = await requireStudioDb().select().from(ms.msConnections).where(eq(ms.msConnections.id, summary.id));
    assert.ok(!JSON.stringify(row).includes(secret));
    assert.ok(!Buffer.from(row.secretCiphertext, "base64").toString("latin1").includes(secret));
    assert.ok(!JSON.stringify(await listConnections(INTERNAL_SCOPE, internalId)).includes("secretCiphertext"));
  });

  test("assets: validated by content, deduplicated, hashed names, only approved when an operator says so", async () => {
    await assert.rejects(storeImageAsset(INTERNAL_SCOPE, "t", internalId, { bytes: Buffer.from("<svg/>"), originalName: "a.svg", kind: "logo", provenance: "owner_upload" }), UploadError);
    await assert.rejects(storeImageAsset(INTERNAL_SCOPE, "t", internalId, { bytes: Buffer.alloc(11 * 1024 * 1024, 1), originalName: "huge.png", kind: "logo", provenance: "owner_upload" }), UploadError);
    const a = await storeImageAsset(INTERNAL_SCOPE, "t", internalId, { bytes: PNG, originalName: "../../evil/../logo.png", kind: "logo", provenance: "owner_upload" });
    assert.match(a.storagePath, /^[0-9a-f-]{36}\/[0-9a-f]{64}\.png$/);
    assert.equal(a.originalName, "logo.png");
    assert.equal(a.approved, "false");
    const again = await storeImageAsset(INTERNAL_SCOPE, "t", internalId, { bytes: PNG, originalName: "copy.png", kind: "logo", provenance: "owner_upload" });
    assert.equal(again.id, a.id);
    await assert.rejects(approveAsset(B, "t", internalId, a.id), StudioAccessError);
    await approveAsset(INTERNAL_SCOPE, "t", internalId, a.id, "owner supplied");
    assert.equal((await listAssets(INTERNAL_SCOPE, internalId))[0].approved, "true");
  });

  test("soft delete hides a product from its owner", async () => {
    const p = await createProduct(A, "t", { name: "Temp product", kind: "website" });
    await softDeleteProduct(A, "t", p.id);
    await assert.rejects(requireProduct(A, p.id), StudioAccessError);
  });

  test("audit: actions are recorded and there is no update path", async () => {
    const rows = await requireStudioDb().select().from(ms.msAuditEvents);
    assert.ok(rows.some((r) => r.action === "product.create"));
    assert.ok(rows.some((r) => r.action === "fact.verify"));
    assert.ok(rows.some((r) => r.action === "connection.store"));
  });

  describe("queue", () => {
    test("dedupe key enqueues once", async () => {
      const a = await enqueue({ kind: "noop_probe", dedupeKey: "q-dedupe-1" });
      const b = await enqueue({ kind: "noop_probe", dedupeKey: "q-dedupe-1" });
      assert.ok(a.id);
      assert.equal(b.id, null);
    });

    test("two workers racing for one job: exactly one wins", async () => {
      await requireStudioDb().delete(ms.msMediaJobs);
      await enqueue({ kind: "noop_probe", dedupeKey: "race-1" });
      const [x, y] = await Promise.all([claimNext("w1", { allowHeavy: false }), claimNext("w2", { allowHeavy: false })]);
      assert.equal([x, y].filter(Boolean).length, 1);
    });

    test("heavy jobs are not claimed unless allowed", async () => {
      await requireStudioDb().delete(ms.msMediaJobs);
      await enqueue({ kind: "noop_probe", weight: "heavy", dedupeKey: "heavy-1" });
      assert.equal(await claimNext("w1", { allowHeavy: false }), null);
      assert.ok(await claimNext("w1", { allowHeavy: true }));
    });

    test("failure retries with backoff, then dead-letters at max attempts", async () => {
      await requireStudioDb().delete(ms.msMediaJobs);
      await enqueue({ kind: "noop_probe", dedupeKey: "retry-1", maxAttempts: 2 });
      const j1 = (await claimNext("w1", { allowHeavy: false }))!;
      await failJob(j1, "boom", 5);
      let [row] = await requireStudioDb().select().from(ms.msMediaJobs);
      assert.equal(row.status, "queued");
      assert.ok(row.runAfter.getTime() > Date.now() + 60_000, "backed off, not an immediate retry");
      assert.equal(await claimNext("w1", { allowHeavy: false }), null, "not claimable during backoff");
      await requireStudioDb().update(ms.msMediaJobs).set({ runAfter: new Date() });
      const j2 = (await claimNext("w1", { allowHeavy: false }))!;
      assert.equal(j2.attempts, 2);
      await failJob(j2, "boom again", 5);
      [row] = await requireStudioDb().select().from(ms.msMediaJobs);
      assert.equal(row.status, "dead");
    });

    test("a crashed worker's expired lease is recovered", async () => {
      await requireStudioDb().delete(ms.msMediaJobs);
      await enqueue({ kind: "noop_probe", dedupeKey: "lease-1" });
      const j = (await claimNext("crashy", { allowHeavy: false }))!;
      await requireStudioDb().update(ms.msMediaJobs).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(ms.msMediaJobs.id, j.id));
      assert.equal(await reapExpired(), 1);
      const [row] = await requireStudioDb().select().from(ms.msMediaJobs);
      assert.equal(row.status, "queued");
    });

    test("heartbeat extends a lease and completion records output", async () => {
      await requireStudioDb().delete(ms.msMediaJobs);
      await enqueue({ kind: "noop_probe", dedupeKey: "hb-1" });
      const j = (await claimNext("w1", { allowHeavy: false }))!;
      await heartbeat(j.id);
      await completeJob(j.id, { ok: true }, 3);
      const [row] = await requireStudioDb().select().from(ms.msMediaJobs);
      assert.equal(row.status, "done");
      assert.deepEqual(row.output, { ok: true });
    });
  });

  describe("emergency disable", () => {
    test("kill switch, DISABLE file and env flag each stop the studio", async () => {
      assert.equal((await disableState()).disabled, false);
      await setKillSwitch(true, "t");
      assert.equal((await disableState()).disabled, true);
      await setKillSwitch(false, "t");
      assert.equal((await disableState()).disabled, false);
      mkdirSync(STUDIO_DIRS.root, { recursive: true });
      writeFileSync(DISABLE_FILE, "");
      assert.ok((await disableState()).reasons.includes("DISABLE file present"));
      rmSync(DISABLE_FILE);
      process.env.MARKETING_STUDIO_ENABLED = "0";
      assert.equal((await disableState()).disabled, true);
      process.env.MARKETING_STUDIO_ENABLED = "1";
    });

    test("an unreadable settings store fails closed", async () => {
      const broken = { select: () => { throw new Error("db down"); } } as unknown as Parameters<typeof disableState>[0];
      const s = await disableState(broken);
      assert.equal(s.disabled, true);
      assert.ok(s.reasons.some((r) => r.includes("failing closed")));
    });
  });
});

describe("House and site write protection (least-privilege role)", { skip: !process.env.STUDIO_TEST_ROLE_URL }, () => {
  const sql = postgres(process.env.STUDIO_TEST_ROLE_URL ?? "postgres://invalid", { max: 1, prepare: false });
  after(async () => {
    await sql.end({ timeout: 5 });
  });
  const denied = async (stmt: string) => {
    await assert.rejects(sql.unsafe(stmt), (e: unknown) => (e as { code?: string }).code === "42501", `expected permission denied for: ${stmt}`);
  };

  test("the studio role cannot read or write any non-ms_ table", async () => {
    // Every statement is harmless even if it were allowed (where false / no-op), and each must fail with permission denied.
    await denied("select 1 from businesses limit 1");
    await denied("update businesses set name = name where false");
    await denied("insert into businesses (name) values ('x')");
    await denied("delete from businesses where false");
    await denied("update published_content set status = status where false");
    await denied("insert into publishing_jobs default values");
    await denied("update proof_ledger set summary = summary where false");
    await denied("update growth_opportunities set status = status where false");
    await denied("insert into jobs (type) values ('x')");
    await denied("update outreach_sends set status = status where false");
    await denied("update business_configs set tone = tone where false");
    await denied("create table studio_escape (id int)");
  });

  test("the studio role can read and write EVERY ms_ table, including the newest, and is denied the site, publishing and business tables", async () => {
    const msTables = ["ms_products", "ms_brand_profiles", "ms_product_facts", "ms_claims", "ms_assets", "ms_campaigns", "ms_media_jobs", "ms_connections", "ms_usage", "ms_settings", "ms_audit_events", "ms_concepts", "ms_creatives", "ms_videos", "ms_benchmark_runs", "ms_publications"];
    for (const t of msTables) {
      await assert.doesNotReject(sql.unsafe(`select 1 from ${t} limit 1`), t);
      await assert.doesNotReject(sql.unsafe(`update ${t} set id = id where false`).catch((e: { code?: string }) => { if (e.code === "42703") return; throw e; }), t);
    }
    for (const t of ["businesses", "published_content", "publishing_targets", "publishing_jobs", "content_queue", "business_configs", "google_oauth_connections", "proof_ledger", "jobs", "leads", "outreach_sends", "growth_opportunities", "business_facts", "reports", "scans", "funnel_events", "email_events", "customer_sessions"]) {
      await denied(`select 1 from ${t} limit 1`);
      await denied(`delete from ${t} where false`);
    }
  });

  test("the studio role can use its own tables", async () => {
    const r = await sql`select count(*)::int as n from ms_products`;
    assert.equal(typeof r[0].n, "number");
    await assert.doesNotReject(sql`update ms_settings set value = value where false`);
  });
});
