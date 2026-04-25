import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { getReportWithContext } from "@/lib/report/repository";
import { verifyReportUnlockToken } from "@/lib/report/unlock-token";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ unlock?: string; plan?: string; promo?: string }>;
};

function normalizePromoCodeIntent(raw?: string): "ILoveYouFree" | "ILikeYou50" | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "ILoveYouFree" || value === "ILikeYou50") return value;
  return null;
}

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
  const selectedPlan = raw === "pro" ? "pro" : raw === "base" || raw === "entry" ? "base" : null;
  const promoCode = normalizePromoCodeIntent(query.promo);
  return (
    <ReportView
      payload={record.payload}
      publicId={publicId}
      businessId={record.businessId}
      initiallyUnlocked={initiallyUnlocked}
      selectedPlan={selectedPlan}
      promoCode={promoCode}
    />
  );
}
