import { placeSearchSchema } from "@/lib/validation/scan";
import { searchGooglePlaceCandidates } from "@/lib/integrations/google-places";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = placeSearchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid search payload", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const candidates = await searchGooglePlaceCandidates({
      query: parsed.data.query,
      locationHint: parsed.data.locationHint,
      maxResults: 8,
    });
    return Response.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
