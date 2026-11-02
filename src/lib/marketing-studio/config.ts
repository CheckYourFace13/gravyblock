/**
 * Marketing Studio configuration. Every numeric limit here is a deliberately conservative PLACEHOLDER for Phase 1, which
 * runs no heavy work. Phase 2 replaces them with values chosen from measured behavior on this VPS (see the Phase 0
 * document). Nothing here is a claim about a safe operating point.
 */
import path from "node:path";

export const STUDIO_ROOT = process.env.MARKETING_STORAGE_ROOT?.trim() || "/var/lib/gravyblock-marketing";

export const STUDIO_DIRS = {
  root: STUDIO_ROOT,
  tmp: path.join(STUDIO_ROOT, "tmp"),
  media: path.join(STUDIO_ROOT, "media"),
  logs: path.join(STUDIO_ROOT, "logs"),
} as const;

/** Presence of this file stops the worker claiming or running anything (emergency global disable, layer 1). */
export const DISABLE_FILE = path.join(STUDIO_ROOT, "DISABLE");

export const LIMITS = {
  /** Hard ceiling for everything Studio stores (tmp + media + logs): a ceiling, not a target. */
  totalDiskCeilingBytes: 8 * 1024 ** 3,
  /** No single product may use more than this share of the ceiling. */
  perProductQuotaBytes: 1 * 1024 ** 3,
  maxUploadBytes: 10 * 1024 * 1024,
  maxRemoteImportBytes: 10 * 1024 * 1024,
  /** Temp files older than this are removed. */
  tmpTtlMs: 6 * 60 * 60 * 1000,
  /** Stop accepting render jobs when free space on the volume falls below this. PLACEHOLDER. */
  freeDiskFloorBytes: 8 * 1024 ** 3,
  /** Heavy jobs wait unless this much memory is available. PLACEHOLDER. */
  minAvailableRamBytes: 2 * 1024 ** 3,
  /** Heavy jobs wait while the 1 minute load average is above this (2 vCPU host). PLACEHOLDER. */
  maxLoad1: 1.2,
  /** Exactly one heavy job at a time until a benchmark proves more is safe. */
  maxHeavyConcurrent: 1,
  jobLeaseMs: 2 * 60 * 1000,
  workerLoopMs: 30 * 1000,
  heartbeatStaleMs: 3 * 60 * 1000,
} as const;

export const SELF_DEPLOY_LOCK = "/tmp/gravyblock-self-deploy.lock";

export const PRODUCT_KINDS = ["website", "saas", "mobile_app", "web_game", "mobile_game"] as const;
export const OWNER_KINDS = ["internal", "house", "customer"] as const;
/** Kinds an operator may upload or import. */
export const UPLOAD_KINDS = ["logo", "screenshot", "icon", "gameplay_capture", "app_capture", "font", "audio", "other"] as const;
/** Kinds only the studio itself produces (rendered output). */
export const RENDER_KINDS = ["render_image", "render_video"] as const;
export const ASSET_KINDS = [...UPLOAD_KINDS, ...RENDER_KINDS] as const;
export const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok"] as const;
export const CAMPAIGN_STATUSES = ["draft", "needs_review", "approved", "scheduled", "live", "complete", "cancelled"] as const;
export const FACT_SOURCES = ["public_page", "store_listing", "owner_entered", "asset_metadata"] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];
export type OwnerKind = (typeof OWNER_KINDS)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export type Platform = (typeof PLATFORMS)[number];

/** Master feature flag. The studio does nothing, and its UI is hidden, unless this is "1". */
export function studioEnabledByEnv(): boolean {
  return process.env.MARKETING_STUDIO_ENABLED?.trim() === "1";
}

/** Video limits. Hard output limits apply to every render; benchmark-derived values replace the placeholders in Phase 2. */
export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  maxSeconds: 60,
  maxBytes: 60 * 1024 * 1024,
  maxScenes: 24,
  transitionSeconds: 0.5,
  captionMaxLines: 3,
  captionMaxCharsPerLine: 26,
} as const;
