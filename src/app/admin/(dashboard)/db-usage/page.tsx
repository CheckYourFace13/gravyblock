import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Database usage" };

type Row = Record<string, unknown>;

async function q(label: string, run: () => Promise<unknown>): Promise<{ label: string; rows: Row[]; error?: string }> {
  try {
    return { label, rows: (await run()) as Row[] };
  } catch (e) {
    const m = (e as Error & { cause?: { message?: string } }).cause?.message ?? (e as Error).message;
    return { label, rows: [], error: m.slice(-220) };
  }
}

/** Read-only: which database this deployment really talks to, and what is consuming it. No credentials are ever shown. */
export default async function DbUsagePage() {
  const db = getDb();
  if (!db) return <p className="p-8 text-sm">No database configured.</p>;
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "unparseable";
    }
  })();
  const sections = await Promise.all([
    q("identity", () => db.execute(sql`select current_database() as database, current_setting('neon.endpoint_id', true) as neon_endpoint_id, current_setting('neon.project_id', true) as neon_project_id, version() as version`)),
    q("connections", () => db.execute(sql`select coalesce(nullif(application_name,''),'(none)') as app, state, count(*)::int as n from pg_stat_activity where datname = current_database() group by 1,2 order by n desc`)),
    q("current activity (what each connection is doing right now)", () =>
      db.execute(sql`select state, coalesce(wait_event_type,'') as wait, round(extract(epoch from (now() - backend_start))::numeric / 60) as conn_age_min, round(extract(epoch from (now() - query_start))::numeric) as query_age_s, left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 140) as query from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() order by query_start desc nulls last`),
    ),
    q("database stats", () => db.execute(sql`select numbackends, xact_commit, xact_rollback, blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated, stats_reset from pg_stat_database where datname = current_database()`)),
    q("job rows written, by type (24h / 7d)", () =>
      db.execute(sql`select type, count(*) filter (where created_at > now() - interval '24 hours')::int as h24, count(*) filter (where created_at > now() - interval '7 days')::int as d7 from jobs where created_at > now() - interval '7 days' group by type order by h24 desc, d7 desc limit 30`),
    ),
    q("top statements by total time", () =>
      db.execute(sql`select calls::bigint as calls, round(total_exec_time::numeric/1000, 1) as total_s, round(mean_exec_time::numeric, 2) as mean_ms, rows::bigint as rows, left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 150) as query from pg_stat_statements order by total_exec_time desc limit 20`),
    ),
    q("tables by sequential-scan rows read (cumulative)", () =>
      db.execute(sql`select relname as tbl, seq_scan::bigint as seq_scans, seq_tup_read::bigint as seq_rows_read, idx_scan::bigint as idx_scans, n_live_tup::bigint as live_rows, n_tup_ins::bigint as inserts, n_tup_upd::bigint as updates, pg_size_pretty(pg_total_relation_size(relid)) as size from pg_stat_user_tables order by seq_tup_read desc nulls last limit 15`),
    ),
    q("largest tables", () =>
      db.execute(sql`select relname as tbl, n_live_tup::bigint as live_rows, pg_size_pretty(pg_total_relation_size(relid)) as size from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 8`),
    ),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-xs">
      <h1 className="text-xl font-semibold text-zinc-900">Database usage</h1>
      <p className="text-zinc-600">Configured host (no credentials): <span className="font-mono">{host}</span></p>
      {sections.map((s) => (
        <section key={s.label} className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-900">{s.label}</h2>
          {s.error ? <p className="text-amber-700">Unavailable: {s.error}</p> : null}
          {s.rows.map((r, i) => (
            <p key={i} className="break-all font-mono">{JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v))}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
