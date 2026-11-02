// Queues the 15s, 30s and 60s benchmark renders THROUGH THE STUDIO QUEUE, strictly one at a time, and waits for each. The renders run
// inside the Studio worker (its own cgroup, nice 19, kill switch). Stops at the first failure or if the Studio is disabled (for
// example by the external monitor tripping on a production health breach).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-benchmark-run.ts [15,30,60] [gapSeconds]
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { DISABLE_FILE } from "../../src/lib/marketing-studio/config";
import { enqueueBenchmark } from "../../src/lib/marketing-studio/video/queue";

const sizes = (process.argv[2] ?? "15,30,60").split(",").map(Number) as Array<15 | 30 | 60>;
const gap = Number(process.argv[3] ?? 60);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = requireStudioDb();
  for (const secs of sizes) {
    if (existsSync(DISABLE_FILE)) {
      console.log("Studio is disabled; stopping the benchmark");
      break;
    }
    const { id } = await enqueueBenchmark(secs, db);
    console.log(`${new Date().toISOString()} queued ${secs}s benchmark job ${id}`);
    let job;
    const deadline = Date.now() + 25 * 60_000;
    for (;;) {
      [job] = await db.select().from(ms.msMediaJobs).where(eq(ms.msMediaJobs.id, id!));
      if (job.status === "done" || job.status === "dead" || job.status === "cancelled") break;
      if (job.status === "queued" && job.attempts > 0 && job.error) break; // failed once, benchmark jobs do not retry
      if (existsSync(DISABLE_FILE) || Date.now() > deadline) break;
      await sleep(2000);
    }
    console.log(`${new Date().toISOString()} job ${job!.status}: ${JSON.stringify(job!.output ?? job!.error)}`);
    if (job!.status !== "done") break;
    await sleep(gap * 1000);
  }
  await closeStudioDb();
}
void main();
