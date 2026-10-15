"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin-session";
import { backfillScanClassification, markInternalBusinesses } from "@/lib/reporting/classification";
import { measure } from "@/lib/reporting/acquisition";

/** Runs the (idempotent, never-deleting) classification on demand. The page itself only reads. */
export async function runClassificationAction(): Promise<void> {
  if (!(await isAdminSession())) return;
  await measure("mark internal accounts", markInternalBusinesses);
  await measure("backfill scan classification", backfillScanClassification);
  revalidatePath("/admin/acquisition");
}
