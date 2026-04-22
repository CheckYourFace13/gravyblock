import { getGooglePlaceDetails } from "@/lib/integrations/google-places";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { placeId?: string } | null;
  const placeId = body?.placeId?.trim();
  if (!placeId) {
    return Response.json({ error: "placeId is required" }, { status: 400 });
  }

  try {
    const details = await getGooglePlaceDetails(placeId);
    return Response.json({ details });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load place details";
    return Response.json({ error: message }, { status: 500 });
  }
}
