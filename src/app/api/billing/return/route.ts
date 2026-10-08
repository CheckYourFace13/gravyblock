import { NextRequest, NextResponse } from "next/server";
import { getStripeServerClient } from "@/lib/stripe/server";
import { setCustomerSession } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

/**
 * Where Stripe sends a buyer after checkout. The Checkout session id is a secret only the buyer holds,
 * so a completed session for a business is enough to sign that buyer in and land them in their workspace
 * instead of a login wall.
 */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.redirect(`${base}/login`);
  try {
    const stripe = getStripeServerClient();
    if (!stripe) return NextResponse.redirect(`${base}/login`);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const businessId = session.metadata?.businessId || session.client_reference_id || null;
    const email = (session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
    if (session.status !== "complete" || !businessId || !email) return NextResponse.redirect(`${base}/login`);
    await setCustomerSession({ emailNormalized: email, businessIds: [businessId] });
    return NextResponse.redirect(`${base}/workspace/${businessId}/billing/success?session_id=${encodeURIComponent(sessionId)}`);
  } catch (error) {
    console.error("[billing-return] failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.redirect(`${base}/login`);
  }
}
