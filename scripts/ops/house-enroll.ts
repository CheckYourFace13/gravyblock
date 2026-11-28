// Enroll an owner-run site as a House Account (read only: house accounts are never written to) and, when possible, link its Search Console property.
//   enroll: tsx --env-file=.env scripts/ops/house-enroll.ts enroll <domain> <focus: local|regional|national|online> <name...>
//   gsc:    tsx --env-file=.env scripts/ops/house-enroll.ts gsc <domain>
// Same rules as the admin enrollment form (one record per domain, an existing record is converted, never duplicated). The Search Console link reuses the
// owner's existing Google authorization (the one every house site already uses) and is made ONLY if Google lists the property for that account; otherwise
// it reports what Google returned and changes nothing. No new account, credential or paid service is involved.
import { sql } from "drizzle-orm";
import { businesses, getDb } from "../../src/lib/db";
import { linkHouseSearchConsole } from "../../src/lib/search-intel/gsc-link";

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
    const r = await linkHouseSearchConsole(existing.id);
    console.log(`${r.status.toUpperCase()}: ${r.detail}`);
    return;
  }
  console.log("commands: enroll <domain> <focus> <name...> | gsc <domain>");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 300));
