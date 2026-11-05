import "./setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { recordUsage, usageSummary } from "../runtime";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);

describe("usage accounting (database)", { skip: !HAVE_DB }, () => {
  before(async () => {
    await requireStudioDb().delete(ms.msUsage);
  });
  after(async () => {
    await requireStudioDb().delete(ms.msUsage);
    await closeStudioDb();
  });

  test("a month of byte-sized usage past the 32-bit integer range sums instead of failing the dashboard", async () => {
    await recordUsage("render_output_bytes", 2_000_000_000);
    await recordUsage("render_output_bytes", 2_000_000_000);
    await recordUsage("jobs", 3);
    const s = await usageSummary();
    assert.equal(s.render_output_bytes, 4_000_000_000);
    assert.equal(s.jobs, 3);
  });
});
