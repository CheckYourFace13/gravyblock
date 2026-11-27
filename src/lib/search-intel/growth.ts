/**
 * Growth opportunities (v2): what each site should DO to earn more qualified searches, visitors and sign-ups, ranked, deduplicated by root cause and
 * validated before anyone sees them. Pure functions over the stored analysis; nothing here touches a site.
 *
 * Ranking = traffic potential x business value x evidence quality x likelihood of success x systemic reach x learned weight / (effort x risk).
 * Categories: technical recovery, CTR optimization, ranking improvement, new search demand, conversion.
 * Rejected on purpose: generic hygiene warnings, single-page nits when a template is the cause, widget proposals, and anything whose text fails validation.
 */
import { expectedCtr } from "./analysis";
import { sectionOf, mobileGap, tokensOf } from "./deep";
import { profileFor } from "./profiles";
import { pickTop } from "./prompt";
import type { Improvement, SiteIntel } from "./types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

type Draft = Omit<Improvement, "priority"> & { traffic: number; value: number; evidenceQ: number; success: number; systemic: boolean; effort: number; risk: number };

export function scoreOf(d: Draft, learned: Record<string, number> = {}): number {
  const traffic = Math.log2(1 + Math.max(0, d.traffic)) * 10 + 1;
  return Number(((traffic * d.value * d.evidenceQ * d.success * (d.systemic ? 1.5 : 1) * (learned[d.kind] ?? 1)) / (d.effort * d.risk)).toFixed(2));
}

const BAD_TEXT = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\$\{/, /\bnull\b clicks/];
/** Rejects generated text that is corrupted or empty (for example words with letters stripped out) before it can reach an email. */
export function textLooksValid(s: string): boolean {
  if (!s.trim()) return false;
  if (BAD_TEXT.some((r) => r.test(s))) return false;
  const words = s.split(/\s+/).filter(Boolean);
  const stray = words.filter((w) => /^[b-hj-z]$/i.test(w)).length; // single letters other than "a" and "i"
  if (stray > Math.max(2, words.length * 0.03)) return false;
  // a long English sentence always contains each of the most common letters; one missing entirely means characters were stripped (the "Propo al" bug)
  const letters = s.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length >= 80 && [..."etaoinsr"].some((c) => !letters.includes(c))) return false;
  return true;
}

export function validateImprovement(i: Improvement): boolean {
  return textLooksValid(i.title) && i.evidence.length > 0 && i.evidence.every(textLooksValid) && i.actions.every(textLooksValid) && i.acceptance.length > 0;
}

