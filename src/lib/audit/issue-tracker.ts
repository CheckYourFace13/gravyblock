/**
 * Persistent fix-list tracking: diffs each recurring site-crawl audit
 * against the previously-open issues for a business, so the workspace can
 * show what's still broken vs. what got fixed — instead of every scan just
 * showing a fresh, disconnected score with no memory of prior runs.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, businessIssues } from "@/lib/db";
import type { WebsiteAuditFinding } from "@/lib/report/types";

export type BusinessIssue = {
  id: string;
  key: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

/** Diffs new findings against open issues: resolves what disappeared, tracks what's new. */
export async function syncBusinessIssues(
  businessId: string,
  findings: WebsiteAuditFinding[],
): Promise<{ resolved: number; newIssues: number }> {
  const db = getDb();
  if (!db) return { resolved: 0, newIssues: 0 };

  const openRows = await db
    .select()
    .from(businessIssues)
    .where(and(eq(businessIssues.businessId, businessId), isNull(businessIssues.resolvedAt)));

  const openByKey = new Map(openRows.map((row) => [row.key, row]));
  const currentKeys = new Set(findings.map((f) => f.key));
  const now = new Date();

  let resolved = 0;
  for (const row of openRows) {
    if (!currentKeys.has(row.key)) {
      await db.update(businessIssues).set({ resolvedAt: now }).where(eq(businessIssues.id, row.id));
      resolved++;
    }
  }

  let newIssues = 0;
  for (const finding of findings) {
    const existing = openByKey.get(finding.key);
    if (existing) {
      await db.update(businessIssues).set({ lastSeenAt: now }).where(eq(businessIssues.id, existing.id));
    } else {
      await db.insert(businessIssues).values({
        businessId,
        key: finding.key,
        category: finding.source,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
      });
      newIssues++;
    }
  }

  return { resolved, newIssues };
}

const RESOLVED_HISTORY_DAYS = 90;

/** Open issues + recently-resolved ones (last 90 days), for the workspace fix-list panel. */
export async function getBusinessIssues(businessId: string): Promise<{ open: BusinessIssue[]; resolved: BusinessIssue[] }> {
  const db = getDb();
  if (!db) return { open: [], resolved: [] };

  const rows = await db
    .select()
    .from(businessIssues)
    .where(eq(businessIssues.businessId, businessId))
    .orderBy(desc(businessIssues.firstSeenAt));

  const cutoff = new Date(Date.now() - RESOLVED_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const open = rows.filter((r) => !r.resolvedAt);
  const resolved = rows.filter((r) => r.resolvedAt && r.resolvedAt > cutoff);

  return { open, resolved };
}
