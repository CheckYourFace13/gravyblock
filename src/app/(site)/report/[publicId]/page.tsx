import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { getReportWithContext } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ publicId: string }> };

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

export default async function ReportPage({ params }: Props) {
  const { publicId } = await params;
  const record = await getReportWithContext(publicId);
  if (!record) notFound();
  return <ReportView payload={record.payload} publicId={publicId} businessId={record.businessId} />;
}
