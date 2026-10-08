import Link from "next/link";
import { HomeSummary } from "../../home-summary";
import { syncCheckoutSession } from "@/lib/billing/stripe-events";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

type Props = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ session_id?: string }>;
};

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage({ params, searchParams }: Props) {
  const { businessId } = await params;
  await requireBusinessAccess(businessId, `/workspace/${businessId}/billing/success`);
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
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Payment received</p>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-900">GravyBlock is working on your business.</h1>
        <p className="mt-2 text-zinc-700">Learning your website and identifying the first opportunities…</p>
        <p className="mt-1 text-xs text-zinc-500">{syncMessage}</p>
      </div>
      <HomeSummary businessId={businessId} />
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/workspace/${businessId}`}
          className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
        >
          Open my workspace
        </Link>
      </div>
    </div>
  );
}
