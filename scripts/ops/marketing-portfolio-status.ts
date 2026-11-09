// Portfolio status and one-time declarations.
//   tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-portfolio-status.ts                      (status of every product)
//   ... --declare-kids no|yes [--product slug]   (the owner's one-time YouTube made-for-kids declaration; portfolio-wide unless a product is named)
//   ... --tick                                   (run one pass of the continuous loop now; the worker also does this every 30 minutes)
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { portfolioTick, productStatus } from "../../src/lib/marketing-studio/portfolio-loop";
import { declareKids } from "../../src/lib/marketing-studio/publishing/video-policy";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

const argOf = (n: string) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : undefined);

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  const kids = argOf("declare-kids");
  if (kids) {
    if (kids !== "yes" && kids !== "no") throw new Error("--declare-kids takes yes or no");
    const slug = argOf("product");
    if (slug) {
      const p = products.find((x) => x.slug === slug);
      if (!p) throw new Error(`unknown product ${slug}`);
      await declareKids(db, "owner declaration (CLI)", { productId: p.id }, kids === "yes");
    } else await declareKids(db, "owner declaration (CLI)", "portfolio", kids === "yes");
    console.log(`made-for-kids declared: ${kids}${slug ? ` for ${slug}` : " for the owner's portfolio"}`);
  }
  if (process.argv.includes("--tick")) for (const r of await portfolioTick(db, console.log)) void r;
  for (const plan of PLAN_PRODUCTS) {
    const p = products.find((x) => x.slug === plan.slug);
    if (!p) continue;
    const s = await productStatus(db, p as never);
    console.log(`${plan.slug.padEnd(15)} ${s.status}${s.detail ? `  (${s.detail})` : ""}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());
