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

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

export const placeSearchSchema = z.object({
  query: z.string().trim().min(2, "Business name is required"),
  locationHint: z.string().trim().min(2, "City or address is required"),
});

export const scanFormSchema = z.object({
  query: z.string().trim().min(2, "Business query is required"),
  locationHint: z.string().trim().min(2, "City or address is required"),
  placeId: z.string().trim().min(8, "Select a business from the Google matches list"),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactEmail: z.string().trim().email("Valid contact email is required"),
  businessModel: z
    .enum(["single_location", "multi_location", "service_area", "online_only", "hybrid", "franchise"])
    .default("single_location"),
  vertical: verticalSchema.default("restaurant"),
  candidateConfidence: z.coerce.number().int().min(0).max(100).optional(),
  searchConsolePropertyUrl: optionalString,
});

export type ScanFormInput = z.infer<typeof scanFormSchema>;
