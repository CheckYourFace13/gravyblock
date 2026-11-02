import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { FunnelBeacon } from "@/components/funnel-beacon";
import { getReportWithContext } from "@/lib/report/repository";
import { getAiVisibilityStats } from "@/lib/ai-visibility/llm-probes";
import { proofPointForFinding } from "@/lib/proof/sales";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const record = await getReportWithContext(publicId);
  if (!record) return { title: "Report not found", robots: { index: false, follow: false } };
  const title = record.payload.summary.title;
  return {
    title: `${title}`,
    description: record.payload.summary.verdict,
    // Reports are private links sent to a specific business, not pages to index.
    robots: { index: false, follow: false },
  };
}

export default async function ReportPage({ params }: Props) {
  const { publicId } = await params;
  const record = await getReportWithContext(publicId);
  if (!record) notFound();
  // First of the top findings for which the Proof Ledger holds a matching, verified result.
  let proof: Awaited<ReturnType<typeof proofPointForFinding>> = null;
  for (const fix of (record.payload.prioritizedFixes ?? []).slice(0, 4)) {
    proof = await proofPointForFinding(fix.id).catch(() => null);
    if (proof) break;
  }
  // Real AI answer probes only. Free-scan businesses usually have none, and the panel then says so.
  const stats = record.businessId ? await getAiVisibilityStats(record.businessId).catch(() => null) : null;
  const aiProbes = stats && stats.total > 0 && "recentChecks" in stats
    ? {
        total: stats.total,
        mentioned: stats.mentioned,
        byEngine: stats.byEngine,
        recent: (stats.recentChecks ?? []).map((c) => ({
          engine: c.engine,
          prompt: c.prompt,
          mentionFound: c.mentionFound,
          citationUrl: c.citationUrl ?? null,
          sentiment: c.sentiment ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      }
    : null;
  return (
    <>
      <FunnelBeacon eventType="report_landed" businessId={record.businessId} reportPublicId={publicId} proofType={proof?.category ?? "none"} />
      {proof ? (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">A related result GravyBlock verified</p>
            <p className="mt-1">{proof.text}</p>
            <p className="mt-1 text-xs text-emerald-800">
              {proof.level >= 2 ? "Measured search/visibility result" : "Verified action"} from GravyBlock&apos;s own activity log.
            </p>
          </div>
        </div>
      ) : null}
      <ReportView
        payload={record.payload}
        publicId={publicId}
        businessId={record.businessId}
        aiProbes={aiProbes}
      />
    </>
  );
}
