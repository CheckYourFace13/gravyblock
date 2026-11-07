/**
 * Marketing Studio rollout order, social identity strategy and the (future, disabled) paid acquisition module. Owner directive 2026-11-04.
 * Persisted in ms_settings (`rollout_plan`) by scripts/ops/marketing-rollout-save.ts so the Studio and its docs agree; nothing here spends money,
 * creates an account or publishes anything.
 */

export const ROLLOUT_GAMES = ["ScribbleZap", "Mibble Meadow"] as const;
export const ROLLOUT_SITES_APPS = ["SendFable", "TheDrinkPlace", "RentalNoodle", "DrinkKnird", "MicStage", "LeaguePour", "OutbreakThreat", "GravyBlock", "BoatingChicago", "VenueSprocket", "SeeStew", "iScream Studio"] as const;
/**
 * ACTIVE ACQUISITION QUEUE (owner directive 2026-11-07): websites and apps that can convert traffic today come first, in this exact order. Games wait,
 * because they have no verified live install destination. RentalNoodle stays the owner-approved video quality reference.
 */
export const ACQUISITION_QUEUE: readonly string[] = ROLLOUT_SITES_APPS;
export const ROLLOUT_ORDER: readonly string[] = [...ROLLOUT_SITES_APPS, ...ROLLOUT_GAMES];

/**
 * PERMANENT RULE (owner, 2026-11-07): a game with no verified live install destination is not prioritized for repeated acquisition campaigns over
 * products that can convert traffic today. Existing public posts stay live. It lifts by itself for a game the moment Product Truth holds a verified
 * Google Play or App Store listing (see gameAcquisitionPaused in publishing/pause.ts).
 */
export const GAME_ACQUISITION_PAUSE = {
  setting: "game_acquisition_paused",
  rule: "No new game videos or game publications until a verified live store listing exists for that game. Existing public posts stay live.",
  preserved: ["ScribbleZap YouTube Short ZWK2ZSyjxv0 (public, stays live)"],
  mibbleMeadow: "Not connected or published to YouTube; approved-direction video and capture assets stay ready.",
} as const;

export const SOCIAL_PLATFORMS_IN_SCOPE = ["facebook", "instagram", "tiktok", "youtube"] as const;
/** Explicitly out of scope by owner decision. */
export const SOCIAL_PLATFORMS_OUT_OF_SCOPE = ["linkedin"] as const;

/** The minimum owner setup for the first controlled Facebook publishing loop. Nothing else is required yet. */
export const FIRST_SOCIAL_SETUP = ["iScream Studio Facebook Page", "Meta Business portfolio that owns that Page", "Studio-only Meta app for GravyBlock OAuth"] as const;
/** Come only after the first controlled Facebook publishing loop is proven. */
export const DEFERRED_ACCOUNTS = ["Instagram", "TikTok", "YouTube", "Google Ads", "Meta Ads account"] as const;
export const OWNER_IDENTITY = {
  signupAndRecoveryEmail: "a private iScream Studio business email, never a personal Gmail, never shown publicly",
  personalFacebookProfile: "may be the private Meta administrator only if Meta requires it; must never publish, appear as the brand, be a public contact, or receive product marketing activity",
} as const;

export const SOCIAL_STRATEGY = {
  games: {
    identity: "iScream Studio",
    platforms: SOCIAL_PLATFORMS_IN_SCOPE,
    note: "One shared iScream Studio identity for ScribbleZap, Mibble Meadow and future iScream games. No per-game accounts yet; game campaigns and content are still tracked separately inside Marketing Studio.",
  },
  websitesAndApps: {
    rule: "No automatic accounts per product. A dedicated brand account is created only if organic social makes strategic sense, the platform requires a branded Page or account identity for paid advertising, or measured results justify it.",
  },
  outOfScope: SOCIAL_PLATFORMS_OUT_OF_SCOPE,
  postponed: ["RentalNoodle Facebook Page and connection"],
} as const;

