import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRelevance, suitableContact } from "../engine";

test("support, billing, technical and no-reply inboxes are not places to ask for a link", () => {
  for (const bad of ["support@newsweek.com", "help@x.org", "privacy@x.org", "sales@x.com", "technicaldocuments@mortonsalt.com", "noreply@x.com", "billing@x.com", "customer.service@x.com", "careers@x.com", "webmaster@x.com"]) {
    assert.equal(suitableContact(bad), false, bad);
  }
});

test("editorial, press, general and named inboxes are acceptable", () => {
  for (const ok of ["press@chefsteps.com", "editorial@x.org", "info@ift.org", "hello@nextstrain.org", "contact@x.org", "brynn@hookagency.com", "partnerships@x.com", "w.gilroy@x.org"]) {
    assert.equal(suitableContact(ok), true, ok);
  }
  assert.equal(suitableContact(null), false);
  assert.equal(suitableContact("not-an-email"), false);
});

const brineVocab = ["food", "recip", "cook", "brine", "turkey"];

test("generic topic overlap is not relevance when the site's search topic is missing from the page", () => {
  const generic = "<p>Food and cooking recipes for every kitchen. Cook better, find a recipe, see food ideas.</p>";
  assert.equal(assessRelevance(generic, brineVocab, null, 2, ["brine", "turkey"]).relevant, false);
  assert.equal(assessRelevance(generic, brineVocab, null, 2).relevant, true); // the old rule would have passed it
});

test("a page that covers the search topic passes", () => {
  const page = "<h1>A guide to brining a turkey</h1><p>Brine, cook and carve: recipes for food lovers.</p>";
  const r = assessRelevance(page, brineVocab, null, 2, ["brine", "turkey"]);
  assert.equal(r.relevant, true);
});
