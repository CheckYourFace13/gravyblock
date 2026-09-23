import type { RoadmapRow } from "@/lib/growth/roadmap";
import { describeAutopilotAction } from "@/lib/growth/autopilot-actions";

function impactRank(i: "high" | "medium" | "low") {
  return i === "high" ? 3 : i === "medium" ? 2 : 1;
}

// Capped and ranked — not a giant checklist. Shows what matters most and
// what GravyBlock would actually do about it, not a to-do list for you.
const MAX_SHOWN = 6;

export function AutopilotRoadmap({ rows }: { rows: RoadmapRow[] }) {
  const seenTitles = new Set<string>();
  const top = rows
    .slice()
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact))
    .filter((row) => {
      const key = row.title.trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, MAX_SHOWN);

  if (!top.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">What GravyBlock would do about this</h2>
        <p className="text-sm text-zinc-600">
          Not a to-do list for you — here's what runs automatically once Autopilot is on, and what it verifies afterward.
        </p>
      </div>
      <div className="space-y-3">
        {top.map((row, idx) => {
          const action = describeAutopilotAction(row.category);
          return (
            <article key={`${row.category}-${row.title}-${idx}`} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-zinc-900">{row.title}</p>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  {row.impact} impact
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{row.detail}</p>
              <dl className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-red-700">GravyBlock would</dt>
                  <dd className="mt-0.5 text-xs text-zinc-700">{action.whatWeDo}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Connection needed</dt>
                  <dd className="mt-0.5 text-xs text-zinc-700">{action.connectionNeeded ?? "None — starts on signup"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Then verifies</dt>
                  <dd className="mt-0.5 text-xs text-zinc-700">{action.verify}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
