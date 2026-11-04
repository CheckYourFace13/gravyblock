/**
 * Marketing Studio rollout order, social identity strategy and the (future, disabled) paid acquisition module. Owner directive 2026-11-04.
 * Persisted in ms_settings (`rollout_plan`) by scripts/ops/marketing-rollout-save.ts so the Studio and its docs agree; nothing here spends money,
 * creates an account or publishes anything.
 */

export const ROLLOUT_GAMES = ["ScribbleZap", "Mibble Meadow"] as const;
export const ROLLOUT_SITES_APPS = ["SendFable", "TheDrinkPlace", "RentalNoodle", "DrinkKnird", "MicStage", "LeaguePour", "OutbreakThreat", "GravyBlock", "BoatingChicago", "VenueSprocket", "SeeStew", "iScream Studio"] as const;
/** Games go first, then websites and apps, in this order. RentalNoodle stays the owner-approved video quality reference but is no longer first. */
export const ROLLOUT_ORDER: readonly string[] = [...ROLLOUT_GAMES, ...ROLLOUT_SITES_APPS];

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

export const GAME_CAPTURE = {
  ScribbleZap: { feasible: true, source: "private web tester (https://iscreamstudio.com/test/scribblezap/play/)", method: "headless browser with a disposable profile, GET only, scripted touch input, CDP screencast; no code, save or progression changes, nothing deployed", measured: "2026-11-04 test: game ran at 60 fps, screencast delivered about 50 fps, two scripted cuts cleared level 1 (67% of a 60% target)" },
  "Mibble Meadow": { feasible: false, source: "Android APK only (private phone test 0.1.23): a Godot 4.7.2 game with arm64-v8a and armeabi-v7a native libraries only", method: "emulator blocked: the VPS has no hardware virtualization (no /dev/kvm, no vmx or svm), 2 vCPUs, about 3 GB of free memory shared with production, and the APK has no x86 libraries, so only a full ARM system emulation would run it, which is unusably slow and unsafe on the production host" },
} as const;

export const ROLLOUT_PLAN = { version: 2, firstSocialSetup: FIRST_SOCIAL_SETUP, deferredAccounts: DEFERRED_ACCOUNTS, ownerIdentity: OWNER_IDENTITY, decidedAt: "2026-11-04", order: ROLLOUT_ORDER, social: SOCIAL_STRATEGY, paid: PAID_ACQUISITION, gameCapture: GAME_CAPTURE, videoQualityReference: "RentalNoodle" } as const;
