// Local visual check: renders sample creatives for every family, size and product style into a folder.
//   MARKETING_CHROMIUM_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npx tsx scripts/ops/marketing-preview.ts out-dir
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildCreative, type CreativeInput, type Img, TEMPLATE_FAMILIES } from "../../src/lib/marketing-studio/creative/templates";
import { launchBrowser, renderCreative } from "../../src/lib/marketing-studio/creative/render";
import { SIZE_KEYS, themeFor } from "../../src/lib/marketing-studio/creative/theme";

async function swatch(color: string, w: number, h: number, id: string): Promise<Img> {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
  return { dataUri: `data:image/png;base64,${buf.toString("base64")}`, w, h, assetId: id, alt: id };
}

async function main() {
  const out = process.argv[2] ?? "preview-out";
  mkdirSync(out, { recursive: true });
  const handle = await launchBrowser();
  const browser = handle.browser;
  const kinds = [["website", "#b45309"], ["saas", "#2563eb"], ["mobile_game", "#ec4899"]] as const;
  const f = { kind: "fact" as const, factId: "f1" };
  for (const [kind, color] of kinds) {
    const theme = themeFor(kind, color);
    const logo = await swatch(color, 256, 256, "logo");
    const shot = await swatch("#cbd5e1", 1400, 900, "shot");
    for (const family of TEMPLATE_FAMILIES) {
      for (const size of SIZE_KEYS) {
        const input: CreativeInput = {
          family, size, theme, productName: "Sample Product",
          headline: { text: "Manage every rental from one simple place.", src: f },
          subhead: { text: "Keep your properties, tenants, leases, rent, maintenance, and finances connected.", src: f },
          body: { text: "Tenant requests with photos, status updates, and a history.", src: f },
          badge: { text: "Coming Soon", src: f },
          cta: { text: "Start Managing Free", url: "https://example.com/sign-up?x=1" },
          steps: [{ text: "Add a property", src: f }, { text: "Invite your tenant", src: f }, { text: "Track rent in one place", src: f }],
          columns: [{ label: { text: "Free", src: f }, text: { text: "$0/mo · 1 property · basics", src: f } }, { label: { text: "Landlord Pro", src: f }, text: { text: "$12/mo · Up to 5 properties", src: f } }],
          logo, screenshot: shot,
        };
        const built = buildCreative(input);
        const { png, measure } = await renderCreative(browser, built, size);
        writeFileSync(path.join(out, `${kind}-${family}-${size}.png`), png);
        const bad = measure.texts.filter((t) => t.overflow || t.fs < 24);
        if (bad.length) console.log(`${kind} ${family} ${size}: ${bad.map((b) => `${b.role} fs=${b.fs} overflow=${b.overflow}`).join("; ")}`);
      }
    }
  }
  await handle.close();
  console.log("done");
}
void main();
