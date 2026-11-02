#!/usr/bin/env node
// External production-health monitor for the Marketing Studio video benchmark. It only OBSERVES and, on a breach, writes the Studio
// emergency-disable file so the worker kills its renders at once. It never starts a render and never touches production services.
//   node marketing-benchmark-monitor.mjs <out.jsonl> <total-seconds>
// Samples every 2 seconds: public and local GravyBlock latency and status, RentalNoodle, TheDrinkPlace, PostgreSQL round trip and
// connection count, load, available memory, free disk. The first 20 samples are the baseline the stop rules compare against.
import { appendFileSync, existsSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";

const [out = "/root/bench/monitor.jsonl", totalArg = "600"] = process.argv.slice(2);
const total = Number(totalArg);
const DISABLE = "/var/lib/gravyblock-marketing/DISABLE";
const TARGETS = [
  ["gravyblock_public", "https://gravyblock.com/api/health"],
  ["gravyblock_local", "http://127.0.0.1:3000/api/health"],
  ["rentalnoodle", "https://rentalnoodle.com/"],
  ["thedrinkplace", "https://thedrinkplace.com/"],
];

async function timeHttp(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
    await res.arrayBuffer();
    return { ms: Math.round(performance.now() - t0), status: res.status };
  } catch {
    return { ms: Math.round(performance.now() - t0), status: 0 };
  }
}

function timePg() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    execFile("sudo", ["-u", "postgres", "psql", "-d", "gravyblock_prod", "-Atc", "select count(*) from pg_stat_activity"], { timeout: 8000 }, (err, stdout) => {
      resolve({ ms: Math.round(performance.now() - t0), ok: !err, connections: err ? null : Number(String(stdout).trim()) });
    });
  });
}

const memAvail = () => Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))?.[1] ?? 0) * 1024;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

const baseline = Object.fromEntries(TARGETS.map(([k]) => [k, []]));
let baselinePg = [];
let breached = null;
const start = Date.now();

while (Date.now() - start < total * 1000 && !breached) {
  const t = Date.now();
  const http = Object.fromEntries(await Promise.all(TARGETS.map(async ([k, u]) => [k, await timeHttp(u)])));
  const pg = await timePg();
  const fsx = statfsSync("/");
  const sample = {
    t: new Date(t).toISOString(),
    http,
    pg,
    load1: os.loadavg()[0],
    memAvailMB: Math.round(memAvail() / 1048576),
    diskFreeGB: +((fsx.bavail * fsx.bsize) / 1073741824).toFixed(1),
    studioDisabled: existsSync(DISABLE),
  };
  appendFileSync(out, JSON.stringify(sample) + "\n");

  const idx = baselinePg.length;
  if (idx < 20) {
    for (const [k] of TARGETS) baseline[k].push(http[k].ms);
    baselinePg.push(pg.ms);
  } else {
    // Stop rules. Any one trips the Studio emergency disable and ends the monitor.
    for (const [k] of TARGETS) {
      const base = Math.max(median(baseline[k]), 40);
      if (http[k].status >= 500 || http[k].status === 0) breached = `${k} returned ${http[k].status || "no response"}`;
      else if (http[k].ms > Math.max(base * 4, 1500)) breached = `${k} latency ${http[k].ms}ms vs baseline ${base}ms`;
    }
    if (!pg.ok) breached = breached ?? "PostgreSQL query failed";
    else if (pg.ms > Math.max(median(baselinePg) * 5, 800)) breached = breached ?? `PostgreSQL round trip ${pg.ms}ms vs baseline ${median(baselinePg)}ms`;
    if (sample.memAvailMB < 700) breached = breached ?? `available memory ${sample.memAvailMB}MB`;
    if (sample.diskFreeGB < 12) breached = breached ?? `free disk ${sample.diskFreeGB}GB`;
  }
  if (breached) {
    writeFileSync(DISABLE, `benchmark monitor: ${breached}\n`);
    appendFileSync(out, JSON.stringify({ t: new Date().toISOString(), BREACH: breached, action: "wrote Studio DISABLE file" }) + "\n");
    console.log("BREACH:", breached);
  }
  const wait = 2000 - (Date.now() - t);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
console.log(breached ? `stopped: ${breached}` : "monitor finished without a breach");
process.exit(breached ? 2 : 0);
