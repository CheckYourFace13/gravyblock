# First social post: iScream Studio (prep only)

Nothing is published by anything in this document. Meta setup is the owner's step.

## Test workflow
`npm run test:studio` runs the whole Studio suite on a disposable in-memory database named `gravyblock_studio_test` on a free localhost port, with the current schema pushed in and the database gone afterwards. It overwrites `DATABASE_URL` and `MARKETING_DATABASE_URL` for the test processes and refuses any non-local host or a name without "test". The suites' own guard (they delete every `ms_` row, so they refuse a database whose name lacks "test") is unchanged.

## Minimum Meta structure
iScream Studio Facebook Page, Meta Business portfolio that owns it, a Studio-only Meta app, then Connect with Facebook in GravyBlock (handle `iscreamstudio`). Not needed yet: Instagram, TikTok, YouTube, Meta Ads, Google Ads. Use a private iScream Studio business email wherever Meta permits. Chris's personal profile may only be the hidden Meta administrator if Meta requires it: Studio posts with the Page token only, and never names or contacts the personal profile.

## Flow once the Page is connected (`scripts/ops/marketing-first-social.ts`)
1. status (default, read-only): verifies ownership and permissions straight from Meta (right Page, all four scopes, a Page and not a profile).
2. `--prepare`: ScribbleZap is the first candidate. Prepares ONE post as "approval required" and runs the pre-publish checklist (owner-approved current video, QA, Product Truth, launch-state CTA, link host, no email or phone, no personal name, no duplicate). Sends nothing.
3. `--publish --confirm-first-post scribblezap`: the only action that sends. Approves, schedules and sends once with live publishing on only for the run, then confirms the post is live on Meta and starts measurement.
4. The loop is recorded as proven only after the post is live on Meta and the first measurement is stored.
5. Mibble Meadow direct posts are refused by `createPublication` until that proof exists.
