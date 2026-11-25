/**
 * Turns one site's weekly intelligence into (a) the three to five highest-impact evidence-backed improvements and (b) ONE complete, copyable development
 * instruction for that site's own developer (Claude or Cursor). GravyBlock never edits a house site: this text is handed to the site's own agent.
 * Fixed templates, no AI calls, no cost. Where evidence is thin the output recommends validation, not an invented fix.
 */
import { expectedCtr, type BandRow } from "./analysis";
import type { Improvement, SiteIntel } from "./types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pathOf = (u: string) => {
  try {
    const p = new URL(u);
    return p.pathname + (p.search ? p.search : "");
  } catch {
    return u;
  }
};

function competitorRefs(intel: SiteIntel, query: string): string[] {
  const q = intel.competitors.queries.find((c) => c.query === query);
  return (q?.competitorPages ?? []).map((p) => `${p.url} (title: "${p.title}", observed ${p.observedAt.slice(0, 10)})`);
}

export function deriveImprovements(intel: SiteIntel): Improvement[] {
  const out: Improvement[] = [];
  const window = intel.w28 ? `${intel.w28.cur.start} to ${intel.w28.cur.end}` : "the latest 28 days";

  // 1. Indexing: pages that used to earn impressions and no longer do.
  const d = intel.indexing.dropped;
  if (d && d.lost >= 10) {
    const recheck = intel.indexing.rechecks[0];
    const v = recheck?.verdicts ?? {};
    out.push({
      kind: "indexing",
      title: "Find out why previously ranking pages no longer appear in Google, and fix the cause",
      urls: d.sample.slice(0, 6),
      evidence: [
        `${d.lost} of ${d.before} pages that earned Google impressions in an earlier 28-day window earn none now (impressions ${d.impressionsBefore} to ${d.impressionsNow}).`,
        recheck ? `Google URL Inspection on ${recheck.at.slice(0, 10)} for a sample of those pages: noindex tag ${v.noindex_tag ?? 0}, crawled but not indexed ${v.crawled_not_indexed ?? 0}, other block ${v.blocked_other ?? 0}, indexed ${v.indexed ?? 0}.` : "No URL Inspection recheck has been stored yet.",
        d.reading ?? "",
      ].filter(Boolean),
      competitorUrls: [],
      actions: [
        "Request each sampled URL's live HTML and read the robots meta tag, X-Robots-Tag header, canonical tag and robots.txt rules. Report exactly what each says.",
        "If a noindex tag is present on pages that earned traffic, find where the template, plugin or environment setting adds it. Remove it only where the page is meant to be searchable (listing, place, guide pages); keep it on genuinely private or duplicate pages.",
        "If pages are 'crawled, currently not indexed', check for thin or near-duplicate templates, missing unique content, weak internal links from indexed pages, and canonical tags pointing elsewhere. Improve the pages that deserve to rank; do not mass-generate new pages.",
        "Confirm every important URL appears in the XML sitemap with a 200 status and a self-referencing canonical.",
      ],
      acceptance: [
        "A table of the sampled URLs with: HTTP status, robots meta, X-Robots-Tag, canonical, in sitemap (yes/no), before and after the fix.",
        "No page that should be indexed carries noindex after deploy; pages meant to stay private still do.",
        "Search Console URL Inspection (live test) on at least 5 fixed URLs reports 'URL is available to Google'.",
      ],
      potentialClicks28: Math.max(5, Math.round((d.impressionsBefore - d.impressionsNow) * 0.02)),
      priority: 1000 + (d.impressionsBefore - d.impressionsNow),
    });
  }

  // 2. Low CTR where the ranking is already good.
  const byPage = new Map<string, { clicksMissing: number; rows: typeof intel.lowCtr }>();
  for (const r of intel.lowCtr) {
    const e = byPage.get(r.page) ?? { clicksMissing: 0, rows: [] };
    e.clicksMissing += r.clicksMissing;
    e.rows.push(r);
    byPage.set(r.page, e);
  }
  for (const [page, e] of [...byPage.entries()].sort((a, b) => b[1].clicksMissing - a[1].clicksMissing).slice(0, 2)) {
    if (e.clicksMissing < 3) continue;
    const top = e.rows[0]!;
    out.push({
      kind: "low_ctr",
      title: `Rewrite the title and meta description of ${pathOf(page)} so more searchers click`,
      urls: [page],
      evidence: e.rows.slice(0, 3).map((r) => `"${r.query}": position ${r.position}, ${r.impressions} impressions, CTR ${pct(r.ctr)} where about ${pct(r.expected)} is normal at that position (${window}, Google Search Console).`),
      competitorUrls: competitorRefs(intel, top.query),
      actions: [
        "Read the page's current title and meta description and note what the page genuinely offers.",
        `Write a title (about 50 to 60 characters) and description (about 140 to 155) that lead with the searcher's words from the queries above, state the specific benefit or content (for example what is on the page, how current it is), and are accurate to the page. Do not copy competitor wording.`,
        "Keep the page's content, URL and canonical unchanged.",
      ],
      acceptance: ["The new title and description are live in the rendered HTML (view-source), unique on the site, within length limits, and truthful.", "No other page's metadata changed."],
      potentialClicks28: e.clicksMissing,
      priority: e.clicksMissing * 10,
    });
  }

  // 3. Positions 4 to 10: one targeted improvement per page, not a rewrite.
  const near = new Map<string, BandRow[]>();
  for (const b of intel.bands?.b4_10 ?? []) {
    if (b.impressions < 30) continue;
    const arr = near.get(b.page) ?? [];
    arr.push(b);
    near.set(b.page, arr);
  }
  for (const [page, rows] of [...near.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.impressions, 0) - a[1].reduce((s, r) => s + r.impressions, 0)).slice(0, 2)) {
    const gain = rows.reduce((s, r) => s + Math.max(0, r.impressions * (expectedCtr(Math.max(1, r.position - 3)) - r.clicks / r.impressions)), 0);
    const top = rows[0]!;
    const gaps = intel.competitors.queries.filter((c) => rows.some((r) => r.query === c.query)).flatMap((c) => c.gaps).slice(0, 3);
    out.push({
      kind: "near_page_one",
      title: `Strengthen ${pathOf(page)} for the queries where it already ranks 4 to 10`,
      urls: [page],
      evidence: rows.slice(0, 4).map((r) => `"${r.query}": position ${r.position}, ${r.impressions} impressions, ${r.clicks} clicks (${window}).`),
      competitorUrls: competitorRefs(intel, top.query),
      actions: [
        "Compare the page with what searchers for these queries need: is the answer near the top, complete, current and easy to act on?",
        ...(gaps.length ? gaps.map((g) => `Evaluate (do not copy): ${g.evidence}`) : ["No verified competitor feature gap was observed this week, so first validate by reading the top results manually for these queries and writing down what they answer that this page does not."]),
        "Add original, genuinely useful content or functionality where the page is missing something searchers want. Add internal links to this page from relevant, already-indexed pages with descriptive anchor text.",
      ],
      acceptance: ["The page answers each listed query in its first screen or an obvious section, with original wording.", "Existing content, URL, canonical and structured data are preserved or improved; nothing is removed that earns clicks."],
      potentialClicks28: Math.round(gain),
      priority: gain * 6,
    });
  }

  // 4. Page two with a real audience.
  for (const b of (intel.bands?.b11_20 ?? []).filter((x) => x.impressions >= 50).slice(0, 1)) {
    out.push({
      kind: "page_two",
      title: `Validate whether ${pathOf(b.page)} is the right page for "${b.query}"`,
      urls: [b.page],
      evidence: [`"${b.query}": position ${b.position}, ${b.impressions} impressions, ${b.clicks} clicks (${window}).`],
      competitorUrls: competitorRefs(intel, b.query),
      actions: [
        "Search the query manually and note which page types rank (guides, listings, tools). Decide whether this page matches that intent.",
        "If it matches, improve it as above; if it does not, propose (do not auto-create) one better-matched page, with a short outline, and wait for approval. Do not create several near-duplicate pages.",
      ],
      acceptance: ["A short written finding (intent match yes/no, with the three ranking page URLs observed) before any new page is built."],
      potentialClicks28: Math.round(b.impressions * 0.018),
      priority: b.impressions * 1.5,
    });
  }

  // 5. Declining pages with enough volume to mean something.
  for (const m of (intel.pages28?.declining ?? []).filter((x) => x.clicksPrev - x.clicksCur >= 3 || x.imprPrev - x.imprCur >= 150).slice(0, 2)) {
    out.push({
      kind: "declining",
      title: `Investigate the drop on ${pathOf(m.key)}`,
      urls: [m.key],
      evidence: [`Clicks ${m.clicksPrev} to ${m.clicksCur} and impressions ${m.imprPrev} to ${m.imprCur} comparing the latest 28 days with the 28 before (Google Search Console).`],
      competitorUrls: [],
      actions: [
        "Check the page still returns 200, is indexable (no noindex, correct canonical) and is in the sitemap; check for recent template, title or content changes in git history.",
        "Check whether a seasonal pattern explains it (see the seasonal note in the report) before changing anything.",
        "Only if the cause is a defect on our side, fix it; otherwise record the finding and leave the page unchanged.",
      ],
      acceptance: ["A written cause (defect, seasonal, algorithmic/unknown) with evidence, and a fix only where a defect was found."],
      potentialClicks28: Math.max(0, m.clicksPrev - m.clicksCur),
      priority: (m.clicksPrev - m.clicksCur) * 8 + (m.imprPrev - m.imprCur) / 20,
    });
  }

  // 6. Competitor gaps that are directly visible.
  const gapRows = intel.competitors.queries.flatMap((q) => q.gaps.map((g) => ({ q, g }))).slice(0, 6);
  if (gapRows.length) {
    const first = gapRows[0]!;
    out.push({
      kind: "competitor_gap",
      title: `Consider an original improvement to ${pathOf(first.g.ourUrl ?? intel.site.website ?? "")} based on what competing pages offer`,
      urls: [...new Set(gapRows.map((x) => x.g.ourUrl).filter((u): u is string => !!u))].slice(0, 3),
      evidence: gapRows.map((x) => `For "${x.q.query}": ${x.g.evidence} Observed ${x.g.observedAt.slice(0, 10)}.`),
      competitorUrls: [...new Set(gapRows.map((x) => x.g.competitorUrl))],
      actions: [
        "Treat each competitor page as research only. Decide what would genuinely help a searcher more, and build your own original version (your own wording, data, images and design).",
        "Prefer one strong improvement to an existing page over new pages. Skip any item that does not fit the product.",
      ],
      acceptance: ["Each shipped addition is original, works on mobile, and is listed with the URL it lives on."],
      potentialClicks28: 0,
      priority: 20 + gapRows.length * 4,
    });
  }

  // 7. Problems GravyBlock's own checks already confirmed (on-site briefs).
  if (intel.openBriefs.length) {
    out.push({
      kind: "confirmed_problem",
      title: "Fix problems GravyBlock's own checks confirmed on the live site",
      urls: [],
      evidence: intel.openBriefs.slice(0, 6).map((b) => `${b.type}${b.subtype ? ` / ${b.subtype}` : ""}: ${b.text}`),
      competitorUrls: [],
      actions: ["Work through the listed findings from highest impact down. Verify each in the live HTML first; skip any that is already fixed.", "Make the smallest change that resolves each finding."],
      acceptance: ["Each fixed finding is re-checked in the live HTML and listed with its URL.", "No unrelated change."],
      potentialClicks28: 0,
      priority: 15 + Math.min(30, intel.openBriefs.length * 2),
    });
  }

  // Highest priority first, at most five, at most two of any one kind so a single theme cannot fill the list.
  const picked: Improvement[] = [];
  const perKind = new Map<string, number>();
  for (const i of out.sort((a, b) => b.priority - a.priority)) {
    if ((perKind.get(i.kind) ?? 0) >= 2) continue;
    perKind.set(i.kind, (perKind.get(i.kind) ?? 0) + 1);
    picked.push(i);
    if (picked.length === 5) break;
  }
  return picked;
}

