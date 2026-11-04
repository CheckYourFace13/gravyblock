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

| Game | Capture source | Result (2026-11-04) |
| --- | --- | --- |
| ScribbleZap | Private web tester, `/test/scribblezap/play/` | **Smooth enough.** Headless Chromium with a disposable profile, GET only, scripted touch input. The game ran at 60 fps and the CDP screencast delivered about 50 fps. Two scripted cuts cleared level 1 (67% filled against a 60% target), showing the real tool-unlock card, fill meter, confetti and level-clear screen. No code, save, progression or deployment was touched. A screenshot loop is only 3.5 fps and is not used. |
| Mibble Meadow | Android APK only (private phone test 0.1.23, Godot 4.7.2) | **Emulator blocked, Godot route works.** No hardware virtualization on the VPS and ARM-only libraries rule out an Android emulator. Approved route: the game's own project files, unzipped from the real APK (SHA-256 verified), run read-only in the matching official Godot 4.7.2 desktop engine (SHA-512 verified) inside a disposable container with no network, in Movie Maker mode (30 fps, 780x1690, every frame rendered on its own clock) with real mouse input tied to rendered frames. Level 1 was solved with real swipe-marks and double-taps and ended on the game's own "Meadow Moment" completion card. **Faithful to the Android build** (layout, art, text, rules and version label match its screenshots); not exercised: haptics, audio, Android safe-area insets and the Android GPU path. Tooling: `scripts/ops/mibble-meadow-capture/`. |

A phone recording is no longer needed for Mibble Meadow. More levels (and the Daily and Endless modes) can be captured the same way when its owner-review video is built; one video per game, owner review required.

Both videos must meet the RentalNoodle bar (hook, real gameplay, motion, voiceover where appropriate, music, synchronized captions, CTA, Product Truth grounding). One video per game, owner review required, no mass generation.

## One-time accounts: MINIMUM first (refined)

Only these three, for the first controlled Facebook publishing loop:

1. **Facebook Page "iScream Studio"**
2. **Meta Business portfolio** that owns that Page
3. **Studio-only Meta app** for GravyBlock OAuth, redirect URI `https://gravyblock.com/api/admin/marketing-studio/connect/facebook/callback`

**Deferred until the first Facebook loop is proven:** Instagram, TikTok, YouTube, Google Ads, Meta Ads account.

**Owner identity:** any signup or recovery email is a private iScream Studio business email, not a personal Gmail, and is never shown publicly. Chris's personal Facebook profile may be the private Meta administrator only if Meta requires it, and must never publish, appear as the brand, be a public contact or receive product marketing activity.

## Game creative standard (permanent): fun first, features second

Every game video (ScribbleZap, Mibble Meadow, future iScream games) must sell the *fun* before any feature: start inside something satisfying, surprising or challenging; short, playful, conversational lines; no introductions, menu names or feature lists; a challenge or invitation for the viewer. The voice is fun, energetic, slightly competitive, satisfying and easy to understand, never corporate, technical or like documentation.

- **CTA:** until a verified store link is live use an invitation ("How far can you get? Follow iScream Studio for the launch."). Never "coming soon" and nothing that implies a download. Once a verified store link exists in Product Truth, the render refuses the pre-launch spec so the creative moves to an install or play CTA.
- **Creative-language QA** (`video/demo/language-qa.ts`) runs on every game video and rejects scripts that are corporate, robotic, a feature list, repetitive, over-explained, low-energy or merely accurate: no download wording, no corporate words, a short hook, short punchy lines, no list-of-features lines, enough energetic play words, a line that challenges the viewer, no repeated phrases, short on-screen headlines, a CTA that invites.
- **Truth is unchanged:** fun never permits exaggeration. Every spoken line still has a verified Product Truth fact (from the public page or the game's own on-screen text) and matching real footage.

## Paid acquisition (roadmap module, NOT enabled, no money spent)

Loop: creative, small paid test, measure qualified users, pause losers, identify winners, create better variants, scale within the owner-approved budget.

- **Accounts:** one Meta Business portfolio and ad account for approved brands and Pages; one Google Ads account with separate campaigns and conversion tracking per product; iScream Studio social identities for games; individual brand Pages only when required or justified.
- **Games:** Meta app install or traffic campaigns, Instagram and Facebook Reels ads, TikTok and Spark-style promotion where supported, Google App Campaigns once Play listings are live, YouTube Shorts and video ads. Optimize toward installs, store visits and retained users where measurable, not views or followers.
- **Websites and SaaS:** Google Search, Google video and Demand-style campaigns where appropriate, Meta traffic and conversion campaigns where a proper brand identity exists, retargeting later only where consent and privacy rules allow. Optimize toward qualified visitors, signups, trials, subscriptions and revenue.
- **Safety:** the owner sets the total approved budget; product-level limits; campaign-level daily caps; no automatic increase beyond approved bounds; automatic pause for clear losers; no runaway spend; attribution marked CONFIRMED, ESTIMATED or UNKNOWN. Studio recommends budget changes but may never exceed approved limits.
- **State:** `paid_acquisition = { status: roadmap_only, spendEnabled: false, totalApprovedBudgetCents: 0 }`. No ad code exists that can spend.
