import { getBusinessIssues, type BusinessIssue } from "@/lib/audit/issue-tracker";
import { CopyChecklistButton } from "./copy-checklist-button";

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-600",
};

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function OpenIssueRow({ issue }: { issue: BusinessIssue }) {
  return (
    <li className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">{issue.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low}`}>
          {issue.severity}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-600">{issue.detail}</p>
      <p className="mt-1.5 text-[11px] text-zinc-400">First flagged {formatDate(issue.firstSeenAt)}</p>
    </li>
  );
}

function ResolvedIssueRow({ issue }: { issue: BusinessIssue }) {
  return (
    <li className="flex items-start gap-2 rounded-xl border border-green-100 bg-green-50/60 px-4 py-2.5">
      <span className="mt-0.5 shrink-0 text-green-600">✓</span>
      <div>
        <p className="text-sm font-medium text-zinc-700 line-through decoration-green-400">{issue.title}</p>
        <p className="text-[11px] text-green-700">Fixed {issue.resolvedAt ? formatDate(issue.resolvedAt) : ""}</p>
      </div>
    </li>
  );
}

export async function IssueTrackerPanel({ businessId }: { businessId: string }) {
  const { open, resolved } = await getBusinessIssues(businessId);

  if (open.length === 0 && resolved.length === 0) return null;

  const checklistText = open.length
    ? [
        "Website fix list — GravyBlock",
        "",
        ...open.map((issue, i) => `${i + 1}. ${issue.title}\n   ${issue.detail}`),
      ].join("\n")
    : "";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Website fix list</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Tracked automatically on every refresh — checked off as soon as we see it&apos;s fixed.
          </p>
        </div>
        {open.length > 0 ? <CopyChecklistButton text={checklistText} /> : null}
      </div>

      {open.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {open.map((issue) => (
            <OpenIssueRow key={issue.id} issue={issue} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-medium text-green-700">Nothing outstanding — your site is clean on everything we check.</p>
      )}

      {resolved.length > 0 ? (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recently fixed</p>
          <ul className="space-y-1.5">
            {resolved.map((issue) => (
              <ResolvedIssueRow key={issue.id} issue={issue} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
