import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import type { CrossLinkPartner } from "./generate";

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim().toLowerCase();
  return address.trim().toLowerCase();
}

export async function findCrossLinkPartner(
  businessId: string,
  businessCity: string,
  businessIndustry: string,
): Promise<CrossLinkPartner | null> {
  const db = getDb();
  if (!db) return null;

  try {
    // Find a paid business in the same city with a different industry
    const candidates = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        vertical: businesses.vertical,
        primaryCategory: businesses.primaryCategory,
        website: businesses.website,
        address: businesses.address,
      })
      .from(businesses)
      .where(
        and(
          ne(businesses.id, businessId),
          ne(businesses.planTier, "free"),
          sql`${businesses.address} ILIKE ${"%" + businessCity + "%"}`,
        ),
      )
      .limit(20);

    // Filter out same-industry businesses
    const partners = candidates.filter((c) => {
      const industry = (c.vertical ?? c.primaryCategory ?? "").toLowerCase();
      const myIndustry = businessIndustry.toLowerCase();
      // Avoid same or closely related industries
      return !industry.includes(myIndustry.slice(0, 5)) && !myIndustry.includes(industry.slice(0, 5));
    });

    if (partners.length === 0) return null;

    // Pick a random one to distribute links
    const partner = partners[Math.floor(Math.random() * partners.length)];
    if (!partner) return null;

    return {
      name: partner.name,
      industry: partner.vertical ?? partner.primaryCategory ?? "local business",
      url: partner.website ?? null,
    };
  } catch {
    return null;
  }
}
