"use server";

import { getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { factsFromHtml } from "@/lib/truth/extract";
import { addrKey, digits, nameKey } from "@/lib/citations/engine";
import { allow, clientKey } from "@/lib/tools/rate-limit";

export type NapRow = {
  field: "Business name" | "Address" | "Phone";
  google: string | null;
  website: string | null;
  status: "match" | "different" | "not_on_website" | "not_on_google";
};

export type NapResult =
  | { ok: true; businessName: string; website: string | null; websiteChecked: boolean; rows: NapRow[] }
  | { ok: false; error: string };

function compare(google: string | null, sites: string[], norm: (s: string) => string): { website: string | null; status: NapRow["status"] } {
  if (!google) return { website: sites[0] ?? null, status: "not_on_google" };
  if (!sites.length) return { website: null, status: "not_on_website" };
  const g = norm(google);
  const hit = sites.find((s) => norm(s) === g || (g && norm(s).includes(g)) || (norm(s) && g.includes(norm(s))));
  return hit ? { website: hit, status: "match" } : { website: sites[0], status: "different" };
}

/** Compares a business's Google listing with what its own website publishes, using the same normalization as the paid citation engine. */
export async function checkNapAction(placeId: string): Promise<NapResult> {
  if (!allow("nap", await clientKey(), { perHour: 8, perDay: 400 })) {
    return { ok: false, error: "Too many checks right now. Please try again in a little while." };
  }
  if (!placeId || placeId.length > 200) return { ok: false, error: "Choose your business from the list first." };
  try {
    const place = await getGooglePlaceDetails(placeId);
    let sites = { name: [] as string[], address: [] as string[], phone: [] as string[] };
    let websiteChecked = false;
    if (place.website) {
      const res = await safeFetchText(place.website, { timeoutMs: 8000, maxBytes: 600_000, accept: "text/html" });
      if (res.ok) {
        websiteChecked = true;
        const facts = factsFromHtml(res.body, res.finalUrl, { isHomepage: true });
        const vals = (k: string) => [...new Set(facts.filter((f) => f.key === k).map((f) => f.value.trim()).filter(Boolean))];
        sites = { name: vals("name"), address: vals("address"), phone: vals("phone") };
      }
    }
    const rows: NapRow[] = [
      { field: "Business name", google: place.displayName || null, ...compare(place.displayName || null, sites.name, nameKey) },
      { field: "Address", google: place.formattedAddress || null, ...compare(place.formattedAddress || null, sites.address, addrKey) },
      { field: "Phone", google: place.phone || null, ...compare(place.phone || null, sites.phone, digits) },
    ];
    return { ok: true, businessName: place.displayName, website: place.website ?? null, websiteChecked, rows };
  } catch {
    return { ok: false, error: "We could not check that business right now. Please try again." };
  }
}
