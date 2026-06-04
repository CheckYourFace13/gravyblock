/**
 * City autocomplete endpoint — returns matching cities from Google Places Autocomplete.
 * Restricts results to (cities) type only so you can't enter random strings.
 * Called client-side from the business profile form as the user types.
 */

export const dynamic = "force-dynamic";

type AutocompleteResult = {
  label: string;      // "Houston, TX, USA"
  city: string;       // "Houston, TX"  ← what gets saved
  placeId: string;
};

type GooglePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
  types?: string[];
};

type GoogleAutocompleteResponse = {
  status: string;
  predictions: GooglePrediction[];
};

function formatCity(prediction: GooglePrediction): string {
  const main = prediction.structured_formatting?.main_text ?? prediction.description.split(",")[0];
  const secondary = prediction.structured_formatting?.secondary_text ?? "";
  // Extract state abbreviation from secondary text like "Texas, USA" → "TX"
  // or keep full secondary for non-US results
  const parts = secondary.split(",").map((s) => s.trim()).filter(Boolean);
  const country = parts[parts.length - 1] ?? "";
  const isUS = country === "USA" || country === "United States";
  if (isUS && parts.length >= 2) {
    // Convert state name to abbreviation via the description
    const stateFull = parts[0];
    const stateAbbr = STATE_ABBR[stateFull.toLowerCase()] ?? stateFull;
    return `${main}, ${stateAbbr}`;
  }
  if (parts.length >= 1) return `${main}, ${parts[0]}`;
  return main;
}

export async function GET(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return Response.json({ results: [] });

  const { searchParams } = new URL(req.url);
  const input = searchParams.get("q")?.trim();
  if (!input || input.length < 2) return Response.json({ results: [] });

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("types", "(cities)");
    url.searchParams.set("key", apiKey);
    // Bias toward US results (still shows international if searched)
    url.searchParams.set("components", "country:us");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return Response.json({ results: [] });

    const data = (await res.json()) as GoogleAutocompleteResponse;
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return Response.json({ results: [] });
    }

    const results: AutocompleteResult[] = (data.predictions ?? []).map((p) => ({
      label: p.description,
      city: formatCity(p),
      placeId: p.place_id,
    }));

    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}

// US state name → abbreviation lookup
const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};
