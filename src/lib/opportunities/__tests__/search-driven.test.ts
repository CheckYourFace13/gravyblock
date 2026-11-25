import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregatePages, bandOf, detectDroppedPages, toCandidate, type PageRow } from "../search-driven";

const row = (pageUrl: string, query: string, clicks: number, impressions: number, position: number): PageRow => ({ pageUrl, query, clicks, impressions, position });

test("ranking bands separate 4-10, 11-20 and 21-40", () => {
  assert.equal(bandOf(2.9), "top3");
  assert.equal(bandOf(4), "near_page_one");
  assert.equal(bandOf(10), "near_page_one");
  assert.equal(bandOf(10.1), "page_two");
  assert.equal(bandOf(20), "page_two");
  assert.equal(bandOf(21), "long_tail");
  assert.equal(bandOf(40), "long_tail");
  assert.equal(bandOf(41), "deep");
});

test("a page near page one becomes an off-site opportunity with capped confidence (a link is not assumed to lift rank)", () => {
  const stats = aggregatePages([row("https://s.com/a", "q", 5, 800, 6.5)], [row("https://s.com/a", "q", 5, 500, 6.5)]);
  const c = toCandidate("b1", stats[0]!, "2026-10-26")!;
  assert.equal(c.opportunityType, "backlink");
  assert.equal(c.subtype, "search_near_page_one");
  assert.ok(c.confidence <= 62);
  assert.equal(c.autoEligible, true);
  assert.match(String((c.evidence as { note: string }).note), /NOT assumed to raise/);
});

test("page two ranks below page one for the same demand, and long tail below that", () => {
  const mk = (pos: number) => toCandidate("b", aggregatePages([row("https://s.com/a", "q", 0, 1000, pos)], [])[0]!, "w")!;
  const [one, two, tail] = [mk(7), mk(15), mk(30)];
  assert.ok(one.expectedImpact * one.confidence > two.expectedImpact * two.confidence);
  assert.ok(two.expectedImpact * two.confidence > tail.expectedImpact * tail.confidence);
});

test("a seasonal spike (one query, page jumped) is flagged and its confidence is held down", () => {
  const stats = aggregatePages([row("https://s.com/turkey", "how to brine a turkey", 11, 2343, 5.5)], [row("https://s.com/turkey", "how to brine a turkey", 1, 300, 5.5)]);
  assert.equal(stats[0]!.seasonal, true);
  const c = toCandidate("b", stats[0]!, "w")!;
  assert.ok(c.confidence <= 30);
  assert.match(c.subtype ?? "", /seasonal/);
});

test("a top-3 page is only an on-site CTR brief, never an off-site opportunity, and only when clicks are far below normal", () => {
  const low = toCandidate("b", aggregatePages([row("https://s.com/a", "q", 11, 2343, 1.05)], [])[0]!, "w")!;
  assert.equal(low.opportunityType, "ctr");
  assert.equal(low.autoEligible, false);
  const fine = toCandidate("b", aggregatePages([row("https://s.com/a", "q", 900, 2000, 1.2)], [])[0]!, "w");
  assert.equal(fine, null);
});

test("thin or deep pages are ignored", () => {
  assert.equal(toCandidate("b", aggregatePages([row("https://s.com/a", "q", 0, 20, 8)], [])[0]!, "w"), null);
  assert.equal(toCandidate("b", aggregatePages([row("https://s.com/a", "q", 0, 900, 70)], [])[0]!, "w"), null);
});

test("most ranking pages vanishing between windows is detected as an indexing problem", () => {
  const prev: PageRow[] = Array.from({ length: 100 }, (_, i) => row(`https://s.com/places/p${i}`, "q", 1, 20, 6));
  const cur: PageRow[] = [row("https://s.com/places/p1", "q", 0, 5, 9)];
  const d = detectDroppedPages(cur, prev)!;
  assert.equal(d.priorPages, 100);
  assert.equal(d.lostPages, 99);
  assert.equal(detectDroppedPages(prev, prev), null);
  assert.equal(detectDroppedPages(cur, prev.slice(0, 10)), null);
});

test("topic phrases come from non-brand searches in the searcher's words", async () => {
  const { topicPhrases } = await import("../search-driven");
  const rows: PageRow[] = [
    row("https://o.com/a", "outbreak threat map", 3, 900, 5),
    row("https://o.com/a", "current stomach virus outbreak map 2026", 69, 5924, 6.3),
    row("https://o.com/a", "norovirus outbreak map 2026", 42, 1574, 5.6),
    row("https://o.com/a", "current norovirus outbreak map", 13, 308, 6.8),
    row("https://o.com/b", "sysco recall 2026", 1, 150, 5.8),
    row("https://o.com/c", "rare thing", 0, 5, 20),
  ];
  // "outbreak threat map" is the brand and is skipped; "outbreak map" queries are the topic even though "outbreak" is part of the brand name
  const p2 = topicPhrases(rows, ["outbreak", "threat"], "outbreakthreat");
  assert.ok(!p2.some((x) => /threat/.test(x)));
  assert.equal(p2[0], "stomach virus outbreak map");
  assert.ok(p2.includes("norovirus outbreak map") || p2.includes("sysco recall"));
  assert.ok(!p2.some((x) => /\b2026\b/.test(x)));
  const turkey = topicPhrases([row("https://d.com/a", "how to brine a turkey", 11, 2343, 1.1)], ["drink", "knird"], "drinkknird");
  assert.deepEqual(turkey, ["brine turkey"]);
});
