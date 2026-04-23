import Link from "next/link";

type Props = { params: Promise<{ businessId: string }> };

export default async function BillingCancelPage({ params }: Props) {
  const { businessId } = await params;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-zinc-900">Checkout canceled</h1>
      <p className="text-zinc-700">No billing changes were applied. You can restart checkout any time.</p>
      <Link
        href={`/workspace/${businessId}#billing`}
        className="inline-flex rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        Return to billing
      </Link>
    </div>
  );
}
