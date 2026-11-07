// Builds and stores the portfolio video library: the angle inventory per product (existing approved or public videos counted, missing roles planned),
// the duplicate gate results, the iScream Studio portfolio metadata, product-site embed recommendations and the distribution plan. Prints the matrix.
// It renders, uploads, emails and publishes nothing, and it never edits any website: placements are stored as recommendations only.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-library-save.ts [--dry]
import { and, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { angleKey, checkDistinct, consumes, hasVerifiedProductUrl, ROLE_LABEL, type AngleEntry } from "../../src/lib/marketing-studio/library";
import { DISTRIBUTION_BY_FUNNEL, EXISTING, PLAN_PRODUCTS, PLANNED, REJECTED_CANDIDATES, toEntry } from "../../src/lib/marketing-studio/library-plan";
import { currentMetrics } from "../../src/lib/marketing-studio/measurement/collect";
import { embedFor, listReviews, watchUrlFor } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import type { DemoRecord } from "../../src/lib/marketing-studio/video/demo/types";

const ACTOR = "owner-directive 2026-11-08 (portfolio video library)";
const DRY = process.argv.includes("--dry");

async function urlOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url.split("?")[0], { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "GravyBlockStudioLibraryCheck" } });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function main() {
  const db = requireStudioDb();
  const studio = await listProducts(INTERNAL_SCOPE, db);
  const reviews = await listReviews(db);
  const pubs = await db.select().from(ms.msPublications);
  const library: Record<string, AngleEntry[]> = {};
  const plan: Array<Record<string, unknown>> = [];
  const rejected: Array<{ title: string; slug: string; conflicts: unknown }> = [];
  const embedRecs: Record<string, Array<Record<string, unknown>>> = {};
  const distribution: Array<Record<string, unknown>> = [];
  const portfolio: Array<Record<string, unknown>> = [];
  const ctaChecks: Record<string, boolean> = {};

  for (const p of PLAN_PRODUCTS) {
    const sp = studio.find((x) => x.slug === p.slug);
    const entries: AngleEntry[] = [];
    // 1. existing approved or public videos count toward the three
    for (const ex of EXISTING.filter((e) => e.slug === p.slug)) {
      if (!sp) continue;
      const [v] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, sp.id), sql`${ms.msVideos.id}::text like ${`${ex.videoRowPrefix}%`}`)).limit(1);
      if (!v) throw new Error(`existing video ${ex.videoRowPrefix} for ${p.slug} not found`);
      const rec = v.storyboard as Partial<DemoRecord>;
      const pub = pubs.find((x) => x.videoId === v.id && x.status === "published");
      const rv = pub ? reviews.find((r) => r.publicationId === pub.id) : undefined;
      const isPublic = rv?.status === "approved_public" || (pub && !rv && v.status === "approved");
      entries.push({
        id: `${p.slug}-${ex.role === "A" ? "overview" : "demo"}-existing`,
        slug: p.slug,
        position: 1,
        role: ex.role,
        title: ex.title,
        hook: rec.transcript?.[0]?.caption ?? rec.transcript?.[0]?.text ?? ex.title,
        goal: ex.goal,
        audience: ex.audience,
        coreBenefit: ex.coreBenefit,
        features: ex.features,
        scenes: (rec.scenes ?? []).map((s) => s.id),
        cta: { text: rec.cta?.text ?? "", url: rec.cta?.url ?? p.home },
        status: isPublic ? "public" : "approved",
        approval: v.status === "approved" ? "owner_approved" : "pending",
        existing: true,
        funnel: ex.funnel,
        videoRowId: v.id,
        ...(pub?.externalPostId ? { youtubeId: pub.externalPostId, publicationId: pub.id, publicationUrl: pub.externalUrl ?? watchUrlFor(pub.externalPostId) } : {}),
      });
    }
    // 2. performance, when the video is public
    for (const e of entries) {
      if (e.publicationId && e.status === "public") {
        const m = await currentMetrics(db, e.publicationId);
        e.performance = Object.fromEntries(Object.entries(m.metrics).map(([k, v]) => [k, { value: v.value ?? null, status: v.status }]));
      }
    }
    // 3. proposals for the missing roles, each checked against everything already consumed
    for (const pl of PLANNED.filter((x) => x.slug === p.slug)) {
      const e = toEntry(pl);
      const gate = checkDistinct(e, entries);
      if (!gate.ok) {
        e.status = "blocked";
        rejected.push({ title: e.title, slug: e.slug, conflicts: gate.conflicts });
      }
      entries.push(e);
    }
    library[p.slug] = entries;
    // 4. the call-to-action link must be a real, reachable page on the product's own site
    for (const e of entries) {
      const key = `${e.id}`;
      ctaChecks[key] = hasVerifiedProductUrl(e, p.host) && (await urlOk(e.cta.url));
    }
    // 5. embed recommendations and distribution for every angle
    embedRecs[p.slug] = entries.filter(consumes).map((e) => {
      const path = (() => {
        try {
          return new URL(e.cta.url).pathname || "/";
        } catch {
          return "/";
        }
      })();
      const emb = e.youtubeId ? embedFor(e.youtubeId, e.title) : null;
      return {
        angleId: e.id,
        recommendedPage: e.role === "A" ? "/" : path,
        position: e.role === "A" ? "near the top of the page, beside the headline" : e.role === "B" ? "next to the feature or tool it demonstrates" : "at the top of the page that answers this one question",
        reason: e.role === "A" ? "it introduces the product to a first-time visitor" : e.role === "B" ? "it shows the real tool working, which a still screenshot cannot" : "it answers one specific question a visitor arrives with",
        intent: e.funnel === "cold" ? "learn what this is" : e.funnel === "interested" ? "see how it works before trying" : "decide to act on one specific need",
        embedUrl: emb?.embedUrl ?? null,
        status: e.status,
        note: "Recommendation only: Marketing Studio never edits a House Account website. Adding an embed is a separate, intentional development change.",
      };
    });
    for (const e of entries.filter(consumes)) {
      const d = DISTRIBUTION_BY_FUNNEL[e.funnel];
      distribution.push({ angleId: e.id, product: p.name, stage: d.stage, channels: d.channels, paid: d.paid, shortFormCut: e.role === "A" ? "derive a 10 to 15 second hook cut, not a repost of the same edit" : "derive a single-moment cut of the key interaction", status: e.status });
    }
    // 6. the iScream Studio portfolio card
    portfolio.push({
      slug: p.slug,
      name: p.name,
      blurb: p.blurb,
      visitUrl: p.home,
      videos: entries
        .filter((e) => e.status === "public" && e.youtubeId)
        .map((e) => ({ angleId: e.id, title: e.title, demonstrates: e.goal, youtubeId: e.youtubeId, watchUrl: watchUrlFor(e.youtubeId!), embedUrl: embedFor(e.youtubeId!, e.title).embedUrl, thumbnailUrl: `https://i.ytimg.com/vi/${e.youtubeId}/hqdefault.jpg`, visibility: "public" })),
      pendingVideos: entries.filter((e) => e.existing && e.status === "approved").map((e) => ({ angleId: e.id, title: e.title, note: "approved by the owner, not on YouTube yet" })),
      presentation: "Product card with Visit Product and a small Videos / See it in action section; no stack of large embeds",
    });
    plan.push({ slug: p.slug, name: p.name, inStudio: p.inStudio, existing: entries.filter((e) => e.existing).length, planned: entries.filter((e) => e.status === "planned").length, blocked: entries.filter((e) => e.status === "blocked").length });
  }

  // concepts rejected up front because they repeat an angle already consumed
  let rejectedUpFront = 0;
  for (const c of REJECTED_CANDIDATES) {
    const gate = checkDistinct(toEntry(c), library[c.slug] ?? []);
    if (!gate.ok) {
      rejectedUpFront++;
      rejected.push({ title: c.title, slug: c.slug, conflicts: gate.conflicts });
    }
  }

  // ---- matrix ----
  console.log("PORTFOLIO VIDEO LIBRARY: matrix\n");
  for (const p of PLAN_PRODUCTS) {
    console.log(`${p.name}${p.inStudio ? "" : "  (not yet in Marketing Studio: Product Truth and a demo spec are needed)"}`);
    for (const e of library[p.slug].filter((x) => x.status !== "blocked").sort((a, b) => a.position - b.position)) {
      const state = e.existing ? `${e.status.toUpperCase()}${e.youtubeId ? ` ${watchUrlFor(e.youtubeId)}` : ", not on YouTube yet"} (existing)` : "TO CREATE";
      console.log(`  ${e.position}. [${ROLE_LABEL[e.role]}] ${e.title} - ${state}\n       hook: "${e.hook}"  CTA: ${e.cta.text} -> ${e.cta.url}  ${ctaChecks[e.id] ? "link verified" : "LINK NOT VERIFIED"}`);
    }
    console.log("");
  }
  const existingCount = Object.values(library).flat().filter((e) => e.existing).length;
  const planned = Object.values(library).flat().filter((e) => e.status === "planned");
  const sameRole = PLAN_PRODUCTS.filter((p) => new Set(library[p.slug].filter(consumes).map((e) => e.role)).size !== library[p.slug].filter(consumes).length);
  const allCta = Object.entries(ctaChecks).filter(([, ok]) => !ok).map(([id]) => id);
  console.log(`products inventoried: ${PLAN_PRODUCTS.length}`);
  console.log(`existing approved/public videos counted: ${existingCount}`);
  console.log(`missing distinct videos planned: ${planned.length}`);
  console.log(`duplicate concepts rejected: ${rejectedUpFront} up front, ${rejected.length - rejectedUpFront} planned angles blocked by the gate`);
  console.log(`products where two angles share a role: ${sameRole.length}`);
  console.log(`CTA links not verified: ${allCta.length ? allCta.join(", ") : "none"}`);
  if (DRY) return;

  for (const p of PLAN_PRODUCTS) {
    await setSetting(angleKey(p.slug), library[p.slug], ACTOR, db);
    await setSetting(`product_site_embeds_${p.slug}`, embedRecs[p.slug], ACTOR, db);
  }
  await setSetting("video_library_plan", { decidedAt: "2026-11-08", rule: "three genuinely different videos per product; an approved or public video consumes its angle", products: plan, rejected, ctaChecks, generatedAt: new Date().toISOString() }, ACTOR, db);
  await setSetting("iscream_portfolio_videos", portfolio, ACTOR, db);
  await setSetting("video_distribution_plan", distribution, ACTOR, db);
  console.log("library stored: angle inventory, portfolio metadata, site embed recommendations, distribution plan");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());
