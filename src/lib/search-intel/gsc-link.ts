/**
 * Links a house site's Search Console property through the owner's existing Google authorization (the one every house site already uses), ONLY when Google
 * lists a verified property for that domain. Read-only toward Google (a sites list) and toward the site. Called by the ops script and once a day by the
 * daily search check, so a newly launched site starts receiving Google data the day its property is verified, with no further step.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getFreshAccessToken } from "@/lib/integrations/google-oauth";

const rows = <T>(r: unknown) => r as unknown as T[];
const hostOf = (raw: string): string | null => {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes(".") ? u.hostname.replace(/^www\./i, "").toLowerCase() : null;
  } catch {
    return null;
  }
};

export type LinkResult = { status: "already_linked" | "linked" | "not_accessible" | "not_house" | "no_authorization"; property?: string; detail: string };

export async function linkHouseSearchConsole(businessId: string): Promise<LinkResult> {
  const db = getDb();
  if (!db) return { status: "no_authorization", detail: "database unavailable" };
  const [b] = rows<{ name: string; website: string | null; account_type: string }>(await db.execute(sql`select name, website, account_type from businesses where id = ${businessId}::uuid`));
  if (!b || b.account_type !== "house") return { status: "not_house", detail: "only house accounts are linked this way" };
  const host = hostOf(b.website ?? "");
  if (!host) return { status: "not_accessible", detail: "the account has no website" };
  const [have] = rows<{ p: string | null }>(await db.execute(sql`select search_console_property p from google_oauth_connections where business_id = ${businessId}::uuid`));
  if (have?.p) return { status: "already_linked", property: have.p, detail: `already linked to ${have.p}` };
  const [donor] = rows<{ business_id: string; google_email: string }>(await db.execute(sql`
    select g.business_id, g.google_email from google_oauth_connections g join businesses x on x.id = g.business_id
    where x.account_type = 'house' and g.search_console_property is not null order by g.updated_at desc limit 1`));
  if (!donor) return { status: "no_authorization", detail: "no existing house Google authorization to reuse" };
  const token = await getFreshAccessToken(donor.business_id);
  if (!token) return { status: "no_authorization", detail: "the existing Google authorization could not be refreshed" };
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return { status: "not_accessible", detail: `Google returned ${res?.status ?? "no response"} for the property list` };
  const entries = ((await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }).siteEntry ?? [];
  const match = entries.find((e) => e.siteUrl === `sc-domain:${host}`) ?? entries.find((e) => hostOf(e.siteUrl.replace(/^sc-domain:/, "")) === host);
  if (!match || match.permissionLevel === "siteUnverifiedUser") {
    return { status: "not_accessible", detail: `Google lists ${entries.length} properties for ${donor.google_email}; none is a verified property for ${host}${match ? ` (${match.siteUrl} is ${match.permissionLevel})` : ""}. Owner action: add and verify the domain property in Search Console under that account.` };
  }
  await db.execute(sql`insert into google_oauth_connections (business_id, access_token, refresh_token, expires_at, scopes, google_email, search_console_property)
    select ${businessId}::uuid, access_token, refresh_token, expires_at, scopes, google_email, ${match.siteUrl} from google_oauth_connections where business_id = ${donor.business_id}::uuid
    on conflict (business_id) do update set search_console_property = excluded.search_console_property, updated_at = now()`);
  return { status: "linked", property: match.siteUrl, detail: `linked ${b.name} to ${match.siteUrl} (${match.permissionLevel})` };
}
