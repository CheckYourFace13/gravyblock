import Link from "next/link";
import { syncCheckoutSession } from "@/lib/billing/stripe-events";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage({ params, searchParams }: Props) {
  const { businessId } = await params;
  const { session_id: sessionId } = await searchParams;

  let syncMessage = "Billing details will finalize shortly after Stripe webhook delivery.";
  if (sessionId) {
    try {
      await syncCheckoutSession(sessionId);
      syncMessage = "Stripe checkout synced. Plan and subscription state were updated.";
    } catch (error) {
      console.error("[billing success] session sync failed", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      syncMessage = "Checkout succeeded, but sync is waiting on webhook processing.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold text-zinc-900">Billing checkout complete</h1>
      <p className="text-zinc-700">{syncMessage}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/workspace/${businessId}`}
          className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500"
        >
          Back to workspace
        </Link>
        <Link
          href={`/workspace/${businessId}#billing`}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-900"
        >
          Open billing section
        </Link>
      </div>
    </div>
  );
}
