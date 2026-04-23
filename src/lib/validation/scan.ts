import { z } from "zod";

export const verticalSchema = z.enum([
  "bar",
  "restaurant",
  "brewery",
  "retail",
  "healthcare",
  "home_services",
  "professional_services",
  "online_brand",
  "hybrid",
  "other",
]);

export const placeSearchSchema = z.object({
  query: z.string().trim().min(2, "Business name is required"),
  locationHint: z.string().trim().min(2, "City or address is required"),
});

export const scanFormSchema = z.object({
  query: z.string().trim().min(2, "Business query is required"),
  locationHint: z.string().trim().min(2, "City or address is required"),
  placeId: z.string().trim().min(8, "Select a business from the Google matches list"),
  businessModel: z
    .enum(["single_location", "multi_location", "service_area", "online_only", "hybrid", "franchise"])
    .default("single_location"),
  vertical: verticalSchema.default("restaurant"),
  candidateConfidence: z.coerce.number().int().min(0).max(100).optional(),
});

export type ScanFormInput = z.infer<typeof scanFormSchema>;
