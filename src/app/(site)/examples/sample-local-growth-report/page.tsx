import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ReportView } from "@/components/report-view";
import { getDb, reports, scans } from "@/lib/db";
import { getReportWithContext } from "@/lib/report/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sample free report: what the GravyBlock scan shows",
  description:
    "A real free GravyBlock report for GravyBlock's own website: the score, the findings, the Maps snapshot and the competitor table, using only data the scan actually collected.",
  alternates: { canonical: "https://gravyblock.com/examples/sample-local-growth-report" },
};

// The sample is the most recent stored free report for GravyBlock's own business, a business we operate. It is the same
// report format a visitor gets, shown unmodified. Nothing here is invented: where the scan collected no data for a section
// (for example AI probes, which run once GravyBlock is working on a business) the section says so.
const FALLBACK_REPORT_PUBLIC_ID = "XhVx4rrzXq8h";

async function findSampleReportPublicId(): Promise<string> {
  const db = getDb();
  const selfId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID?.trim();
  if (!db || !selfId) return FALLBACK_REPORT_PUBLIC_ID;
  const [row] = await db
    .select({ publicId: reports.publicId })
    .from(reports)
    .innerJoin(scans, eq(scans.id, reports.scanId))
    .where(eq(scans.businessId, selfId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row?.publicId ?? FALLBACK_REPORT_PUBLIC_ID;
}

export default async function SampleReportPage() {
  const publicId = await findSampleReportPublicId();
  const record = await getReportWithContext(publicId);
  if (!record) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Sample report</h1>
        <p className="mt-4 text-zinc-600">The sample report could not be loaded. The free scan produces the same report for your business.</p>
        <p className="mt-6">
          <Link href="/scan" className="inline-block rounded-full bg-red-600 px-7 py-3 text-sm font-semibold text-white hover:bg-red-500">
            Run my free scan →
          </Link>
        </p>
      </div>
    );
  }
  const generated = new Date(record.payload.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">A real free report, shown as a sample</p>
          <p className="mt-1">
            This is the free scan of GravyBlock&apos;s own business, generated {generated}. It is not a mockup and nothing in it was edited.
            Your report shows your own business, and the free scan needs no email to read it.
          </p>
        </div>
      </div>
      <ReportView payload={record.payload} publicId={publicId} businessId={record.businessId ?? undefined} sample />
    </>
  );
}