export const PAID_ACQUISITION = {
  status: "roadmap_only" as const,
  spendEnabled: false as const,
  loop: ["creative", "small paid test", "measure qualified users", "pause losers", "identify winners", "create better variants", "scale within owner-approved budget"],
  accounts: {
    meta: "One Meta Business portfolio and ad account managing approved brands and Pages",
    google: "One Google Ads account with separate campaigns and separate conversion tracking per product",
    gameSocial: "iScream Studio social identities for games",
    brandPages: "Individual brand Pages only when required for ads or strategically justified",
  },
  channels: {
    games: ["Meta app install or traffic campaigns", "Instagram and Facebook Reels ads", "TikTok and Spark-style promotion where supported", "Google App Campaigns once Play Store listings are live", "YouTube Shorts and video advertising"],
    websitesSaas: ["Google Search", "Google video and Demand-style campaigns where appropriate", "Meta traffic and conversion campaigns where a proper brand identity exists", "Retargeting later, only where consent and privacy rules permit"],
  },
  optimizeToward: { games: ["installs", "store visits", "retained users where measurable"], websitesSaas: ["qualified visitors", "signups", "trials", "subscriptions", "revenue"], never: ["views alone", "followers alone"] },
  budgetSafety: [
    "Owner sets the total approved budget",
    "Product-level limits",
    "Campaign-level daily caps",
    "No automatic spend increase beyond approved bounds",
    "Automatic pause for clear losers",
    "No runaway spend",
    "Attribution is marked CONFIRMED, ESTIMATED or UNKNOWN",
    "Studio recommends budget changes but may never exceed approved limits",
  ],
} as const;

/**
 * PERMANENT RULE (owner, 2026-11-04): game videos sell FUN first, features second. Before any game video is READY_FOR_OWNER_REVIEW the creative-language
 * QA (video/demo/language-qa.ts) rejects scripts that are corporate, robotic, a feature list, repetitive, over-explained, low-energy, or technically
 * accurate but not enticing. Truthfulness stays mandatory: fun never permits exaggerating or fabricating gameplay, and every spoken line still needs
 * a verified fact and matching real footage.
 */
export const GAME_CREATIVE_RULES = {
  principle: "Game videos sell FUN first, features second.",
  voice: ["fun", "energetic", "playful", "slightly competitive", "satisfying", "surprising", "easy to understand", "fast-moving", "not corporate", "not technical", "not like documentation"],
  hook: "The first one or two seconds show something satisfying, surprising or challenging. Start inside the fun; never open with an introduction.",
  cta: "Until a verified store listing is live, an invitation CTA (How far can you get? Think you can beat it? Follow iScream Studio for the launch). Never 'coming soon', never anything that implies a download. Once a verified store link exists in Product Truth, the run refuses the pre-launch spec so the creative is moved to an install or play CTA.",
  qa: "language-qa.ts runs as part of the video QA for every game and blocks READY_FOR_OWNER_REVIEW on failure.",
  truth: "Every spoken claim has a verified fact and matching real footage. Style examples are only used when they accurately describe real gameplay.",
} as const;

export const GAME_CAPTURE = {
  ScribbleZap: { feasible: true, source: "private web tester (https://iscreamstudio.com/test/scribblezap/play/)", method: "headless browser with a disposable profile, GET only, scripted touch input, CDP screencast; no code, save or progression changes, nothing deployed", measured: "2026-11-04 test: game ran at 60 fps, screencast delivered about 50 fps, two scripted cuts cleared level 1 (67% of a 60% target)" },
  "Mibble Meadow": { feasible: true, source: "the real 0.1.23 APK's own project files (a Godot 4.7.2 game, Android only)", method: "an Android emulator is blocked on the VPS (no hardware virtualization, ARM-only libraries), so the project files extracted from the APK run read-only in the matching official Godot 4.7.2 desktop engine inside a disposable no-network container, Movie Maker mode at 30 fps, real mouse input tied to rendered frames", measured: "2026-11-04: level 1 solved with real taps, ending on the game's own completion card; UI, layout, art, text and rules match the Android build's screenshots; known non-material differences: haptics, audio and the Android safe-area and GPU path were not exercised" },
} as const;

export const ROLLOUT_PLAN = { version: 4, acquisitionQueue: ACQUISITION_QUEUE, gamePause: GAME_ACQUISITION_PAUSE, gameCreative: GAME_CREATIVE_RULES, firstSocialSetup: FIRST_SOCIAL_SETUP, deferredAccounts: DEFERRED_ACCOUNTS, ownerIdentity: OWNER_IDENTITY, decidedAt: "2026-11-07", order: ROLLOUT_ORDER, social: SOCIAL_STRATEGY, paid: PAID_ACQUISITION, gameCapture: GAME_CAPTURE, videoQualityReference: "RentalNoodle" } as const;