const list = (items: string[], indent = "   ") => items.map((i) => `${indent}- ${i}`).join("\n");

export function buildPrompt(intel: SiteIntel, improvements: Improvement[]): string {
  const site = intel.site.website ?? intel.site.name;
  const w28 = intel.w28;
  const preserve = intel.topPages.slice(0, 8).map((p) => `${p.page} (${p.clicks} clicks, ${p.impressions} impressions in the latest 28 days)`);
  const lines: string[] = [];
  lines.push(`You are the senior engineer responsible for ${intel.site.name} (${site}). Implement the evidence-backed search and conversion improvements below. This instruction was generated by GravyBlock on ${intel.generatedAt.slice(0, 10)} from Google Search Console data (${w28 ? `${w28.cur.start} to ${w28.cur.end}` : "no complete window yet"}) and from public competitor pages GravyBlock read on ${intel.competitors.observedAt.slice(0, 10)}.`);
  lines.push("");
  lines.push("DATA QUALITY (read first)");
  const dq = [...intel.dataQualityNotes];
  if (intel.status.status !== "ok") dq.unshift(...intel.status.notes);
  lines.push(dq.length ? list(dq, "") : "- Search Console data is complete for the windows used.");
  lines.push("- Figures are Google search clicks and impressions only. They are not total website visitors.");
  lines.push("- Competitor findings describe pages competitors publish. They do not show a competitor's traffic, rankings or backlinks, which GravyBlock cannot see.");
  lines.push("");
  lines.push("RULES");
  lines.push(list(["Do not mass-generate pages and do not rewrite working pages for the sake of it. Make the smallest change that fixes each item.", "Never copy competitor text, images or design. Competitor URLs are research only.", "Preserve everything in the PRESERVE list. If a change could affect those pages, stop and say so.", "No hidden links, no keyword stuffing, no doorway pages, no new third-party scripts or paid services without approval.", "If an item's evidence does not hold up when you check the live site, report that instead of changing anything."], ""));
  lines.push("");
  lines.push("PRESERVE (these earn Google clicks today; do not remove, rename, redirect or noindex them, and keep their URLs, canonicals, structured data, and conversion paths intact)");
  lines.push(preserve.length ? list(preserve, "") : "- No page has measurable Google clicks yet. Preserve all existing routes, canonical tags, structured data, analytics tags and any signup, booking or checkout flow.");
  lines.push("");
  if (!improvements.length) {
    lines.push("IMPROVEMENTS");
    lines.push("GravyBlock does not have enough evidence this week to recommend a specific change for this site, so it will not invent one. Do this validation instead, and report what you find:");
    lines.push(list(["Confirm the site's XML sitemap lists every important URL, each returning 200 with a self-referencing canonical and no noindex.", "In Search Console, confirm the property matches the live domain (https vs http, www vs non-www) and that no manual action or security issue is reported.", "Read the top three pages' titles and descriptions and confirm each is unique, accurate and written for a searcher.", "List the three queries you would most want this site to rank for and check manually who ranks today (page URLs and what they offer). Send that list back so it can be tracked."], ""));
  } else {
    lines.push(`IMPROVEMENTS (${improvements.length}, highest impact first)`);
    improvements.forEach((imp, n) => {
      lines.push("");
      lines.push(`${n + 1}. ${imp.title}`);
      if (imp.urls.length) lines.push(`   Affected URLs:\n${list(imp.urls, "     ")}`);
      lines.push(`   Evidence:\n${list(imp.evidence, "     ")}`);
      if (imp.potentialClicks28 > 0) lines.push(`   Upper-bound opportunity: roughly ${imp.potentialClicks28} more Google clicks per 28 days if fully fixed (an estimate from impressions and typical click rates, not a forecast).`);
      if (imp.competitorUrls.length) lines.push(`   Competitor reference URLs (research only):\n${list(imp.competitorUrls, "     ")}`);
      lines.push(`   Do:\n${list(imp.actions, "     ")}`);
      lines.push(`   Acceptance:\n${list(imp.acceptance, "     ")}`);
    });
  }
  lines.push("");
  lines.push("ACCEPTANCE TESTS (all changes)");
  lines.push(list(["Every changed URL returns 200, is indexable, has a self-referencing canonical, and is in the XML sitemap.", "Titles are unique and under about 60 characters; descriptions unique and under about 160.", "Structured data on changed pages validates in Google's Rich Results Test with no new errors.", "Mobile Lighthouse performance and accessibility scores on changed pages are no worse than before.", "All existing signup, booking, search and checkout paths work end to end after the change."], ""));
  lines.push("");
  lines.push("PRODUCTION VERIFICATION");
  lines.push(list(["After deploying, fetch each changed URL from production (curl or a browser) and paste the final title, meta description, robots meta, canonical and HTTP status into your report.", "In Search Console, run URL Inspection on each changed URL and request indexing where it is allowed.", "Report the commit SHA and the list of changed URLs. GravyBlock will re-measure those pages after 28 days and judge the change by their own clicks and impressions, not by the deploy."], ""));
  return lines.join("\n");
}
