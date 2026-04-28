import { z } from "zod";

export const FOCUS_AREAS = ["local", "regional", "national", "online"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const placeSearchSchema = z.object({
  query: z.string().trim().min(2, "Business name is required"),
  locationHint: z.string().trim().min(2, "City or address is required"),
});

// Mode A: Google Places lookup (local/regional businesses)
const placesSchema = z.object({
  scanMode: z.literal("places"),
  query: z.string().trim().min(2, "Business name is required"),
  locationHint: z.string().trim(),
  placeId: z.string().trim().min(8, "Select a business from the Google matches list"),
  candidateConfidence: z.coerce.number().int().min(0).max(100).optional(),
  focusArea: z.enum(FOCUS_AREAS).default("local"),
  targetScope: z.string().trim().optional(),
});

// Mode B: Website-first (online businesses / no Google listing needed)
const websiteSchema = z.object({
  scanMode: z.literal("website"),
  websiteUrl: z.string().trim().url("Enter a valid website URL (e.g. https://example.com)"),
  businessName: z.string().trim().min(1, "Business name is required"),
  focusArea: z.enum(FOCUS_AREAS).default("online"),
  targetScope: z.string().trim().optional(),
});

export const scanFormSchema = z.discriminatedUnion("scanMode", [placesSchema, websiteSchema]);

export type ScanFormInput = z.infer<typeof scanFormSchema>;
export type PlacesScanInput = z.infer<typeof placesSchema>;
export type WebsiteScanInput = z.infer<typeof websiteSchema>;
