/** Routing categories for the public contact and support forms (no email address is published anywhere). */
export const LEAD_TOPICS = [
  { value: "general", label: "General or sales question" },
  { value: "support", label: "Account or technical support" },
  { value: "billing", label: "Billing or refund request" },
  { value: "privacy", label: "Privacy or data request" },
] as const;

export type LeadTopic = (typeof LEAD_TOPICS)[number]["value"];

export function topicLabel(value: string): string | null {
  return LEAD_TOPICS.find((t) => t.value === value)?.label ?? null;
}
