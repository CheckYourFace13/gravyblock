/**
 * Growth opportunities (v3): what each site should DO to earn more qualified searches, visitors, sign-ups and customers, ranked, deduplicated by root cause and
 * validated before anyone sees them. Pure functions over the stored analysis; nothing here touches a site.
 *
 * Ranking = realistic extra clicks x likelihood of getting them x business value x evidence quality x systemic reach x learned weight / (effort x risk).
 * "Realistic" matters: a page at position 60 with many impressions is NOT automatically worth more than a page at position 8, because moving from 60 to page
 * one is far less likely and takes far longer. Every item says when it can pay off (quick win, medium term, long term), how confident GravyBlock is, how it
 * brings more relevant visitors (not a better SEO score), and how success will be measured.
 * Categories: technical recovery, CTR optimization, ranking improvement, new search demand, conversion.
 * Rejected on purpose: generic hygiene warnings, single-page nits when a template is the cause, widget proposals, weak demand, and any corrupted text.
 */
import { expectedCtr } from "./analysis";
import { sectionOf, mobileGap, onTopic, tokensOf, intentOf } from "./deep";
import { profileFor, type SiteProfile } from "./profiles";
import { pickTop } from "./prompt";
import type { Improvement, IntentResearch, SiteIntel } from "./types";

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

/**
 * What a ranking improvement can realistically earn: the target is a position the page can plausibly reach in the next few months (three places up on page one,
 * the middle of page one from page two, the bottom of page one from further back), and the likelihood falls the further back the page starts.
 */
export function realisticGain(position: number, impressions: number, ctr: number): { clicks: number; success: number; target: number; horizon: NonNullable<Improvement["horizon"]> } {
  const target = position <= 3 ? position : position <= 10 ? Math.max(1, position - 3) : position <= 20 ? 6 : position <= 40 ? 10 : 15;
  const success = position <= 10 ? 0.8 : position <= 20 ? 0.55 : position <= 40 ? 0.3 : position <= 80 ? 0.12 : 0.05;
  const horizon = position <= 10 ? "quick win" : position <= 20 ? "medium term" : "long term";
  return { clicks: Math.max(0, impressions * (expectedCtr(target) - ctr)), success, target, horizon };
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
  if (letters.length >= 80 && [..."etoinsr"].some((c) => !letters.includes(c))) return false; // not "a": real sentences can lack it ("position 17.1, 72 impressions, 1 clicks")
  return true;
}

export function validateImprovement(i: Improvement): boolean {
  return textLooksValid(i.title) && i.evidence.length > 0 && i.evidence.every(textLooksValid) && i.actions.every(textLooksValid) && i.acceptance.length > 0 && (!i.why || textLooksValid(i.why));
}

/** The site priority a set of searches serves best, in the owner's own terms, so "why" names a business outcome. */
function priorityFor(profile: SiteProfile | null, words: string[]): string | null {
  if (!profile?.priorities?.length) return profile?.conversions[0] ?? null;
  const toks = new Set(words.flatMap(tokensOf));
  const scored = profile.priorities.map((p) => ({ p, n: tokensOf(p).filter((t) => toks.has(t)).length }));
  const best = scored.sort((a, b) => b.n - a.n)[0]!;
  return best.n > 0 ? best.p : profile.priorities[0]!;
}

function intentFor(deep: NonNullable<SiteIntel["deep"]>, label: string, queries: string[]): IntentResearch | null {
  const toks = new Set([label, ...queries].flatMap(tokensOf));
  let best: { r: IntentResearch; n: number } | null = null;
  for (const r of deep.intents ?? []) {
    const n = tokensOf(r.label).filter((t) => toks.has(t)).length / Math.max(1, tokensOf(r.label).length);
    if (n >= 0.6 && (!best || n > best.n)) best = { r, n };
  }
  return best?.r ?? null;
}

const competitorLines = (r: IntentResearch | null): string[] => {
  if (!r?.competitorPages.length) return [];
  const out = [`Competing pages published for this intent (relevant competitors' own sites, observed ${r.observedAt.slice(0, 10)}; publishing is not a ranking): ${r.competitorPages.map((p) => `${p.url} ("${p.title.slice(0, 70)}", about ${p.words} words${p.hasTool ? ", has a tool" : ""}${p.tables ? `, ${p.tables} table(s)` : ""})`).join("; ")}.`];
  if (r.theyCover.length) out.push(`Sections those pages have that ours does not mention: ${r.theyCover.slice(0, 4).join("; ")}.`);
  if (r.weDoBetter.length) out.push(`Ours already does better: ${r.weDoBetter.join("; ")}. Keep it.`);
  return out;
};

