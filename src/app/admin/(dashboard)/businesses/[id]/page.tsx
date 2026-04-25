import Link from "next/link";
import { getAutopilotWorkspace } from "@/lib/autopilot/repository";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { notFound } from "next/navigation";
import { getWorkspaceBundle, listLeadsForBusiness } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminBusinessDetailPage({ params }: Props) {
  const { id } = await params;
  const bundle = await getWorkspaceBundle(id);
  if (!bundle) notFound();
  const leads = await listLeadsForBusiness(id);
  const autopilot = await getAutopilotWorkspace(id);
  const tier = normalizePlanTierFromDb(bundle.business.planTier);
  const features = planFeatures(tier);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">Business ops</p>
          <h1 className="text-3xl font-semibold text-zinc-900">{bundle.business.name}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Plan <span className="font-semibold text-zinc-900">{bundle.business.planTier}</span> · Updated{" "}
            {new Date(bundle.business.updatedAt).toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Cadence <span className="font-semibold text-zinc-900">{features.refreshCadenceLabel}</span> · Launch price{" "}
            {features.monthlyPrice ? `$${features.launchPrice.toFixed(2)}/mo` : "$0"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <Link
            href={`/workspace/${id}`}
            className="rounded-full bg-red-600 px-4 py-2 text-white hover:bg-red-500"
          >
            Open workspace
          </Link>
          <Link href="/admin/businesses" className="rounded-full border border-zinc-300 px-4 py-2 text-zinc-800">
            All businesses
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Snapshots" value={String(bundle.snapshots.length)} />
        <Stat label="Open recs" value={String(bundle.recommendations.filter((r) => r.status === "open").length)} />
        <Stat label="Content ideas" value={String(bundle.content.length)} />
        <Stat label="Social URLs stored" value={String(bundle.socialProfiles?.length ?? 0)} />
        <Stat label="Automation jobs" value={String(autopilot.automationJobs.length)} />
        <Stat label="Upcoming jobs" value={String(autopilot.upcomingJobs.length)} />
        <Stat label="Publishing jobs" value={String(autopilot.publishingJobs.length)} />
        <Stat label="Citation issues" value={String(autopilot.citationIssues.length)} />
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Automation status</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-zinc-50 p-3 text-sm">
            <p className="font-semibold text-zinc-900">Latest run</p>
            <p className="text-zinc-600">
              {autopilot.automationJobs[0]
                ? `${autopilot.automationJobs[0].type} · ${autopilot.automationJobs[0].status}`
                : "No completed/pending jobs yet"}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3 text-sm">
            <p className="font-semibold text-zinc-900">Upcoming</p>
            <p className="text-zinc-600">
              {autopilot.upcomingJobs[0]?.runAfter
                ? `${autopilot.upcomingJobs[0].type} at ${new Date(autopilot.upcomingJobs[0].runAfter).toLocaleString()}`
                : "No pending scheduled work"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Publishing execution</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.publishingJobs.slice(0, 10).map((job) => (
              <li key={job.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{job.id}</p>
                <p className="text-xs uppercase text-zinc-500">{job.status}</p>
                {job.responseLog ? <p className="text-xs text-zinc-600">{job.responseLog}</p> : null}
              </li>
            ))}
            {!autopilot.publishingJobs.length ? <li className="text-zinc-500">No publishing jobs yet.</li> : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Published content</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.publishedContent.slice(0, 10).map((item) => (
              <li key={item.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {item.channel} · {item.status}
                </p>
                {item.publicUrl ? (
                  <a className="text-xs text-red-800 underline" href={item.publicUrl} target="_blank" rel="noreferrer">
                    {item.publicUrl}
                  </a>
                ) : null}
              </li>
            ))}
            {!autopilot.publishedContent.length ? <li className="text-zinc-500">No published content yet.</li> : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Outreach statuses</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.operatorTasks
              .filter((task) => task.queue === "outreach_ops")
              .slice(0, 10)
              .map((task) => (
                <li key={task.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                  <p className="font-medium text-zinc-900">{task.title}</p>
                  <p className="text-xs uppercase text-zinc-500">{task.status}</p>
                  {task.detail ? <p className="text-xs text-zinc-600">{task.detail}</p> : null}
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Authority/backlink statuses</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {autopilot.backlinkQueue.slice(0, 10).map((row) => (
              <li key={row.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="font-medium text-zinc-900">{row.sourceName}</p>
                <p className="text-xs uppercase text-zinc-500">
                  {row.status} · quality {row.qualityScore ?? "n/a"}
                </p>
                {row.targetUrl ? (
                  <a className="text-xs text-red-800 underline" href={row.targetUrl} target="_blank" rel="noreferrer">
                    {row.targetUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Profile</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Field k="Website" v={bundle.business.website} />
          <Field k="Phone" v={bundle.business.phone} />
          <Field k="Address" v={bundle.business.address} />
          <Field k="Maps" v={bundle.business.googleMapsUri} />
          <Field k="Vertical" v={bundle.business.vertical} />
          <Field k="Brand notes" v={bundle.business.brandNotes} />
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Leads tied to this business</h2>
        <table className="mt-4 min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Pipeline</th>
              <th className="py-2">Source</th>
              <th className="py-2">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="py-2 font-medium text-zinc-900">{l.name}</td>
                <td className="py-2 text-zinc-700">{l.email}</td>
                <td className="py-2 text-zinc-700">{l.pipelineStatus}</td>
                <td className="py-2 text-zinc-700">{l.source}</td>
                <td className="py-2 text-zinc-500">{new Date(l.lastSeenAt ?? l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!leads.length ? (
              <tr>
                <td className="py-4 text-zinc-500" colSpan={5}>
                  No leads with this business ID yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Latest recommendations (sample)</h2>
        <ul className="mt-4 space-y-2 text-sm text-zinc-700">
          {bundle.recommendations.slice(0, 8).map((r) => (
            <li key={r.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-900">{r.title}</span>{" "}
              <span className="text-xs uppercase text-zinc-500">({r.lane})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Ranking checks</h2>
        <ul className="mt-4 space-y-2 text-sm text-zinc-700">
          {bundle.rankingChecks?.slice(0, 12).map((row) => (
            <li key={row.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-900">{row.query}</span>
              <span className="text-zinc-600">
                {" "}
                · est position {row.estimatedPosition ?? "n/a"} · source {row.source}
              </span>
            </li>
          ))}
          {!bundle.rankingChecks?.length ? <li className="text-zinc-500">No ranking checks yet.</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Discovered social profiles</h2>
        <p className="mt-1 text-sm text-zinc-600">
          From public scans (homepage / JSON-LD). Not platform analytics — confidence and activity hints are internal
          heuristics.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-700">
          {bundle.socialProfiles?.map((row) => (
            <li key={row.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-900">{row.platform}</span>
              <span className="text-zinc-600"> · </span>
              <a className="font-medium text-red-800 underline" href={row.url} target="_blank" rel="noreferrer">
                {row.url}
              </a>
              <span className="block text-xs text-zinc-500">
                source {row.discoverySource} · confidence {row.confidence} · {row.activityHint}
                {row.handle ? ` · ${row.handle}` : null}
              </span>
              {row.notes ? <span className="mt-1 block text-xs text-zinc-500">{row.notes}</span> : null}
            </li>
          ))}
          {!bundle.socialProfiles?.length ? (
            <li className="text-zinc-500">No social profiles stored for this business yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Place profile snapshots</h2>
        <ul className="mt-4 space-y-2 text-sm text-zinc-700">
          {bundle.placeProfiles?.slice(0, 5).map((row) => (
            <li key={row.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="font-semibold text-zinc-900">{row.displayName}</span>
              <span className="text-zinc-600"> · {row.placeId} · {row.primaryType ?? "unknown type"}</span>
            </li>
          ))}
          {!bundle.placeProfiles?.length ? <li className="text-zinc-500">No place snapshots yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{k}</dt>
      <dd className="text-zinc-900">{v && String(v).trim() ? v : "—"}</dd>
    </div>
  );
}
