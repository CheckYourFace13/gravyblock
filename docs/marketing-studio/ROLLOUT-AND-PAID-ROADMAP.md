# Rollout order, social identity and paid acquisition roadmap

Owner directive 2026-11-04. Saved in code (`src/lib/marketing-studio/rollout.ts`) and in `ms_settings` (`rollout_plan`, `paid_acquisition`) by `scripts/ops/marketing-rollout-save.ts`.

## Rollout order

Games first: 1 ScribbleZap, 2 Mibble Meadow. Then websites and apps: SendFable, TheDrinkPlace, RentalNoodle, DrinkKnird, MicStage, LeaguePour, OutbreakThreat, GravyBlock, BoatingChicago, VenueSprocket, SeeStew, iScream Studio.

RentalNoodle remains the owner-approved **video quality reference** but is no longer the first brand launched socially. Its Facebook Page and connection are postponed. The DrinkKnird demo stays `READY_FOR_OWNER_REVIEW`, unpublished, below the two games, SendFable and TheDrinkPlace in priority.

## Social identity strategy

- **Games:** one shared **iScream Studio** identity (Facebook Page, Instagram, TikTok, YouTube) for ScribbleZap, Mibble Meadow and future iScream games. No per-game accounts yet. Game campaigns and content are still tracked separately inside Marketing Studio.
- **Websites and apps:** no automatic accounts. A dedicated brand account only if organic social makes strategic sense, the platform requires a branded Page or account for paid ads, or measured results justify it.
- **LinkedIn is out of scope.**

## Game videos (real gameplay is the primary visual)

| Game | Capture source | Feasible read-only | Notes |
| --- | --- | --- | --- |
| ScribbleZap | Private web tester, `/test/scribblezap/play/` | Yes (loads and renders in a real browser; start screen, daily challenge, endless run, level select) | Headless browser, GET only, scripted taps and drags, nothing saved, no code or progression changes, nothing deployed. Real-time capture must be validated for smoothness on the VPS (an earlier screencast approach ran at only about 8 fps); if the VPS cannot capture at 30 fps, a phone recording is the fallback. |
| Mibble Meadow | Android APK only (private phone test 0.1.23) | No | There is no browser build. Needs a real screen recording from a phone or an Android emulator, neither available to the VPS. Still screenshots exist but stills alone are not gameplay. |

Both videos must meet the RentalNoodle bar (hook, real gameplay, motion, voiceover where appropriate, music, synchronized captions, CTA, Product Truth grounding). One video per game, owner review required, no mass generation.

## One-time accounts to create first (all under the iScream Studio identity)

1. **Facebook Page "iScream Studio"** (needed first; the Studio posts to it by official OAuth).
2. **Meta Business portfolio** that owns the Page (and later the single ad account).
3. **Instagram professional account** `iscreamstudio`, linked to that Page.
4. **YouTube channel "iScream Studio"** (a brand channel).
5. **TikTok account** `iscreamstudio`.
6. A **Studio-only Meta app** (developer.facebook.com) for the OAuth connection, with redirect URI `https://gravyblock.com/api/admin/marketing-studio/connect/facebook/callback`.

Minimum to post the first game video: items 1, 2 and 6. Instagram, YouTube and TikTok start as manual uploads from the export bundle (their direct publishing needs platform approval or an audit) and become direct later. Not yet needed: a Google Ads account, a Meta ad account, TikTok ads, a live Play Store listing.

## Paid acquisition (roadmap module, NOT enabled, no money spent)

Loop: creative, small paid test, measure qualified users, pause losers, identify winners, create better variants, scale within the owner-approved budget.

- **Accounts:** one Meta Business portfolio and ad account for approved brands and Pages; one Google Ads account with separate campaigns and conversion tracking per product; iScream Studio social identities for games; individual brand Pages only when required or justified.
- **Games:** Meta app install or traffic campaigns, Instagram and Facebook Reels ads, TikTok and Spark-style promotion where supported, Google App Campaigns once Play listings are live, YouTube Shorts and video ads. Optimize toward installs, store visits and retained users where measurable, not views or followers.
- **Websites and SaaS:** Google Search, Google video and Demand-style campaigns where appropriate, Meta traffic and conversion campaigns where a proper brand identity exists, retargeting later only where consent and privacy rules allow. Optimize toward qualified visitors, signups, trials, subscriptions and revenue.
- **Safety:** the owner sets the total approved budget; product-level limits; campaign-level daily caps; no automatic increase beyond approved bounds; automatic pause for clear losers; no runaway spend; attribution marked CONFIRMED, ESTIMATED or UNKNOWN. Studio recommends budget changes but may never exceed approved limits.
- **State:** `paid_acquisition = { status: roadmap_only, spendEnabled: false, totalApprovedBudgetCents: 0 }`. No ad code exists that can spend.