export function growthOpportunities(intel: SiteIntel): Improvement[] {
  const deep = intel.deep;
  if (!deep) return [];
  const profile = profileFor(intel.site.name);
  const w28 = `${deep.window28.start} to ${deep.window28.end}`;
  const sampleQ = intel.w28?.sample === "ok" ? 1 : 0.6;
  const drafts: Draft[] = [];
  const used = new Set<string>();
  /** business value 1 to 2.2: the site's money sections, its value words, and intents close to a visit or sign-up */
  const valueOf = (urls: string[], words: string[] = [], intent?: string) => {
    let v = 1;
    if (profile && urls.some((u) => profile.valuableSections.some((s) => (s === "/" ? pathOf(u) === "/" : pathOf(u).startsWith(s))))) v += 0.4;
    const toks = new Set(words.flatMap(tokensOf));
    if (profile?.valueWords?.some((w) => toks.has(tokensOf(w)[0] ?? w))) v += 0.4;
    if (intent === "transactional" || intent === "local") v += 0.4;
    return Math.min(2.2, v);
  };
  const conv = profile?.conversions[0] ?? "the site's main next step";
  const inValuable = (u: string) => Boolean(profile?.valuableSections.some((s) => s !== "/" && pathOf(u).startsWith(s)));
  /** a search worth working on: on the site's topic, or landing on one of its money sections (a venue-name search reaching a venue page is real venue discovery) */
  const relevant = (q: string, page?: string) => !profile || onTopic(q, profile.topicWords) || (page ? inValuable(page) : false);

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
      horizon: "medium term", confidence: recheck ? "high" : "medium", scope: "template",
      why: `These pages already proved they attract searchers (${lostClicks || "some"} clicks before they dropped out). Restoring the ones worth indexing brings back visitors who were already finding the site${profile ? `, and with them ${conv}` : ""}.`,
      uncertainty: "Some exclusions may be deliberate quality safeguards; Google decides what it indexes and can take weeks to re-crawl.",
      measure: "Impressions and clicks of the restored pages over the 28 days after the fix, and their URL Inspection status.",
      traffic: Math.max(lostClicks, (d.impressionsBefore - d.impressionsNow) * 0.02), value: valueOf(d.sample) + 0.3, evidenceQ: 1, success: 0.7, systemic: true, effort: 2, risk: 1.5,
    });
  }

  // 2. A whole section (page template) losing visibility together, when it is not already the indexing item above.
  const droppedSections = new Set((d?.sample ?? []).map(sectionOf));
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
  /** a loss the site made on purpose (the page now redirects, is noindexed, or names another page as canonical) is not a problem to fix */
  const deliberate = (u: string) => {
    const c = deep.lossChecks?.find((x) => norm(x.url) === norm(u));
    return Boolean(c && c.status !== null && (norm(c.finalUrl) !== norm(u) || !c.indexable || (c.canonical && !/^\//.test(c.canonical) && norm(c.canonical) !== norm(u))));
  };
  /** the searches moved to another page of the same site (Google now prefers a better page): not a loss */
  const shifted = (u: string, lost: number) => (intel.pages28?.rising ?? []).filter((m) => m.key !== u && sectionOf(m.key) === sectionOf(u)).reduce((s2, m) => s2 + Math.max(0, m.imprCur - m.imprPrev), 0) >= lost * 0.5;
  // only when visitors were really lost: a section that lost impressions far back on page five costs almost no one
  for (const t of (deep.templateLosses ?? []).filter((x) => !droppedSections.has(x.section) && x.section !== "/" && (x.clicksPrev >= 5 || x.clicksPrev - x.clicks >= 3)).slice(0, 1)) {
    const pages = (intel.pages28?.declining ?? []).filter((m) => sectionOf(m.key) === t.section).slice(0, 5).map((m) => m.key);
    const checked = pages.filter((p) => deep.lossChecks?.some((x) => norm(x.url) === norm(p)));
    if (checked.length && checked.every(deliberate)) continue; // the section's losing pages were redirected or excluded on purpose
    const lostImpr = t.impressionsPrev - t.impressions;
    const prevCtr = t.impressionsPrev ? t.clicksPrev / t.impressionsPrev : 0.01;
    drafts.push({
      kind: "template_loss", category: "technical recovery", issue: `template_loss:${t.section}`, identityUrls: [],
      title: `Find why the whole ${t.section} section is losing Google visibility`,
      urls: pages,
      evidence: [`${t.section} pages: impressions ${t.impressionsPrev} to ${t.impressions}, clicks ${t.clicksPrev} to ${t.clicks}, pages with impressions ${t.pagesPrev} to ${t.pages} (${w28} against the 28 days before).`],
      competitorUrls: [],
      actions: [
        `Check recent changes to the ${t.section} template in git history (titles, canonical, robots, internal links, rendering) and compare a page that lost visibility with one that held up.`,
        "Fix the template, not individual pages; if no defect is found, record that the loss is seasonal or algorithmic instead of changing anything.",
      ],
      acceptance: ["A written cause with evidence (defect, seasonal or unknown) and a template-level fix only where a defect was found."],
      potentialClicks28: Math.round(lostImpr * prevCtr),
      horizon: "medium term", confidence: "medium", scope: "template",
      why: `The section lost ${lostImpr} impressions in 28 days; a template defect would keep costing visitors on every page of it.`,
      uncertainty: "The loss may be seasonal or a Google ranking change rather than a defect on the site.",
      measure: "The section's impressions and clicks over the next 28 days against the latest 28.",
      traffic: lostImpr * prevCtr, value: valueOf(pages), evidenceQ: sampleQ, success: 0.5, systemic: true, effort: 1.5, risk: 1.2,
    });
    pages.forEach((p) => used.add(p));
  }

  // 2b. One important page that collapsed (most of its impressions gone), outside a pages-dropped finding: find the cause before anything else is built on it.
  const collapsed = (intel.pages28?.declining ?? []).filter((m) => !used.has(m.key) && m.imprPrev >= 300 && m.imprCur < m.imprPrev * 0.3 && m.imprCur > 0 && !droppedSections.has(sectionOf(m.key)) && m.clicksPrev >= 2 && !deliberate(m.key) && !shifted(m.key, m.imprPrev - m.imprCur))
    .sort((a, b) => b.imprPrev - b.imprCur - (a.imprPrev - a.imprCur))[0];
  if (collapsed) {
    const lost = collapsed.imprPrev - collapsed.imprCur;
    drafts.push({
      kind: "template_loss", category: "technical recovery", issue: `page_loss:${pathOf(collapsed.key)}`, identityUrls: [collapsed.key],
      title: `Find why ${pathOf(collapsed.key)} lost ${Math.min(99, Math.round((lost / collapsed.imprPrev) * 100))}% of its Google impressions`,
      urls: [collapsed.key],
      evidence: [`${pathOf(collapsed.key)}: impressions ${collapsed.imprPrev} to ${collapsed.imprCur}, clicks ${collapsed.clicksPrev} to ${collapsed.clicksCur}, position ${collapsed.posPrev === null ? "n/a" : collapsed.posPrev.toFixed(1)} to ${collapsed.posCur === null ? "n/a" : collapsed.posCur.toFixed(1)} (${w28} against the 28 days before).`],
      competitorUrls: [],
      actions: [
        "Check the page is live, indexable, self-canonical and in the sitemap; check git history for recent changes to its title, content, URL or internal links; check whether another page of the site now takes its searches.",
        "Fix a defect if one is found; otherwise record the cause (seasonal, competitor, Google update) and leave the page unchanged.",
      ],
      acceptance: ["A written cause with evidence, and a fix only where a defect was found."],
      potentialClicks28: Math.max(collapsed.clicksPrev - collapsed.clicksCur, Math.round(lost * expectedCtr(collapsed.posPrev ?? 30))),
      horizon: "quick win", confidence: "medium", scope: "page",
      why: `The page was visible to ${collapsed.imprPrev} searches in 28 days and is now nearly gone; if a defect caused it, fixing it brings back proven visibility quickly.`,
      uncertainty: "A ranking drop can also come from competitors or a Google update, which no site change undoes quickly.",
      measure: `The page's impressions and clicks over the next 28 days (now ${collapsed.imprCur} impressions).`,
      traffic: Math.max(collapsed.clicksPrev - collapsed.clicksCur, lost * expectedCtr(collapsed.posPrev ?? 30)), value: valueOf([collapsed.key]), evidenceQ: sampleQ, success: 0.55, systemic: false, effort: 1, risk: 1,
    });
    used.add(collapsed.key);
  }

  // 3. CTR: a template-level fix when several pages in one section are under-clicked, otherwise the single biggest page. Only where already on page one.
  const bySection = new Map<string, typeof intel.lowCtr>();
  for (const r of intel.lowCtr.filter((x) => x.position <= 8)) (bySection.get(sectionOf(r.page)) ?? bySection.set(sectionOf(r.page), []).get(sectionOf(r.page))!).push(r);
  for (const [section, list] of [...bySection.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.clicksMissing, 0) - a[1].reduce((s, r) => s + r.clicksMissing, 0)).slice(0, 1)) {
    const missing = list.reduce((s, r) => s + r.clicksMissing, 0);
    if (missing < 5) continue;
    const pages = [...new Set(list.map((r) => r.page))];
    if (pages.some((p) => used.has(p))) continue;
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
      targetQueries: list.slice(0, 4).map((r) => r.query),
      horizon: "quick win", confidence: intel.w28?.sample === "ok" ? "medium" : "low", scope: systemic ? "template" : "page",
      why: "Google already shows these pages on page one; a result that says plainly what the searcher gets turns impressions the site already earns into visits.",
      uncertainty: "Google may rewrite titles, and rich results or ads above the page also lower clicks.",
      measure: "CTR and clicks of the listed queries over the 28 days after the change, at similar positions.",
      traffic: missing * 0.3, value: valueOf(pages, list.map((r) => r.query)), evidenceQ: sampleQ, success: 0.6, systemic, effort: 1, risk: 1,
    });
    pages.forEach((p) => used.add(p));
  }

  // 4. Mobile presentation gap.
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
      horizon: "quick win", confidence: "medium", scope: "site",
      why: "Most searchers are on phones; if they skip the result there, the site loses visitors it already ranks for.",
      uncertainty: "Mobile and desktop results pages differ, so part of the gap may be layout rather than the site.",
      measure: "Mobile CTR over the next 28 days against desktop.",
      traffic: mg.mobileImpr * (mg.desktopCtr - mg.mobileCtr) * 0.3, value: 1, evidenceQ: sampleQ, success: 0.5, systemic: true, effort: 1.5, risk: 1,
    });
  }

  // 5b. Single searches already on page one or two that a topic did not cover (a tool page at position 14 is often the most valuable lift on the site).
  const bandRows = [...(intel.bands?.b4_10 ?? []), ...(intel.bands?.b11_20 ?? [])].filter((b) => b.impressions >= 30 && !used.has(b.page) && relevant(b.query, b.page));
  for (const b of bandRows.sort((x, y) => realisticGain(y.position, y.impressions, y.clicks / y.impressions).clicks * valueOf([y.page], [y.query]) - realisticGain(x.position, x.impressions, x.clicks / x.impressions).clicks * valueOf([x.page], [x.query])).slice(0, 4)) {
    if (used.has(b.page)) continue;
    const ctr = b.clicks / Math.max(1, b.impressions);
    const g = realisticGain(b.position, b.impressions, ctr);
    const intent = intentOf(b.query);
    const research = intentFor(deep, b.query, [b.query]);
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `query_ranking:${b.query}`, identityUrls: [b.page],
      title: b.position <= 10 ? `Move "${b.query}" from position ${b.position} toward the top 3 with ${pathOf(b.page)}` : `Lift "${b.query}" from page two (position ${b.position}) onto page one with ${pathOf(b.page)}`,
      urls: [b.page],
      evidence: [`"${b.query}": position ${b.position}, ${b.impressions} impressions, ${b.clicks} clicks (${w28}), shown for ${pathOf(b.page)}.`, ...competitorLines(research)],
      competitorUrls: (research?.competitorPages ?? []).map((p) => `${p.url} ("${p.title.slice(0, 70)}", observed ${p.observedAt.slice(0, 10)})`).slice(0, 3),
      actions: [
        `Make ${pathOf(b.page)} the clearest answer to "${b.query}": say it plainly in the title, first heading and opening, and put what the searcher came for (${intent === "transactional" ? "the tool or offer and its next step" : intent === "local" ? "what is open or available now and where" : "the direct answer"}) in the first screen.`,
        "Link to it from related, already-indexed pages with descriptive anchor text.",
        "Keep its URL, canonical and existing content; add, do not rewrite.",
      ],
      acceptance: ["The page answers the search in its first screen; URL, canonical and structured data preserved."],
      potentialClicks28: Math.round(g.clicks * g.success),
      targetQueries: [b.query],
      horizon: g.horizon, confidence: intel.w28?.sample === "ok" ? "medium" : "low", scope: "page",
      why: `Google already shows ${pathOf(b.page)} for "${b.query}" at position ${b.position}; ${b.position <= 10 ? "moving up a few places on page one" : "reaching page one"} is where most of the clicks are${priorityFor(profile, [b.query]) ? `, and it serves the site's priority: ${priorityFor(profile, [b.query])}` : ""}.`,
      uncertainty: "Rankings also depend on competitors and Google updates; changes usually show within 4 to 8 weeks.",
      measure: `Position and clicks for "${b.query}" over the 28 days after the change (now position ${b.position}, ${b.clicks} clicks).`,
      traffic: g.clicks, value: valueOf([b.page], [b.query], intent), evidenceQ: sampleQ, success: g.clicks < 3 ? g.success * 0.6 : g.success, systemic: false, effort: 1.5, risk: 1,
    });
    used.add(b.page);
  }

  // 5. Ranking improvement by topic, scored by what is realistically reachable (position 8 beats position 60 even with fewer impressions).
  const total = deep.clusters.reduce((s, c) => s + c.impressions, 0) || 1;
  const rankable = deep.clusters.filter((x) => !x.branded && x.position >= 4 && x.position <= 80 && x.impressions >= Math.max(30, total * 0.03) && relevant(x.label, x.pages[0]));
  for (const c of rankable.slice(0, 6)) {
    const page = c.pages[0]!;
    if (used.has(page)) continue;
    const g = realisticGain(c.position, c.impressions, c.ctr);
    const research = intentFor(deep, c.label, c.queries);
    const refs = intel.competitors.queries.filter((q) => c.queries.includes(q.query));
    const intentAction =
      c.intent === "local" ? "Make it the best answer for someone deciding right now: today's hours, what is on now (specials, happy hour, events), location and how to get there, above the fold."
      : c.intent === "transactional" ? "Make the offer and the next step unmistakable: price or availability where true, and one clear action."
      : "Answer the question in the first screen, then cover the related questions people search (listed in the evidence) in clearly headed sections.";
    const title =
      c.position <= 10 ? `Move "${c.label}" from position ${c.position} toward the top 3 with ${pathOf(page)}`
      : c.position <= 20 ? `Lift "${c.label}" from page two (position ${c.position}) onto page one with ${pathOf(page)}`
      : `Build real depth for "${c.label}": ${c.impressions} impressions but far back at position ${c.position}`;
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `topic_ranking:${c.key}`, identityUrls: [page],
      title,
      urls: c.pages,
      evidence: [
        `Topic "${c.label}" (${c.queries.length} related queries, ${c.intent} intent): ${c.impressions} impressions, ${c.clicks} clicks, average position ${c.position} (${w28}). Queries: ${c.queries.slice(0, 5).map((q) => `"${q}"`).join(", ")}.`,
        ...competitorLines(research),
        ...(!research ? refs.flatMap((q) => q.gaps).slice(0, 2).map((x) => `Competing page: ${x.evidence} (observed ${x.observedAt.slice(0, 10)}).`) : []),
      ],
      competitorUrls: (research?.competitorPages.map((p) => `${p.url} ("${p.title.slice(0, 70)}", observed ${p.observedAt.slice(0, 10)})`) ?? refs.flatMap((q) => q.competitorPages.map((p) => `${p.url} ("${p.title}", observed ${p.observedAt.slice(0, 10)})`))).slice(0, 3),
      actions: [
        intentAction,
        ...(research?.theyCover.length ? [`Where it genuinely helps the searcher, cover what competing pages answer and ours does not (in the site's own words and data): ${research.theyCover.slice(0, 3).map((x) => x.replace(/ \(https?:[^)]+\)$/, "")).join("; ")}.`] : []),
        ...(c.position > 20 ? [`Make ${pathOf(page)} the most useful page for this intent using the site's own knowledge (verified options, prices or availability where true, how to choose, what to expect), not a longer generic article.`] : []),
        "Add internal links to this page from related, already-indexed pages with descriptive anchor text.",
        "Write in the site's own voice from its own facts; do not copy competitor text or structure.",
      ],
      acceptance: ["The page answers each listed query in an obvious section; existing content and URL preserved."],
      potentialClicks28: Math.round(g.clicks * g.success),
      targetQueries: c.queries.slice(0, 6),
      horizon: g.horizon, confidence: c.position <= 20 && intel.w28?.sample === "ok" ? "medium" : "low", scope: "page",
      why: `People already search "${c.label}" and Google already shows ${pathOf(page)} for it (${c.impressions} impressions in 28 days). Moving from position ${c.position} toward ${g.target} is where those impressions become visitors${priorityFor(profile, c.queries) ? `, serving the site's priority: ${priorityFor(profile, c.queries)}` : ""}.`,
      uncertainty: c.position > 20 ? "Far-back topics usually need authority (links, mentions) as well as a better page; results take months, if they come." : "Rankings also depend on competitors and Google updates; improvements usually show within 4 to 8 weeks.",
      measure: `Average position and clicks for these queries over the 28 days after the change (now: position ${c.position}, ${c.clicks} clicks).`,
      traffic: g.clicks, value: valueOf([page], c.queries, c.intent), evidenceQ: sampleQ, success: g.clicks < 3 ? g.success * 0.6 : g.success, systemic: false, effort: c.position > 20 ? 2.5 : 2, risk: 1,
    });
    used.add(page);
  }

  // 6. Searches that appeared this window (or keep gaining over 90 days) with real impressions: early demand worth meeting while it is new.
  const gaining = (deep.queries90?.gaining ?? []).map((g) => ({ key: g.key, clicks: g.clicksCur, impressions: g.imprCur, position: g.posCur ?? 0, prev: g.imprPrev }));
  const fresh = [...deep.emerging.map((e) => ({ ...e, prev: 0 })), ...gaining.filter((g) => !deep.emerging.some((e) => e.key === g.key))].filter((x) => x.impressions >= 50);
  // only searches on the site's topic or landing on its money sections; many impressions on page one with no clicks at all means searchers want something
  // else (often another company's brand), so it is not an opportunity however big
  const freshOk = fresh.filter((q) => {
    const page = deep.pageQuery.find((r) => r.query === q.key)?.page;
    if (!relevant(q.key, page)) return false;
    return !(q.position > 0 && q.position <= 10 && q.impressions >= 300 && q.clicks === 0 && !(page && inValuable(page)));
  });
  for (const q of freshOk.slice(0, 1)) {
    const page = deep.pageQuery.find((r) => r.query === q.key)?.page;
    if (page && used.has(page)) continue;
    if (page && q.position > 0 && q.position <= 10 && q.impressions >= 300 && q.clicks === 0) {
      const gain = q.impressions * expectedCtr(q.position) * 0.3;
      drafts.push({
        kind: "low_ctr", category: "CTR optimization", issue: `zero_click:${q.key}`, identityUrls: [page],
        title: `Searchers see ${pathOf(page)} for "${q.key}" but never click: make the result show what they want`,
        urls: [page],
        evidence: [`"${q.key}": ${q.impressions} impressions at position ${q.position.toFixed(1)} with 0 clicks (${q.prev === 0 ? `new in ${w28}` : `latest 90 days, was ${q.prev}`}), shown for ${pathOf(page)}.`],
        competitorUrls: [],
        actions: [
          `Put what this searcher wants in the result itself: name it in ${pathOf(page)}'s title and description${profile?.priorities?.[0] ? ` (for this site: ${profile.priorities[0]})` : ""}, using the page's own verified facts. If the page cannot answer it, leave it and say so.`,
          "Apply the same pattern to the page template if other pages of this type show the same zero-click searches.",
        ],
        acceptance: ["The title and description name what the searcher is looking for, truthfully; URL and content unchanged."],
        potentialClicks28: Math.round(gain),
        targetQueries: [q.key],
        horizon: "quick win", confidence: "low", scope: "page",
        why: `Google already puts ${pathOf(page)} on page one for this search, yet no one clicks; a result that shows the answer they came for (for example a menu, hours or happy-hour times) is the cheapest way to turn those impressions into visitors.`,
        uncertainty: "Zero clicks can also mean searchers want the business's own website, which no title change will win.",
        measure: `Clicks and CTR for "${q.key}" over the next 28 days (now 0).`,
        traffic: gain, value: valueOf([page], [q.key]), evidenceQ: 0.7, success: 0.4, systemic: false, effort: 1, risk: 1,
      });
      used.add(page);
      continue;
    }
    const g = realisticGain(q.position || 30, q.impressions, q.clicks / Math.max(1, q.impressions));
    drafts.push({
      kind: "topic_ranking", category: "ranking improvement", issue: `emerging:${q.key}`, identityUrls: page ? [page] : [],
      title: `Meet the growing "${q.key}" searches while they are new`,
      urls: page ? [page] : [],
      evidence: [q.prev === 0 ? `"${q.key}" had no impressions in the 28 days before and ${q.impressions} in the latest 28 days (${w28}) at position ${q.position.toFixed(1)}${page ? `, shown for ${pathOf(page)}` : ""}.` : `"${q.key}" grew from ${q.prev} to ${q.impressions} impressions comparing the latest 90 days with the 90 before, at position ${q.position.toFixed(1)}${page ? `, shown for ${pathOf(page)}` : ""}.`],
      competitorUrls: [],
      actions: [page ? `Check that ${pathOf(page)} genuinely serves this search; if it does, say so plainly in its title, first heading and opening; if not, point the searcher to the page that does.` : "Find the page that best serves this search and make that explicit in its title and opening."],
      acceptance: ["The page matching this search names it plainly and answers it in the first screen."],
      potentialClicks28: Math.round(g.clicks * g.success),
      targetQueries: [q.key],
      horizon: "quick win", confidence: "low", scope: "page",
      why: "Demand that is new or rising is cheapest to win before competitors notice it; the site is already being shown for it.",
      uncertainty: "A rise can be a short-lived spike.",
      measure: `Impressions and clicks for "${q.key}" over the next 28 days.`,
      traffic: g.clicks, value: valueOf(page ? [page] : [], [q.key]), evidenceQ: 0.7, success: Math.max(0.4, g.success * 0.8), systemic: false, effort: 1, risk: 1,
    });
    if (page) used.add(page);
  }

  // 7. Seasonal demand BEFORE its peak: searches that earned impressions in the coming 8 weeks last year and are not earning them yet.
  const sa = deep.seasonalAhead?.queries ?? [];
  if (sa.length) {
    const byPage = new Map<string, typeof sa>();
    for (const q of sa) (byPage.get(q.page) ?? byPage.set(q.page, []).get(q.page)!).push(q);
    const [page, list] = [...byPage.entries()].sort((a, b) => b[1].reduce((s, x) => s + x.impressionsLastYear, 0) - a[1].reduce((s, x) => s + x.impressionsLastYear, 0))[0]!;
    const ly = list.reduce((s, x) => s + x.impressionsLastYear, 0);
    const lyClicks = list.reduce((s, x) => s + x.clicksLastYear, 0);
    if (ly >= 60 && !used.has(page)) {
      drafts.push({
        kind: "seasonal", category: "new search demand", issue: `seasonal:${tokensOf(list[0]!.query).slice(0, 3).sort().join(" ")}`, identityUrls: [page],
        title: `Prepare ${pathOf(page)} for "${list[0]!.query}" before its seasonal peak`,
        urls: [page],
        evidence: [
          `${deep.seasonalAhead!.note} ${list.slice(0, 5).map((x) => `"${x.query}" ${x.impressionsLastYear} impressions last year, ${x.impressionsNow} in the latest 28 days`).join("; ")}. Together ${ly} impressions and ${lyClicks} clicks last year, mostly on ${pathOf(page)}.`,
        ],
        competitorUrls: [],
        actions: [
          `Update ${pathOf(page)} for this season now (current year, current dates, prices or availability, what is new), so Google has re-crawled it before searches peak.`,
          "Link to it from the home page or the most visited related pages during the season.",
        ],
        acceptance: ["The page shows current-season information and is linked from at least two indexed pages before the peak."],
        potentialClicks28: Math.max(lyClicks, Math.round(ly * 0.02)),
        targetQueries: list.slice(0, 5).map((x) => x.query),
        horizon: "quick win", confidence: ly >= 300 ? "medium" : "low", scope: "page",
        why: `These searches brought ${ly} impressions in the same weeks last year. A page refreshed before the peak is ready when the searchers come back.`,
        uncertainty: "Last year's season is a guide, not a guarantee; dates and demand shift.",
        measure: "Impressions and clicks for these searches during this season against the same weeks last year.",
        traffic: Math.max(lyClicks, ly * 0.02), value: valueOf([page], list.map((x) => x.query)), evidenceQ: 0.8, success: 0.55, systemic: false, effort: 1, risk: 1,
      });
      used.add(page);
    }
  }

  // 8. Cannibalization.
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
      targetQueries: [can.query],
      horizon: "medium term", confidence: "low", scope: "page",
      why: "When several pages compete for one search, Google often ranks none of them well; one clear page usually ranks higher than two split ones.",
      uncertainty: "Google sometimes shows two pages on purpose; the split alone does not prove harm.",
      measure: `Position and clicks for "${can.query}" and which page Google shows, over the next 28 days.`,
      traffic: can.impressions * 0.02, value: valueOf(can.pages.map((p) => p.page), [can.query]), evidenceQ: sampleQ, success: can.pages[0]!.position > 40 ? 0.25 : 0.5, systemic: false, effort: 1.5, risk: 1.3,
    });
  }

  // 9. Searches the site is not found for (public autocomplete; no volumes exist, so no click estimate is made). Existing pages are expanded before anything new.
  const month = new Date(intel.generatedAt).getUTCMonth() + 1;
  const seasonNow = profile?.seasonal?.find((s) => s.months.some((m) => m === month || m === (month % 12) + 1 || m === ((month + 1) % 12) + 1));
  for (const g of deep.demand.uncaptured.filter((x) => (x.strength?.score ?? 2) >= 1.5).slice(0, 3)) {
    const toks = tokensOf(g.label);
    const seasonal = Boolean(seasonNow && toks.some((t) => seasonNow.topic.toLowerCase().includes(t)));
    const section = profile?.valuableSections.find((s) => s !== "/" && toks.some((t) => s.includes(t))) ?? null;
    const ex = g.existingPage ?? null;
    const research = intentFor(deep, g.label, g.queries);
    const toolish = /\b(calculator|map|checker|finder|tracker|conditions|list|near me|tonight|today|open now|schedule|planner|estimate)\b/.test(g.queries.join(" "));
    const mode = ex?.covers ? "existing_covers" : ex ? "expand" : "new";
    const title =
      mode === "existing_covers" ? `Get ${pathOf(ex!.url)} found for "${g.label}": the page already answers it, but Google shows the site for none of these searches`
      : mode === "expand" ? `Expand ${pathOf(ex!.url)} to capture "${g.label}" searches the site is not found for yet`
      : toolish ? `Capture "${g.label}" searches with one original, useful resource built from the site's own data`
      : `Capture "${g.label}" searches the site is not found for yet`;
    const strength = g.strength;
    drafts.push({
      kind: "new_demand", category: "new search demand", issue: `new_demand:${toks.slice(0, 2).sort().join(" ")}`, identityUrls: [],
      title,
      urls: ex ? [ex.url] : section && intel.site.website ? [`${intel.site.website.replace(/\/$/, "")}${section}`] : [],
      evidence: [
        `People type these into search (${g.sources?.length ? g.sources.join(" and ") : deep.demand.source}, checked ${deep.demand.checkedAt.slice(0, 10)}; this shows the searches exist, not how many): ${g.queries.map((q) => `"${q}"`).join(", ")}.`,
        ...(strength ? [`Demand evidence ${strength.score} of 5 (${strength.level}): ${strength.signals.join("; ")}.`] : []),
        "The site had no Search Console impressions for these words in the latest 28 days or the 28 before.",
        ...(ex ? [ex.covers ? `${ex.url} ("${ex.title.slice(0, 80)}") already covers this intent${ex.indexable ? "" : " but is NOT indexable"}, so the gap is visibility, not content.` : `${ex.url} ("${ex.title.slice(0, 80)}") is the closest existing page; it does not yet answer these searches plainly.`] : []),
        ...(seasonal && seasonNow ? [`Seasonal: ${seasonNow.topic} peaks soon, so this is time-sensitive.`] : []),
        ...competitorLines(research),
      ],
      competitorUrls: (research?.competitorPages.length ? research.competitorPages.map((p) => `${p.url} ("${p.title.slice(0, 70)}", observed ${p.observedAt.slice(0, 10)})`) : g.competitorPages.map((p) => `${p.url} ("${p.title}", observed ${p.observedAt.slice(0, 10)})`)).slice(0, 3),
      actions: [
        mode === "existing_covers" ? `${ex!.indexable ? "" : `Make ${pathOf(ex!.url)} indexable if it is meant to be public. `}Name these searches plainly in its title, first heading and opening, link to it from related indexed pages with descriptive anchor text, and keep it in the sitemap.`
        : mode === "expand" ? `Extend ${pathOf(ex!.url)} with a clearly headed section that answers these searches before creating anything new.`
        : section ? `Extend the existing ${section} pages to serve this intent before creating anything new.` : "Find the existing page closest to this intent and extend it before creating anything new.",
        ...(mode === "new" && profile?.demandHint ? [profile.demandHint] : []),
        ...(mode === "new" ? ["If a new page or tool is justified, build ONE substantive, original page that genuinely serves the searcher (no thin or templated near-duplicates), and link it from relevant indexed pages."] : []),
        profile ? `Tie it to the site's conversion: ${conv}.` : "Give the visitor an obvious next step.",
      ],
      acceptance: ["The intent is served by one clearly focused page with original content; no batch of thin pages was created."],
      potentialClicks28: 0,
      targetQueries: g.queries.slice(0, 6),
      horizon: mode === "new" ? (seasonal ? "medium term" : "long term") : "medium term",
      confidence: strength?.level === "strong" ? "medium" : "low",
      scope: "page",
      why: `These are searches the site's audience makes that it currently gets no visitors from${priorityFor(profile, g.queries) ? `; they match the site's priority: ${priorityFor(profile, g.queries)}` : ""}. ${g.intent === "transactional" || g.intent === "local" ? "The intent is close to a visit or sign-up." : "They bring new readers who can become users."}`,
      uncertainty: "No search volume is available for free, so the size of this demand is unknown; new pages usually take 2 to 4 months to rank.",
      measure: "Impressions for these searches in Search Console (zero today), then clicks and sign-ups from the page.",
      traffic: (strength?.score ?? 2) * 6 + (seasonal ? 6 : 0), value: valueOf(ex ? [ex.url] : section ? [section] : [], g.queries, g.intent), evidenceQ: strength ? Math.min(1, 0.35 + strength.score * 0.12) : 0.5,
      success: mode === "existing_covers" ? 0.45 : mode === "expand" ? 0.4 : 0.3, systemic: false, effort: mode === "new" ? 2.5 : 1.5, risk: 1,
    });
  }

  // 10. Conversion: only where real search visitors land on pages without the site's own next step (never a generic warning).
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
      horizon: "quick win", confidence: "medium", scope: landing.length >= 2 ? "template" : "page",
      why: `These pages already receive search visitors; without a next step they leave without ${profile.conversions[0]}.`,
      uncertainty: "Conversion depends on the offer as much as the button; GravyBlock cannot see on-site analytics.",
      measure: `${profile.conversions[0]} from these pages over the next 28 days (from the site's own analytics).`,
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

