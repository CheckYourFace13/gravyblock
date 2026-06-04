/**
 * Full address autocomplete — returns matching street addresses from Google Places.
 * Used by the business profile location section so addresses are validated.
 */

export const dynamic = "force-dynamic";

type AddressResult = {
  label: string;
  address: string;
  city: string;
  state: string;
  country: string;
  placeId: string;
};

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text?: string };
  terms?: Array<{ value: string; offset: number }>;
};

type GoogleResponse = { status: string; predictions: GooglePrediction[] };

const STATE_ABBR: Record<string, string> = {
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",
  colorado:"CO",connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",
  hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",
  kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",
  michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",
  nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ",
  "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",
  ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI",
  "south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",
  vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",
  wisconsin:"WI",wyoming:"WY","district of columbia":"DC",
};

function parseComponents(prediction: GooglePrediction): { city: string; state: string; country: string } {
  const terms = prediction.terms ?? [];
  const country = terms[terms.length - 1]?.value ?? "";
  const stateFull = terms[terms.length - 2]?.value ?? "";
  const state = STATE_ABBR[stateFull.toLowerCase()] ?? stateFull;
  const city = terms[terms.length - 3]?.value ?? "";
  return { city, state, country };
}

export async function GET(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return Response.json({ results: [] });

  const { searchParams } = new URL(req.url);
  const input = searchParams.get("q")?.trim();
  if (!input || input.length < 3) return Response.json({ results: [] });

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("types", "address");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return Response.json({ results: [] });

    const data = (await res.json()) as GoogleResponse;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return Response.json({ results: [] });

    const results: AddressResult[] = (data.predictions ?? []).slice(0, 6).map((p) => {
      const { city, state, country } = parseComponents(p);
      return {
        label: p.description,
        address: p.description,
        city,
        state,
        country,
        placeId: p.place_id,
      };
    });

    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