export function growthOpportunities(intel: SiteIntel): Improvement[] {
  const deep = intel.deep;
  if (!deep) return [];
  const profile = profileFor(intel.site.name);
  const valuable = (urls: string[]) => (profile && urls.some((u) => profile.valuableSections.some((s) => (s === "/" ? pathOf(u) === "/" : pathOf(u).startsWith(s)))) ? 1.5 : 1);
  const w28 = `${deep.window28.start} to ${deep.window28.end}`;
  const sampleQ = intel.w28?.sample === "ok" ? 1 : 0.6;
  const drafts: Draft[] = [];
  const used = new Set<string>();

  // 1. Technical recovery: one item per root cause. Pages that lost everything are part of it, not separate "investigate the drop" tasks.
  const d = intel.indexing.dropped;
  if (d && d.lost >= 10) {
    const lostPages = (intel.pages28?.declining ?? []).filter((m) => m.imprCur === 0 && m.imprPrev > 0);
    for (const m of lostPages) used.add(m.key);
    const recheck = intel.indexing.rechecks[0];
    const v = recheck?.verdicts ?? {};
    const lostClicks = lostPages.reduce((s, m) => s + m.clicksPrev, 0);
    drafts.push({
      kind: "indexing", category: "technical recovery", issue: "indexing", identityUrls: [],
      title: "Restore the pages that dropped out of Google, keeping deliberate exclusions",
      urls: [...new Set([...lostPages.map((m) => m.key), ...d.sample])].slice(0, 6),
      evidence: [
        `GravyBlock's pages-dropped finding (its own comparison of two consecutive 28-day windows, separate from the performance windows above): ${d.lost} of ${d.before} pages that had Google impressions now have none (impressions ${d.impressionsBefore} to ${d.impressionsNow}).`,
        ...(lostPages.length ? [`In the latest 28 days (${w28}) versus the 28 before, ${lostPages.length} pages went to zero impressions, together losing ${lostClicks} clicks; the largest: ${lostPages.slice(0, 3).map((m) => `${pathOf(m.key)} (${m.clicksPrev} clicks before)`).join(", ")}.`] : []),
        recheck ? `Google URL Inspection on ${recheck.at.slice(0, 10)} for sampled pages: crawled but not indexed ${v.crawled_not_indexed ?? 0}, noindex tag ${v.noindex_tag ?? 0}, indexed ${v.indexed ?? 0}.` : "No URL Inspection recheck is stored yet.",
      ],
      competitorUrls: [],
      actions: [
        "First read the site's own indexing rules (meta robots logic, sitemap generation, any 'thin page' or 'unverified listing' safeguards). Some exclusions may be deliberate; do not undo a safeguard without saying why.",
        profile && intel.site.name === "The Drink Place"
          ? "Decide which venue pages deserve indexing: those with verified details (hours, happy-hour times, drink menu or specials). Make those pages clearly unique (venue-specific facts in the title, H1 and first paragraph), keep them in the sitemap with a self canonical, and keep thin or unverified listings excluded."
          : "Decide which excluded pages deserve indexing (unique, useful, earned traffic before). Make those clearly unique and linked from indexed pages; keep thin duplicates excluded.",
        "For 'crawled, not indexed' pages, improve uniqueness and internal links at the template level, not page by page.",
      ],
      acceptance: ["A table of sampled URLs: status, robots, canonical, in sitemap, before and after, with the reason each is indexed or deliberately excluded.", "URL Inspection live test reports 'URL is available to Google' for at least 5 pages that should be indexed."],
      potentialClicks28: Math.max(lostClicks, Math.round((d.impressionsBefore - d.impressionsNow) * 0.02)),
      traffic: Math.max(lostClicks, (d.impressionsBefore - d.impressionsNow) * 0.02), value: valuable(d.sample) + 0.5, evidenceQ: 1, success: 0.7, systemic: true, effort: 2, risk: 1.5,
    });
  }

  // 2. CTR: a template-level fix when several pages in one section are under-clicked, otherwise the single biggest page.
  const bySection = new Map<string, typeof intel.lowCtr>();
  for (const r of intel.lowCtr) (bySection.get(sectionOf(r.page)) ?? bySection.set(sectionOf(r.page), []).get(sectionOf(r.page))!).push(r);
  for (const [section, list] of [...bySection.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.clicksMissing, 0) - a[1].reduce((s, r) => s + r.clicksMissing, 0)).slice(0, 1)) {
    const missing = list.reduce((s, r) => s + r.clicksMissing, 0);
    if (missing < 5) continue;
    const pages = [...new Set(list.map((r) => r.page))];
    const systemic = pages.length >= 2;
    drafts.push({
      kind: systemic ? "systemic_ctr" : "low_ctr", category: "CTR optimization", issue: systemic ? `systemic_ctr:${section}` : "low_ctr", identityUrls: systemic ? [] : [pages[0]!],
      title: systemic ? `Rewrite the title and description pattern for ${section} pages so searchers click` : `Rewrite the title and description of ${pathOf(pages[0]!)} so searchers click`,
      urls: pages.slice(0, 5),
      evidence: list.slice(0, 4).map((r) => `"${r.query}" on ${pathOf(r.page)}: position ${r.position}, ${r.impressions} impressions, CTR ${pct(r.ctr)} where about ${pct(r.expected)} is typical (${w28}).`),
      competitorUrls: [],
      actions: [
        systemic ? `Change the ${section} title and meta-description TEMPLATE (not each page by hand) so every page leads with what searchers want from it${profile ? ` (${profile.audience})` : ""}, using the page's own facts.` : "Lead the title with the searcher's words and the page's specific benefit; keep it accurate.",
        "Keep URLs, canonicals and content unchanged.",
      ],
      acceptance: ["New titles and descriptions are live, unique, accurate and within length limits on every page of the template."],
      potentialClicks28: Math.round(missing * 0.3),
      traffic: missing * 0.3, value: valuable(pages), evidenceQ: sampleQ, success: 0.6, systemic, effort: 1, risk: 1,
    });
    pages.forEach((p) => used.add(p));
  }

  // 3. Mobile presentation gap.
  const mg = mobileGap(deep.devices);
  if (mg) {
    drafts.push({
      kind: "mobile_ctr", category: "CTR optimization", issue: "mobile_ctr", identityUrls: [],
      title: "Fix how results look and load on mobile: mobile searchers click far less than desktop at similar rankings",
      urls: intel.topPages.slice(0, 3).map((p) => p.page),
      evidence: [`Mobile CTR ${pct(mg.mobileCtr)} vs desktop ${pct(mg.desktopCtr)} at similar average positions, ${mg.mobileImpr} mobile impressions (${w28}).`],
      competitorUrls: [],
      actions: ["Check mobile titles (truncation), page speed and layout shift on the top pages; check that structured data renders the same on mobile."],
      acceptance: ["Mobile Lighthouse scores and visible titles verified on the top 3 pages."],
      potentialClicks28: Math.round(mg.mobileImpr * (mg.desktopCtr - mg.mobileCtr) * 0.3),
      traffic: mg.mobileImpr * (mg.desktopCtr - mg.mobileCtr) * 0.3, value: 1, evidenceQ: sampleQ, success: 0.5, systemic: true, effort: 1.5, risk: 1,
    });
  }

  // 4. Ranking improvement by topic: clusters already on page one or two.
  const total = deep.clusters.reduce((s, c) => s + c.impressions, 0) || 1;
  for (const c of deep.clusters.filter((x) => !x.branded && x.position >= 4 && x.position <= 20 && x.impressions >= Math.max(40, total * 0.04)).slice(0, 2)) {
    const page = c.pages[0]!;
    if (used.has(page)) continue;
    const refs = intel.competitors.queries.filter((q) => c.queries.includes(q.query));
    const gap = refs.flatMap((q) => q.gaps).slice(0, 2);
    const gain = c.impressions * Math.max(0, expectedCtr(Math.max(1, c.position - 3)) - c.ctr) * 0.5;
    const intentAction =
      c.intent === "local" ? "Make it the best answer for someone deciding right now: today's hours, what is on now (specials, happy hour, events), location and how to get there, above the fold."
      : c.intent === "transactional" ? "Make the offer and the next step unmistakable: price or availability where true, and one clear action."
      : "Answer the question in the first screen, then cover the related questions people search (listed in the evidence) in clearly headed sections.";
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `topic_ranking:${c.key}`, identityUrls: [page],
      title: `Win more of the "${c.label}" searches with ${pathOf(page)}`,
      urls: c.pages,
      evidence: [`Topic "${c.label}" (${c.queries.length} related queries, ${c.intent} intent): ${c.impressions} impressions, ${c.clicks} clicks, average position ${c.position} (${w28}). Queries: ${c.queries.slice(0, 5).map((q) => `"${q}"`).join(", ")}.`, ...gap.map((g) => `Competing page: ${g.evidence} (observed ${g.observedAt.slice(0, 10)}).`)],
      competitorUrls: refs.flatMap((q) => q.competitorPages.map((p) => `${p.url} ("${p.title}", observed ${p.observedAt.slice(0, 10)})`)).slice(0, 3),
      actions: [intentAction, "Add internal links to this page from related, already-indexed pages with descriptive anchor text.", "Write in the site's own voice from its own facts; do not copy competitor text or structure."],
      acceptance: ["The page answers each listed query in an obvious section; existing content and URL preserved."],
      potentialClicks28: Math.round(gain),
      traffic: gain, value: valuable([page]), evidenceQ: sampleQ, success: 0.45, systemic: false, effort: 2, risk: 1,
    });
    used.add(page);
  }

  // 4b. The biggest topic the site is visible for but far back (positions 21 to 60): the largest real demand it already touches. Depth and authority, not a rewrite.
  for (const c of deep.clusters.filter((x) => !x.branded && x.position > 20 && x.position <= 60 && x.impressions >= Math.max(300, total * 0.1)).slice(0, 1)) {
    const page = c.pages[0]!;
    if (used.has(page)) continue;
    const refs = intel.competitors.queries.filter((q) => c.queries.includes(q.query));
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `topic_ranking:${c.key}`, identityUrls: [page],
      title: `Build real depth for "${c.label}": the site's biggest search topic, currently far back at position ${c.position}`,
      urls: c.pages,
      evidence: [
        `Topic "${c.label}" (${c.queries.length} related queries, ${c.intent} intent): ${c.impressions} impressions but only ${c.clicks} clicks at average position ${c.position} (${w28}). Queries: ${c.queries.slice(0, 5).map((q) => `"${q}"`).join(", ")}.`,
        ...refs.flatMap((q) => q.gaps).slice(0, 2).map((g) => `Competing page: ${g.evidence} (observed ${g.observedAt.slice(0, 10)}).`),
      ],
      competitorUrls: refs.flatMap((q) => q.competitorPages.map((p) => `${p.url} ("${p.title}", observed ${p.observedAt.slice(0, 10)})`)).slice(0, 3),
      actions: [
        `Make ${pathOf(page)} the most useful page for this intent using the site's own knowledge (verified options, prices or availability where true, how to choose, what to expect), not a longer generic article.`,
        "Link to it from every related page on the site with descriptive anchor text; GravyBlock's off-site promotion will point earned mentions at this page.",
      ],
      acceptance: ["The page clearly answers the listed searches with original, specific information; no new thin pages were created."],
      potentialClicks28: Math.round(c.impressions * 0.01),
      traffic: c.impressions * 0.01, value: valuable([page]) + 0.3, evidenceQ: sampleQ, success: 0.25, systemic: false, effort: 2.5, risk: 1,
    });
    used.add(page);
  }

  // 4c. Searches that appeared this window with real impressions: early demand worth meeting while it is new.
  for (const q of deep.emerging.filter((x) => x.impressions >= 50).slice(0, 1)) {
    const page = deep.pageQuery.find((r) => r.query === q.key)?.page;
    if (page && used.has(page)) continue;
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `emerging:${q.key}`, identityUrls: page ? [page] : [],
      title: `Meet the new "${q.key}" searches while they are new`,
      urls: page ? [page] : [],
      evidence: [`"${q.key}" had no impressions in the 28 days before and ${q.impressions} in the latest 28 days (${w28}) at position ${q.position.toFixed(1)}${page ? `, shown for ${pathOf(page)}` : ""}.`],
      competitorUrls: [],
      actions: [page ? `Check that ${pathOf(page)} genuinely serves this search; if it does, say so plainly in its title, first heading and opening; if not, point the searcher to the page that does.` : "Find the page that best serves this search and make that explicit in its title and opening."],
      acceptance: ["The page matching this search names it plainly and answers it in the first screen."],
      potentialClicks28: Math.round(q.impressions * 0.03),
      traffic: q.impressions * 0.03, value: valuable(page ? [page] : []), evidenceQ: 0.7, success: 0.4, systemic: false, effort: 1, risk: 1,
    });
    if (page) used.add(page);
  }

  // 5. Cannibalization.
  const can = deep.cannibal.find((x) => x.impressions >= 100 && !x.pages.some((p) => used.has(p.page)));
  if (can) {
    drafts.push({
      kind: "cannibalization", category: "ranking improvement", issue: `cannibalization:${can.query}`, identityUrls: can.pages.map((p) => p.page),
      title: `Pick one page for "${can.query}": ${can.pages.length} of the site's pages split it`,
      urls: can.pages.map((p) => p.page),
      evidence: [`"${can.query}": ${can.impressions} impressions split across ${can.pages.map((p) => `${pathOf(p.page)} (${p.impressions} at position ${p.position})`).join(", ")} (${w28}).`],
      competitorUrls: [],
      actions: ["Choose the page that best serves the intent; point the others to it with contextual internal links and differentiate their titles toward their own topics. Do not delete or redirect pages without approval."],
      acceptance: ["One clearly primary page for the query; the others re-targeted, not removed."],
      potentialClicks28: Math.round(can.impressions * 0.02),
      traffic: can.impressions * 0.02, value: valuable(can.pages.map((p) => p.page)), evidenceQ: sampleQ, success: can.pages[0]!.position > 40 ? 0.25 : 0.5, systemic: false, effort: 1.5, risk: 1.3,
    });
  }

  // 6. New search demand the site does not capture yet (from public autocomplete; no volumes exist, so no click estimate is made).
  const month = new Date(intel.generatedAt).getUTCMonth() + 1;
  const seasonNow = profile?.seasonal?.find((s) => s.months.some((m) => m === month || m === (month % 12) + 1 || m === ((month + 1) % 12) + 1));
  for (const g of deep.demand.uncaptured.slice(0, 2)) {
    const toks = tokensOf(g.label);
    const seasonal = Boolean(seasonNow && toks.some((t) => seasonNow.topic.toLowerCase().includes(t)));
    const section = profile?.valuableSections.find((s) => s !== "/" && toks.some((t) => s.includes(t))) ?? null;
    drafts.push({
      kind: "new_demand", category: "new search demand", issue: `new_demand:${toks.slice(0, 2).sort().join(" ")}`, identityUrls: [],
      title: `Capture "${g.label}" searches the site is not found for yet`,
      urls: section && intel.site.website ? [`${intel.site.website.replace(/\/$/, "")}${section}`] : [],
      evidence: [
        `People type these into search (${deep.demand.source}, checked ${deep.demand.checkedAt.slice(0, 10)}; this shows the searches exist, not how many): ${g.queries.map((q) => `"${q}"`).join(", ")}.`,
        "The site had no Search Console impressions for these words in the latest 28 days or the 28 before.",
        ...(seasonal && seasonNow ? [`Seasonal: ${seasonNow.topic} peaks soon, so this is time-sensitive.`] : []),
      ],
      competitorUrls: g.competitorPages.map((p) => `${p.url} ("${p.title}", observed ${p.observedAt.slice(0, 10)})`),
      actions: [
        section ? `Extend the existing ${section} pages to serve this intent before creating anything new.` : "Find the existing page closest to this intent and extend it before creating anything new.",
        ...(profile?.demandHint ? [profile.demandHint] : []),
        "If a new page or tool is justified, build ONE substantive, original page that genuinely serves the searcher (no thin or templated near-duplicates), and link it from relevant indexed pages.",
        profile ? `Tie it to the site's conversion: ${profile.conversions[0]}.` : "Give the visitor an obvious next step.",
      ],
      acceptance: ["The intent is served by one clearly focused page with original content; no batch of thin pages was created."],
      potentialClicks28: 0,
      traffic: 6 + g.queries.length * 3, value: section ? 1.5 : 1.2, evidenceQ: 0.5, success: 0.35, systemic: false, effort: 2.5, risk: 1,
    });
  }

  // 7. Conversion: only where real search visitors land on pages without the site's own next step (never a generic warning).
  const noPath = intel.openBriefs.find((b) => b.subtype === "no_conversion_path");
  const landing = intel.topPages.filter((p) => p.clicks >= 3 && (noPath?.urls ?? []).includes(p.page));
  if (profile && landing.length) {
    drafts.push({
      kind: "conversion", category: "conversion", issue: "conversion:search_landing", identityUrls: [],
      title: `Give search visitors the site's next step (${profile.conversions[0]}) on the pages they land on`,
      urls: landing.map((p) => p.page),
      evidence: [`${landing.map((p) => `${pathOf(p.page)} (${p.clicks} search clicks)`).join(", ")} received Google clicks in ${w28} and GravyBlock's check found no clear call to action there.`],
      competitorUrls: [],
      actions: [`Add one prominent, relevant call to action for ${profile.conversions[0]} on these templates; do not add pop-ups that cover content.`],
      acceptance: ["The call to action is visible above the fold on mobile and desktop on each listed page."],
      potentialClicks28: 0,
      traffic: landing.reduce((s, p) => s + p.clicks, 0), value: 2, evidenceQ: 0.8, success: 0.5, systemic: landing.length >= 2, effort: 1.5, risk: 1,
    });
  }

  const scored: Improvement[] = drafts.map(({ traffic: _t, value: _v, evidenceQ: _e, success: _s, systemic: _y, effort: _f, risk: _r, ...rest }) => ({ ...rest, priority: scoreOf({ ...rest, traffic: _t, value: _v, evidenceQ: _e, success: _s, systemic: _y, effort: _f, risk: _r }, deep.learnedWeights) }));
  // deduplicate by root cause: the same page and category never appears twice
  const seen = new Set<string>();
  const unique = scored.sort((a, b) => b.priority - a.priority).filter((i) => {
    const k = `${i.category}|${i.urls[0] ?? i.issue}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.filter(validateImprovement);
}

/** The 3 to 5 opportunities to act on now. */
export const topOpportunities = (list: Improvement[]): Improvement[] => pickTop(list, 5);
