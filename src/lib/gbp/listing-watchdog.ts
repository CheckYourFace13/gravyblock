/**
 * GBP listing watchdog — detects silent changes to a business's Google listing.
 *
 * Google applies "user-suggested edits" (hours, phone, categories, even the
 * business name) without notifying the owner. This job re-pulls Place Details
 * weekly per paid business, diffs against the previous snapshot, and when
 * something changed it:
 *   1. creates a workspace action item (operator_tasks, queue "local_trust_ops")
 *   2. emails the owner exactly what changed (skipped for house accounts)
 *
 * Snapshots are stored in place_profiles with source "watchdog" — same table
 * the scan flow writes, so listing history lives in one place. Weekly cadence
 * per business is enforced via the jobs table. Uses only the Places API the
 * app already pays for.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, jobs, operatorTasks, placeProfiles } from "@/lib/db";
import { getGooglePlaceDetails } from "@/lib/integrations/google-places";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

type ListingChange = { field: string; before: string; after: string };

function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function weekdayTextFromRaw(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object") return null;
  const hours = (raw as { opening_hours?: { weekday_text?: unknown } }).opening_hours;
  if (!hours || !Array.isArray(hours.weekday_text)) return null;
  return hours.weekday_text.filter((line): line is string => typeof line === "string");
}

function diffListing(
  prev: {
    displayName: string;
    formattedAddress: string | null;
    internationalPhoneNumber: string | null;
    websiteUri: string | null;
    businessStatus: string | null;
    raw: unknown;
  },
  next: {
    displayName: string;
    formattedAddress: string;
    phone?: string;
    website?: string;
    businessStatus?: string;
    raw: unknown;
  },
): ListingChange[] {
  const changes: ListingChange[] = [];
  const fields: Array<{ field: string; before: string | null; after: string | null | undefined }> = [
    { field: "Business name", before: prev.displayName, after: next.displayName },
    { field: "Address", before: prev.formattedAddress, after: next.formattedAddress },
    { field: "Phone number", before: prev.internationalPhoneNumber, after: next.phone },
    { field: "Website", before: prev.websiteUri, after: next.website },
    { field: "Business status", before: prev.businessStatus, after: next.businessStatus },
  ];

  for (const f of fields) {
    // Only flag real transitions between two known values. A field going from
    // missing to present is usually our own earlier snapshot being sparse, not
    // a Google edit — alerting on it would train owners to ignore the emails.
    if (!f.before || !f.after) continue;
    if (normalizeForCompare(f.before) !== normalizeForCompare(f.after)) {
      changes.push({ field: f.field, before: f.before, after: f.after });
    }
  }

  const prevHours = weekdayTextFromRaw(prev.raw);
  const nextHours = weekdayTextFromRaw(next.raw);
  if (prevHours && nextHours && JSON.stringify(prevHours) !== JSON.stringify(nextHours)) {
    changes.push({
      field: "Business hours",
      before: prevHours.join("; "),
      after: nextHours.join("; "),
    });
  }

  return changes;
}

async function sendChangeAlertEmail(params: {
  to: string;
  businessName: string;
  businessId: string;
  changes: ListingChange[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;

  const rows = params.changes
    .map(
      (c) => `<tr>
        <td style="padding:8px 12px;font-weight:600;color:#18181b;vertical-align:top">${c.field}</td>
        <td style="padding:8px 12px;color:#991b1b;text-decoration:line-through;vertical-align:top">${c.before}</td>
        <td style="padding:8px 12px;color:#166534;vertical-align:top">${c.after}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e4e4e7">
  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Listing change detected</p>
  <h1 style="margin:8px 0 0;font-size:19px;color:#18181b">Your Google listing for ${params.businessName} changed</h1>
  <p style="color:#52525b;font-size:14px;margin:14px 0">
    Google sometimes applies user-suggested edits to business listings without telling the owner.
    Our weekly check found the following change${params.changes.length > 1 ? "s" : ""}:
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fafafa;border-radius:8px">
    <tr style="text-align:left;color:#71717a;font-size:11px;text-transform:uppercase">
      <th style="padding:8px 12px">Field</th><th style="padding:8px 12px">Was</th><th style="padding:8px 12px">Now</th>
    </tr>
    ${rows}
  </table>
  <p style="color:#52525b;font-size:14px;margin:14px 0">
    If you made this change yourself, no action is needed. If not, correct it in your
    <a href="https://business.google.com" style="color:#dc2626">Google Business Profile</a> — wrong
    hours or phone numbers cost calls and hurt trust with Google.
  </p>
  <a href="${SITE_URL}/workspace/${params.businessId}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:100px;text-decoration:none">Open your workspace</a>
</div>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: `⚠ Your Google listing changed — ${params.businessName}`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ListingWatchdogResult = {
  checked: number;
  changed: number;
  alerted: number;
};

export async function runListingWatchdogBatch(batchSize = 5): Promise<ListingWatchdogResult> {
  const db = getDb();
  if (!db) return { checked: 0, changed: 0, alerted: 0 };
  if (!process.env.GOOGLE_PLACES_API_KEY) return { checked: 0, changed: 0, alerted: 0 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      placeId: businesses.placeId,
      billingEmail: businesses.billingEmail,
      accountType: businesses.accountType,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(batchSize * 4);

  const result: ListingWatchdogResult = { checked: 0, changed: 0, alerted: 0 };

  for (const biz of candidates) {
    if (result.checked >= batchSize) break;
    if (!biz.placeId) continue;

    const jobType = `listing_watchdog_${biz.id}`;
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, weekAgo)))
      .limit(1);
    if (recent) continue;

    let details: Awaited<ReturnType<typeof getGooglePlaceDetails>>;
    try {
      details = await getGooglePlaceDetails(biz.placeId);
    } catch (err) {
      console.warn("[listing-watchdog] place details failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    result.checked++;

    const [previous] = await db
      .select({
        displayName: placeProfiles.displayName,
        formattedAddress: placeProfiles.formattedAddress,
        internationalPhoneNumber: placeProfiles.internationalPhoneNumber,
        websiteUri: placeProfiles.websiteUri,
        businessStatus: placeProfiles.businessStatus,
        raw: placeProfiles.raw,
      })
      .from(placeProfiles)
      .where(eq(placeProfiles.businessId, biz.id))
      .orderBy(desc(placeProfiles.createdAt))
      .limit(1);

    const changes = previous ? diffListing(previous, details) : [];

    // Store the new snapshot regardless — it becomes next week's baseline.
    await db.insert(placeProfiles).values({
      businessId: biz.id,
      scanId: null,
      source: "watchdog",
      placeId: details.placeId,
      displayName: details.displayName,
      formattedAddress: details.formattedAddress || null,
      internationalPhoneNumber: details.phone ?? null,
      websiteUri: details.website ?? null,
      mapsUri: details.mapsUri,
      rating: details.rating != null ? String(details.rating) : null,
      reviewCount: details.reviewCount ?? null,
      primaryType: details.primaryCategory ?? null,
      types: details.types,
      businessStatus: details.businessStatus ?? null,
      openNow: typeof details.openNow === "boolean" ? String(details.openNow) : null,
      latitude: details.latitude ?? null,
      longitude: details.longitude ?? null,
      raw: details.raw,
    });

    if (changes.length > 0) {
      result.changed++;
      const summary = changes.map((c) => `${c.field}: "${c.before}" is now "${c.after}"`).join(" · ");

      await db.insert(operatorTasks).values({
        id: randomUUID(),
        businessId: biz.id,
        queue: "local_trust_ops",
        title: `Google listing changed: ${changes.map((c) => c.field).join(", ")}`,
        detail: `Weekly listing check found changes on your Google Business Profile. ${summary}. If you didn't make this change, correct it at business.google.com.`,
        status: "queued",
      });

      if (biz.billingEmail && biz.accountType !== "house") {
        const sent = await sendChangeAlertEmail({
          to: biz.billingEmail,
          businessName: biz.name,
          businessId: biz.id,
          changes,
        });
        if (sent) result.alerted++;
      }

      console.info("[listing-watchdog] change detected", { businessId: biz.id, changes: changes.length });
    }

    await db.insert(jobs).values({
      id: randomUUID(),
      businessId: biz.id,
      type: jobType,
      status: "completed",
      payload: { changes: changes.length, hadBaseline: Boolean(previous) },
    });
  }

  return result;
}
