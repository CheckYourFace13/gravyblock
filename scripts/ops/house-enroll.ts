// Enroll an owner-run site as a House Account (read only: house accounts are never written to) and, when possible, link its Search Console property.
//   enroll: tsx --env-file=.env scripts/ops/house-enroll.ts enroll <domain> <focus: local|regional|national|online> <name...>
//   gsc:    tsx --env-file=.env scripts/ops/house-enroll.ts gsc <domain>
// Same rules as the admin enrollment form (one record per domain, an existing record is converted, never duplicated). The Search Console link reuses the
// owner's existing Google authorization (the one every house site already uses) and is made ONLY if Google lists the property for that account; otherwise
// it reports what Google returned and changes nothing. No new account, credential or paid service is involved.
import { sql } from "drizzle-orm";
import { businesses, getDb } from "../../src/lib/db";
import { getFreshAccessToken } from "../../src/lib/integrations/google-oauth";

const hostOf = (raw: string): string | null => {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes(".") ? u.hostname.replace(/^www\./i, "").toLowerCase() : null;
  } catch {
    return null;
  }
};
const rows = <T>(r: unknown) => r as unknown as T[];

async function main() {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const [cmd, domain, ...rest] = process.argv.slice(2);
  const host = hostOf(domain ?? "");
  if (!host) throw new Error("a valid domain is required");
  const all = await db.select({ id: businesses.id, name: businesses.name, website: businesses.website, accountType: businesses.accountType }).from(businesses);
  const existing = all.find((b) => b.website && hostOf(b.website) === host);

  if (cmd === "enroll") {
    const [focus, ...nameParts] = rest;
    const name = nameParts.join(" ").trim();
    const focusArea = ["local", "regional", "national", "online"].includes(focus ?? "") ? focus! : "online";
    if (!name) throw new Error("usage: enroll <domain> <focus> <name...>");
    if (existing) {
      await db.execute(sql`update businesses set account_type = 'house' where id = ${existing.id}::uuid`);
      console.log(`converted existing record ${existing.id} (${existing.name}) to a house account`);
    } else {
      const [b] = await db.insert(businesses).values({ name, website: `https://${host}`, websiteNormalized: host, businessModel: "online", focusArea, accountType: "house" }).returning({ id: businesses.id });
      console.log(`created house account ${b!.id} for ${name} (${host})`);
    }
    const [n] = rows<{ n: number }>(await db.execute(sql`select count(*)::int n from businesses where account_type = 'house'`));
    console.log(`house accounts now: ${n!.n}`);
    return;
  }

  if (cmd === "gsc") {
    if (!existing || existing.accountType !== "house") throw new Error("enroll the site as a house account first");
    const [have] = rows<{ p: string | null }>(await db.execute(sql`select search_console_property p from google_oauth_connections where business_id = ${existing.id}::uuid`));
    if (have?.p) { console.log(`already linked: ${have.p}`); return; }
    // the owner's existing authorization, as used by the other house sites
    const [donor] = rows<{ business_id: string; google_email: string }>(await db.execute(sql`
      select g.business_id, g.google_email from google_oauth_connections g join businesses b on b.id = g.business_id
      where b.account_type = 'house' and g.search_console_property is not null order by g.updated_at desc limit 1`));
    if (!donor) throw new Error("no existing house Google authorization to reuse");
    const token = await getFreshAccessToken(donor.business_id);
    if (!token) throw new Error("the existing Google authorization could not be refreshed");
    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
    const entries = json.siteEntry ?? [];
    const match = entries.find((e) => e.siteUrl === `sc-domain:${host}`) ?? entries.find((e) => hostOf(e.siteUrl.replace(/^sc-domain:/, "")) === host);
    console.log(`Google lists ${entries.length} Search Console properties for the existing authorization (${donor.google_email}).`);
    if (!match || match.permissionLevel === "siteUnverifiedUser") {
      console.log(`NOT LINKED: no verified property for ${host} is accessible${match ? ` (found ${match.siteUrl} but permission is ${match.permissionLevel})` : ""}. Owner action: add and verify the domain property in Search Console under ${donor.google_email}, then rerun this command.`);
      return;
    }
    await db.execute(sql`insert into google_oauth_connections (business_id, access_token, refresh_token, expires_at, scopes, google_email, search_console_property)
      select ${existing.id}::uuid, access_token, refresh_token, expires_at, scopes, google_email, ${match.siteUrl} from google_oauth_connections where business_id = ${donor.business_id}::uuid
      on conflict (business_id) do update set search_console_property = excluded.search_console_property, updated_at = now()`);
    console.log(`LINKED: ${existing.name} -> ${match.siteUrl} (permission ${match.permissionLevel})`);
    return;
  }
  console.log("commands: enroll <domain> <focus> <name...> | gsc <domain>");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
