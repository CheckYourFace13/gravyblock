import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { FunnelBeacon } from "@/components/funnel-beacon";
import { getReportWithContext } from "@/lib/report/repository";
import { verifyReportUnlockToken } from "@/lib/report/unlock-token";
import { proofPointForFinding } from "@/lib/proof/sales";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ unlock?: string; plan?: string; promo?: string }>;
};

import { normalizePromoCode } from "@/lib/stripe/promo-codes";
const normalizePromoCodeIntent = normalizePromoCode;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const record = await getReportWithContext(publicId);
  if (!record) return { title: "Report not found — GravyBlock" };
  const title = record.payload.summary.title;
  return {
    title: `${title} — GravyBlock`,
    description: record.payload.summary.verdict,
  };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const query = await searchParams;
  const record = await getReportWithContext(publicId);
  if (!record) notFound();
  const initiallyUnlocked = verifyReportUnlockToken(publicId, query.unlock);
  const raw = query.plan?.toLowerCase() ?? "";
  const selectedPlan = (["starter", "growth", "pro", "agency"].includes(raw)
    ? raw
    : raw === "base" || raw === "entry" ? "starter" : null) as "starter" | "growth" | "pro" | "agency" | null;
  const promoCode = normalizePromoCodeIntent(query.promo);
  const topFixId = record.payload.prioritizedFixes?.[0]?.id ?? null;
  const proof = await proofPointForFinding(topFixId).catch(() => null);
  return (
    <>
      <FunnelBeacon eventType="report_landed" businessId={record.businessId} reportPublicId={publicId} proofType={proof?.category ?? "none"} />
      {proof ? (
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">Seen this before</p>
            <p className="mt-1">{proof.text}</p>
            <p className="mt-1 text-xs text-emerald-800">Verified result from GravyBlock&apos;s own activity log.</p>
          </div>
        </div>
      ) : null}
      <ReportView
        payload={record.payload}
        publicId={publicId}
        businessId={record.businessId}
        initiallyUnlocked={initiallyUnlocked}
        selectedPlan={selectedPlan}
        promoCode={promoCode}
      />
    </>
  );
}
