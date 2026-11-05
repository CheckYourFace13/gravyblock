// YouTube connection status for the shared iScream Studio channel. READ-ONLY by default: it verifies the connected channel live with YouTube and
// shows what is still missing. It has no upload command; uploads only ever go through the Studio publish queue after owner approval, an explicit
// per-product YouTube selection, a made-for-kids declaration and the platform-approval attestation.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-youtube.ts
// Owner decisions can be recorded (configuration only, nothing is sent):
//   ... marketing-youtube.ts --select scribblezap --made-for-kids no
import { and, eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { evaluateHealth, usable } from "../../src/lib/marketing-studio/publishing/connections";
import { youtubeCallbackUrl, YOUTUBE_FIRST, youtubeOAuthConfigured, verifyYoutubeConnection } from "../../src/lib/marketing-studio/publishing/oauth-youtube";
import { approvedSetting, youtubeEnabledSetting, youtubeKidsSetting } from "../../src/lib/marketing-studio/publishing/queue";
import { YT_SCOPES } from "../../src/lib/marketing-studio/publishing/youtube-api";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  console.log(`Google OAuth client configured on the server: ${youtubeOAuthConfigured()}`);
  console.log(`redirect URI to register with Google: ${youtubeCallbackUrl()}`);
  console.log(`scopes requested: ${YT_SCOPES.join(" ")}`);
  console.log(`platform approval attested (direct upload allowed): ${await getSetting<boolean>(approvedSetting("youtube"), false, db)}`);

  const select = arg("--select");
  if (select) {
    const p = products.find((x) => x.slug === select);
    if (!p) throw new Error(`No Studio product ${select}`);
    const kids = arg("--made-for-kids");
    if (kids !== "yes" && kids !== "no") throw new Error("--select needs --made-for-kids yes|no (an explicit owner declaration)");
    await setSetting(youtubeEnabledSetting(p.id), true, "owner-cli", db);
    await setSetting(youtubeKidsSetting(p.id), kids === "yes", "owner-cli", db);
    console.log(`YouTube selected for ${p.name}; made for kids: ${kids}. Nothing was uploaded.`);
  }

  for (const slug of YOUTUBE_FIRST.order) {
    const p = products.find((x) => x.slug === slug);
    if (!p) {
      console.log(`\n${slug}: no Studio product`);
      continue;
    }
    const kids = await getSetting<boolean | null>(youtubeKidsSetting(p.id), null, db);
    console.log(`\n${p.name}: YouTube selected ${await getSetting<boolean>(youtubeEnabledSetting(p.id), false, db)}, made-for-kids declaration ${kids === null ? "NOT SET" : kids ? "yes" : "no"}`);
    const conns = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.productId, p.id), eq(ms.msConnections.platform, "youtube")));
    const conn = conns.find((c) => usable(evaluateHealth(c)));
    if (!conn) {
      console.log(`  BLOCKED (waiting on the owner): no healthy YouTube channel is connected to ${p.name}. Open the product page and press Connect with YouTube, channel "${YOUTUBE_FIRST.expectedHandle}".`);
      continue;
    }
    console.log(`  connected: ${conn.accountLabel}, channel id ${conn.externalAccountId}, health ${evaluateHealth(conn)}`);
    if (!youtubeOAuthConfigured()) continue;
    for (const c of await verifyYoutubeConnection(INTERNAL_SCOPE, "youtube-status", conn, YOUTUBE_FIRST.expectedHandle, { fetch }, db)) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());
