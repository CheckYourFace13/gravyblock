import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { getReportWithContext } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ publicId: string }> };

export default async function AdminReportDetailPage({ params }: Props) {
  const { publicId } = await params;
  const record = await getReportWithContext(publicId);
  if (!record) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">Admin view</p>
          <h1 className="text-2xl font-semibold text-zinc-900">Report detail</h1>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/admin/reports" className="text-zinc-600 hover:text-zinc-900">
            ← All reports
          </Link>
          <Link href={`/report/${publicId}`} className="text-red-700 hover:text-red-800">
            Public link
          </Link>
        </div>
      </div>
      <ReportView payload={record.payload} publicId={publicId} businessId={record.businessId} />
    </div>
  );
}
