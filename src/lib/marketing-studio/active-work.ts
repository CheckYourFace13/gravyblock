/**
 * Registry of running child work (Chromium, FFmpeg). The worker's watchdog calls cancelActiveWork() when the emergency disable
 * trips or a hard timeout passes, so a stop request ends the actual processes, not just the bookkeeping.
 */
type Killer = () => void;
const killers = new Set<Killer>();

export function registerKiller(k: Killer): () => void {
  killers.add(k);
  return () => killers.delete(k);
}

export function cancelActiveWork(): number {
  const n = killers.size;
  for (const k of [...killers]) {
    try {
      k();
    } catch {
      /* best effort */
    }
  }
  killers.clear();
  return n;
}

export function activeWorkCount(): number {
  return killers.size;
}
