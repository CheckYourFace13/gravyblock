import { z } from "zod";

const optionalVertical = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .enum([
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
    ])
    .optional(),
);

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().uuid().optional(),
);

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

export const leadSourceSchema = z.enum([
  "scan_form",
  "report_form",
  "contact_form",
  "support_inquiry",
  /** Legacy sources still stored on older rows */
  "upgrade_request",
  "demo_request",
]);
export type LeadSource = z.infer<typeof leadSourceSchema>;

export const leadFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  phone: optionalString,
  message: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(2000).optional(),
  ),
  reportPublicId: optionalString,
  organizationId: optionalUuid,
  brandId: optionalUuid,
  locationId: optionalUuid,
  businessId: optionalUuid,
  vertical: optionalVertical,
  website: optionalString,
  placeId: optionalString,
  source: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    leadSourceSchema.default("contact_form"),
  ),
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;
