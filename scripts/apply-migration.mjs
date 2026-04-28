#!/usr/bin/env node
/**
 * Apply a SQL migration file to the production database.
 *
 * Usage:
 *   node scripts/apply-migration.mjs drizzle/0001_add_focus_area.sql
 *   node scripts/apply-migration.mjs drizzle/0001_add_focus_area.sql --dry-run
 *
 * Requires DATABASE_URL in environment (or .env file).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Load .env if present
try {
  const dotenv = require("dotenv");
  dotenv.config();
} catch {}

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <sql-file> [--dry-run]");
  process.exit(1);
}

const sql = readFileSync(file, "utf8").trim();

console.log("=".repeat(60));
console.log(`Migration file : ${file}`);
console.log(`Dry run        : ${dryRun}`);
console.log(`DATABASE_URL   : ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ":***@") : "(not set)"}`);
console.log("=".repeat(60));
console.log("\nSQL to run:\n");
console.log(sql);
console.log("\n" + "=".repeat(60));

if (dryRun) {
  console.log("\nDry run — no changes made.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("\nERROR: DATABASE_URL is not set. Cannot connect.");
  process.exit(1);
}

const postgres = require("postgres");
const db = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("\nApplying migration...");
  await db.unsafe(sql);
  console.log("Done. Migration applied successfully.");
} catch (err) {
  console.error("\nERROR applying migration:", err.message);
  process.exit(1);
} finally {
  await db.end();
}
