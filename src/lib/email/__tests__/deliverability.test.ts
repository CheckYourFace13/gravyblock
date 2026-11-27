import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, listUnsubscribeHeaders } from "../optout";

test("one-click unsubscribe headers point at the existing opt-out link", () => {
  const h = listUnsubscribeHeaders("Owner@Example.com");
  assert.match(h["List-Unsubscribe"]!, /^<https:\/\/[^>]+\/api\/unsubscribe\?e=[A-Za-z0-9_-]+>$/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("html is turned into a readable text part with link targets kept", () => {
  const t = htmlToText(`<style>p{}</style><h1>Hi</h1><p>Your score is <b>72</b>.</p><p><a href="https://gravyblock.com/scan">See the report</a></p><ul><li>One</li><li>Two</li></ul><p>A &amp; B&nbsp;C</p>`);
  assert.match(t, /^Hi\nYour score is 72\./);
  assert.match(t, /See the report \(https:\/\/gravyblock\.com\/scan\)/);
  assert.match(t, /- One\n- Two/);
  assert.match(t, /A & B C/);
  assert.doesNotMatch(t, /<|p\{\}/);
});
