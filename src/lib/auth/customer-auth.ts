import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { businesses, customerMagicLinks, customerSessions, getDb, leads, reports, scans } from "@/lib/db";
import { memoryStore } from "@/lib/db/memory-store";
import { normalizeEmail } from "@/lib/business/normalize";

const CUSTOMER_COOKIE = "gb_customer_session";
const MAGIC_LINK_TTL_MINUTES = 20;
const SESSION_TTL_DAYS = 14;

export type CustomerBusinessSummary = {
  id: string;
  name: string;
  planTier: string;
  latestReportAt: string | null;
  latestReportPublicId: string | null;
  billingEmail: string | null;
  subscriptionStatus: string | null;
};

type CustomerSessionPayload = {
  sid: string;
  email: string;
  businessIds: string[];
  exp: number;
};

function authSecret() {
  const secret = process.env.CUSTOMER_AUTH_SECRET?.trim() || process.env.ADMIN_SECRET?.trim() || "";
  if (process.env.NODE_ENV === "production" && !secret) {
    throw new Error("CUSTOMER_AUTH_SECRET is required in production");
  }
  return secret || "dev-only-change-me";
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function encodeSession(payload: CustomerSessionPayload) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(raw);
  return `${raw}.${signature}`;
}

function decodeSession(token: string | undefined | null): CustomerSessionPayload | null {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = sign(raw);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CustomerSessionPayload;
    if (!parsed.email || !Array.isArray(parsed.businessIds) || !parsed.sid || !parsed.exp) return null;
    if (parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hashMagicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createMagicToken() {
  return randomBytes(32).toString("base64url");
}

function siteBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}

function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return "/app";
  if (!raw.startsWith("/")) return "/app";
  if (raw.startsWith("//")) return "/app";
  return raw;
}

export async function createMagicLink(input: { email: string; redirectTo?: string }) {
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized) throw new Error("Valid email required");
  const token = createMagicToken();
  const tokenHash = hashMagicToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);
  const redirectTo = safeRedirectPath(input.redirectTo);
  const db = getDb();

  if (!db) {
    memoryStore.saveCustomerMagicLink({
      emailNormalized,
      tokenHash,
      redirectTo,
      expiresAt: expiresAt.toISOString(),
    });
  } else {
    await db.insert(customerMagicLinks).values({
      email: input.email.trim(),
      emailNormalized,
      tokenHash,
      redirectTo,
      expiresAt,
    });
  }

  const base = siteBaseUrl().replace(/\/+$/, "");
  const verifyUrl = `${base}/login/verify?token=${encodeURIComponent(token)}`;
  return { emailNormalized, verifyUrl, expiresAt };
}

async function consumeMagicLinkToken(token: string) {
  const tokenHash = hashMagicToken(token);
  const db = getDb();
  if (!db) {
    return memoryStore.consumeCustomerMagicLink(tokenHash);
  }

  const [row] = await db
    .select()
    .from(customerMagicLinks)
    .where(eq(customerMagicLinks.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(customerMagicLinks)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(customerMagicLinks.id, row.id),
        isNull(customerMagicLinks.usedAt),
        sql`${customerMagicLinks.expiresAt} > now()`,
      ),
    );

  const [fresh] = await db
    .select()
    .from(customerMagicLinks)
    .where(eq(customerMagicLinks.id, row.id))
    .limit(1);
  if (!fresh?.usedAt) return null;
  return {
    emailNormalized: fresh.emailNormalized,
    redirectTo: fresh.redirectTo ?? null,
  };
}

