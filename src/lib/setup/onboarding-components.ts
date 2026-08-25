/**
 * Per-component onboarding state — reuses the existing `jobs` table (no new
 * schema; the last migration attempt caused a real incident this session,
 * and the user explicitly said not to overengineer a workflow framework if
 * jobs can reliably support this). One row per state TRANSITION, type
 * `onboarding:{component}`, businessId set. Current state = most recent row
 * for that (businessId, component) pair — the same "latest wins" pattern
 * `outreach_settings` already uses elsewhere in this codebase.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

export const ONBOARDING_COMPONENTS = [
  "business_identity",
  "website_crawl",
  "place_identity",
  "competitor_baseline",
  "ranking_baseline",
  "ai_visibility_baseline",
  "citation_baseline",
  "gbp_integration_status",
  "score_snapshot",
  "recurring_scheduled",
  "automation_ready",
] as const;

export type OnboardingComponent = (typeof ONBOARDING_COMPONENTS)[number];

export type ComponentStatus =
  | "pending"
  | "running"
  | "complete"
  | "retrying"
  | "failed"
  | "needs_customer_action"
  | "not_applicable";

// Statuses that count as "done" for the purposes of automation_ready and for
// deciding whether a component's work still needs to run.
const TERMINAL_OK: ComponentStatus[] = ["complete", "not_applicable"];

function jobType(component: OnboardingComponent): string {
  return `onboarding:${component}`;
}

export async function getComponentStatus(
  businessId: string,
  component: OnboardingComponent,
): Promise<{ status: ComponentStatus; detail: Record<string, unknown> | null; updatedAt: Date } | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ status: jobs.status, payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.type, jobType(component)), eq(jobs.businessId, businessId)))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row) return null;
  return { status: row.status as ComponentStatus, detail: (row.payload as Record<string, unknown>) ?? null, updatedAt: row.createdAt };
}

export async function setComponentStatus(
  businessId: string,
  component: OnboardingComponent,
  status: ComponentStatus,
  detail?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: jobType(component),
    businessId,
    status,
    payload: detail ?? {},
  });
}

export function isDone(status: ComponentStatus | undefined | null): boolean {
  return Boolean(status && TERMINAL_OK.includes(status));
}

export type CustomerOnboardingItem = {
  label: string;
  state: "done" | "waiting" | "action_needed" | "stuck";
  detail: string | null;
};

/**
 * Translates internal component state into the customer-facing summary —
 * plain labels, no engineering internals (no "retrying"/"jobs table"/error
 * messages). A permanently `failed` component reads distinctly from one
 * still `pending`/`retrying`, per the explicit requirement that stuck and
 * in-progress must never look identical to the customer.
 */
export async function getCustomerOnboardingSummary(businessId: string): Promise<CustomerOnboardingItem[]> {
  const states = await getAllComponentStates(businessId);
  const s = (c: OnboardingComponent) => states[c]?.status ?? "pending";

  const item = (label: string, status: ComponentStatus, actionLabel?: string): CustomerOnboardingItem => {
    if (status === "complete" || status === "not_applicable") return { label, state: "done", detail: null };
    if (status === "needs_customer_action") return { label, state: "action_needed", detail: actionLabel ?? "Action needed" };
    if (status === "failed") return { label, state: "stuck", detail: "Needs attention — contact support" };
    return { label, state: "waiting", detail: "In progress" };
  };

  return [
    item("Website analyzed", s("website_crawl")),
    item("Business profile matched", s("place_identity"), "Action needed"),
    item("Competitors analyzed", s("competitor_baseline"), "Waiting for business match"),
    item("AI visibility measured", s("ai_visibility_baseline")),
    item("Listings/citations checked", s("citation_baseline")),
    item("Google connection", s("gbp_integration_status"), "Optional — connect Google"),
    item("Automation ready", s("automation_ready")),
  ];
}

export async function getAllComponentStates(
  businessId: string,
): Promise<Record<OnboardingComponent, { status: ComponentStatus; detail: Record<string, unknown> | null; updatedAt: Date } | null>> {
  const entries = await Promise.all(
    ONBOARDING_COMPONENTS.map(async (c) => [c, await getComponentStatus(businessId, c)] as const),
  );
  return Object.fromEntries(entries) as Record<OnboardingComponent, { status: ComponentStatus; detail: Record<string, unknown> | null; updatedAt: Date } | null>;
}
