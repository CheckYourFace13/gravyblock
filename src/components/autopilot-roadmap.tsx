import { ROADMAP_LANES, type RoadmapLane, type RoadmapRow } from "@/lib/growth/roadmap";

function groupByLane(rows: RoadmapRow[]) {
  const map = new Map<RoadmapLane, RoadmapRow[]>();
  for (const lane of ROADMAP_LANES) {
    map.set(lane.lane, []);
  }
  for (const row of rows) {
    map.get(row.lane)?.push(row);
  }
  return map;
}

export function AutopilotRoadmap({ rows }: { rows: RoadmapRow[] }) {
  const grouped = groupByLane(rows);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Autopilot roadmap</h2>
        <p className="text-sm text-zinc-600">
          Prioritized like an operator runbook: close urgent gaps, queue leverage work, then keep monitoring so listings
          and site quality do not regress in silence.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {ROADMAP_LANES.map((lane) => {
          const items = grouped.get(lane.lane) ?? [];
          return (
            <article key={lane.lane} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">{lane.title}</p>
              <p className="mt-1 text-sm text-zinc-600">{lane.subtitle}</p>
              <ul className="mt-4 space-y-3">
                {items.slice(0, 6).map((item, idx) => (
                  <li key={`${lane.lane}-${item.title}-${idx}`} className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-900">{item.title}</span>
                    <span className="text-zinc-600"> — {item.detail}</span>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {item.category} · impact {item.impact}
                    </p>
                  </li>
                ))}
                {!items.length ? (
                  <li className="text-sm text-zinc-500">
                    No items in this lane for this scan — usually a sign scores are strong here, or the next actions live
                    in another lane above.
                  </li>
                ) : null}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