export async function resolveAccessibleBusinesses(emailNormalized: string): Promise<CustomerBusinessSummary[]> {
  const normalized = normalizeEmail(emailNormalized);
  if (!normalized) return [];
  const db = getDb();

  if (!db) {
    return memoryStore.listCustomerBusinessAccess(normalized).map((item) => ({
      id: item.id,
      name: item.name,
      planTier: item.planTier,
      latestReportAt: item.latestReportAt,
      latestReportPublicId: item.latestReportPublicId,
      billingEmail: item.billingEmail,
      subscriptionStatus: item.subscriptionStatus,
    }));
  }

  const leadRows = await db
    .select({
      businessId: leads.businessId,
      reportPublicId: leads.reportPublicId,
    })
    .from(leads)
    .where(eq(leads.emailNormalized, normalized))
    .orderBy(desc(leads.lastSeenAt))
    .limit(500);

  const reportIds = leadRows.map((l) => l.reportPublicId).filter((v): v is string => !!v);
  const leadBusinessIds = leadRows.map((l) => l.businessId).filter((v): v is string => !!v);

  let reportBusinessIds: string[] = [];
  if (reportIds.length) {
    const viaReports = await db
      .select({ businessId: scans.businessId })
      .from(reports)
      .innerJoin(scans, eq(reports.scanId, scans.id))
      .where(inArray(reports.publicId, reportIds))
      .limit(500);
    reportBusinessIds = viaReports.map((r) => r.businessId);
  }

  const billingRows = await db
    .select({
      id: businesses.id,
    })
    .from(businesses)
    .where(sql`lower(${businesses.billingEmail}) = ${normalized}`)
    .limit(500);

  const ids = [...new Set([...leadBusinessIds, ...reportBusinessIds, ...billingRows.map((b) => b.id)])];
  if (!ids.length) return [];

  const businessRows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      planTier: businesses.planTier,
      billingEmail: businesses.billingEmail,
      subscriptionStatus: businesses.subscriptionStatus,
    })
    .from(businesses)
    .where(inArray(businesses.id, ids))
    .limit(500);

  const reportRows = await db
    .select({
      businessId: scans.businessId,
      publicId: reports.publicId,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(scans, eq(reports.scanId, scans.id))
    .where(inArray(scans.businessId, ids))
    .orderBy(desc(reports.createdAt))
    .limit(1000);

  const latestByBusiness = new Map<string, { publicId: string; createdAt: string }>();
  for (const row of reportRows) {
    if (!latestByBusiness.has(row.businessId)) {
      latestByBusiness.set(row.businessId, {
        publicId: row.publicId,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  return businessRows.map((b) => ({
    id: b.id,
    name: b.name,
    planTier: b.planTier,
    latestReportAt: latestByBusiness.get(b.id)?.createdAt ?? null,
    latestReportPublicId: latestByBusiness.get(b.id)?.publicId ?? null,
    billingEmail: b.billingEmail ?? null,
    subscriptionStatus: b.subscriptionStatus ?? null,
  }));
}

export async function setCustomerSession(input: {
  emailNormalized: string;
  businessIds: string[];
}) {
  const normalized = normalizeEmail(input.emailNormalized);
  if (!normalized) throw new Error("Valid email required");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sid = randomBytes(16).toString("hex");
  const payload: CustomerSessionPayload = {
    sid,
    email: normalized,
    businessIds: [...new Set(input.businessIds)],
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const db = getDb();
  if (!db) {
    memoryStore.saveCustomerSession({
      id: sid,
      emailNormalized: normalized,
      businessIds: payload.businessIds,
      expiresAt: expiresAt.toISOString(),
    });
  } else {
    await db.insert(customerSessions).values({
      id: sid,
      emailNormalized: normalized,
      businessIds: payload.businessIds,
      expiresAt,
      lastSeenAt: new Date(),
    });
  }
  (await cookies()).set(CUSTOMER_COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearCustomerSession() {
  const existing = await getCustomerSession();
  if (existing) {
    const db = getDb();
    if (!db) {
      memoryStore.deleteCustomerSession(existing.sid);
    } else {
      await db.update(customerSessions).set({ expiresAt: new Date(0) }).where(eq(customerSessions.id, existing.sid));
    }
  }
  (await cookies()).set(CUSTOMER_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getCustomerSession() {
  const parsed = decodeSession((await cookies()).get(CUSTOMER_COOKIE)?.value);
  if (!parsed) return null;
  const db = getDb();
  if (!db) {
    const session = memoryStore.getCustomerSession(parsed.sid);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
    return parsed;
  }
  const [row] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.id, parsed.sid),
        eq(customerSessions.emailNormalized, parsed.email),
        isNotNull(customerSessions.expiresAt),
        sql`${customerSessions.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!row) return null;
  await db.update(customerSessions).set({ lastSeenAt: new Date() }).where(eq(customerSessions.id, parsed.sid));
  return parsed;
}

export async function completeMagicLogin(token: string) {
  const consumed = await consumeMagicLinkToken(token);
  if (!consumed) return null;
  const businesses = await resolveAccessibleBusinesses(consumed.emailNormalized);
  await setCustomerSession({
    emailNormalized: consumed.emailNormalized,
    businessIds: businesses.map((b) => b.id),
  });
  return {
    emailNormalized: consumed.emailNormalized,
    redirectTo: safeRedirectPath(consumed.redirectTo),
    businesses,
  };
}

export async function canAccessBusiness(businessId: string) {
  const session = await getCustomerSession();
  if (!session) return false;
  if (session.businessIds.includes(businessId)) return true;
  const latest = await resolveAccessibleBusinesses(session.email);
  return latest.some((b) => b.id === businessId);
}

