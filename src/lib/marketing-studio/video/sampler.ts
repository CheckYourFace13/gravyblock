/**
 * Resource sampler for heavy jobs. Reads the Studio cgroup's own counters (cgroup v2): current and peak memory, CPU time, plus the
 * size of the job's temporary directory. Peaks come from measurement, never estimates; benchmark thresholds are chosen from these.
 */
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

function cgroupDir(): string | null {
  try {
    const rel = readFileSync("/proc/self/cgroup", "utf8").trim().split("\n").pop()?.split("::")[1];
    return rel ? path.join("/sys/fs/cgroup", rel) : null;
  } catch {
    return null;
  }
}

function readNum(file: string): number | null {
  try {
    const v = readFileSync(file, "utf8").trim();
    return v === "max" ? null : Number(v);
  } catch {
    return null;
  }
}

function cpuUsec(dir: string): number | null {
  try {
    const m = /usage_usec (\d+)/.exec(readFileSync(path.join(dir, "cpu.stat"), "utf8"));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirBytes(p);
    else if (e.isFile()) total += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

export type SamplerResult = { wallMs: number; peakMemoryBytes: number | null; peakCpuPercent: number | null; avgCpuPercent: number | null; peakTmpBytes: number; samples: number; memoryLimitBytes: number | null };

export function startSampler(tmpDir: string, intervalMs = 500) {
  const dir = cgroupDir();
  const started = Date.now();
  const startCpu = dir ? cpuUsec(dir) : null;
  let lastCpu = startCpu;
  let lastAt = started;
  let peakMem = 0;
  let peakCpu = 0;
  let peakTmp = 0;
  let samples = 0;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      samples++;
      if (dir) {
        const cur = readNum(path.join(dir, "memory.current"));
        if (cur !== null) peakMem = Math.max(peakMem, cur);
        const cpu = cpuUsec(dir);
        const now = Date.now();
        if (cpu !== null && lastCpu !== null && now > lastAt) {
          // CPU used over the interval, as a percentage of ONE core (the cgroup quota caps this at its CPUQuota).
          peakCpu = Math.max(peakCpu, ((cpu - lastCpu) / 1000 / (now - lastAt)) * 100);
          lastCpu = cpu;
          lastAt = now;
        }
      }
      peakTmp = Math.max(peakTmp, await dirBytes(tmpDir));
    } finally {
      busy = false;
    }
  }, intervalMs);
  return {
    async stop(): Promise<SamplerResult> {
      clearInterval(timer);
      const wallMs = Date.now() - started;
      peakTmp = Math.max(peakTmp, await dirBytes(tmpDir));
      const kernelPeak = dir ? readNum(path.join(dir, "memory.peak")) : null;
      const endCpu = dir ? cpuUsec(dir) : null;
      return {
        wallMs,
        peakMemoryBytes: kernelPeak ?? (peakMem || null),
        peakCpuPercent: dir ? Math.round(peakCpu) : null,
        avgCpuPercent: endCpu !== null && startCpu !== null && wallMs > 0 ? Math.round(((endCpu - startCpu) / 1000 / wallMs) * 100) : null,
        peakTmpBytes: peakTmp,
        samples,
        memoryLimitBytes: dir ? readNum(path.join(dir, "memory.max")) : null,
      };
    },
  };
}
