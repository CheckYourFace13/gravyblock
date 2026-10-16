import { SELF_BUSINESS_ID } from "@/lib/site-publish/self-managed";

export const dynamic = "force-static";

/** Announces GravyBlock's own connector (page metadata and social preview only) so its house account attaches automatically. */
export function GET() {
  return Response.json({ connector: "gravyblock-managed", version: 1, businessId: SELF_BUSINESS_ID, capabilities: [] });
}
