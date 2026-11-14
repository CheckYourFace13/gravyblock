/**
 * Platform capability registry. This file is the single honest statement of what each platform's OFFICIAL API lets Marketing Studio do.
 * Nothing is faked: where direct public posting needs platform approval or an audit that has not happened, `direct` says so and the
 * publish gate refuses it, so the only available path is an export bundle for manual upload. Items marked VERIFY come from secondary
 * sources and must be checked against the platform's current documentation before an operator attests approval.
 */
import type { Platform } from "../config";

export type MediaKind = "image" | "video";

/** available_with_healthy_connection: allowed once a healthy connection with the required scopes exists.
 *  requires_platform_approval: refused until an operator attests the platform review or audit passed (ms_settings platform_approved_<platform>).
 *  manual_only: no usable official direct path. */
export type DirectStatus = "available_with_healthy_connection" | "requires_platform_approval" | "manual_only";

export type MediaRule = { aspects: Array<{ label: string; ratio: number }>; maxSeconds?: number; note: string };

export type PlatformSpec = {
  platform: Platform;
  label: string;
  official_api: string;
  media: { image: MediaRule | null; video: MediaRule | null };
  direct: DirectStatus;
  accountRequirements: string[];
  auth: { type: "oauth2"; requiredScopes: string[]; allowedScopes: string[] };
  rateLimit: { max24h: number | null; ourCap24h: number; note: string };
  approvalNote: string;
  caption: { max: number; titleMax?: number };
  needsTitle: boolean;
  schedulingNote: string;
  exportNotes: string[];
  verify: string[];
};

const R = (label: string, w: number, h: number) => ({ label, ratio: w / h });
const FEED = [R("1:1", 1, 1), R("4:5", 4, 5), R("1.91:1", 1.91, 1)];
const VERTICAL = [R("9:16", 9, 16)];

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  facebook: {
    platform: "facebook",
    label: "Facebook Pages",
    official_api: "Graph API: /{page-id}/photos for images, /{page-id}/video_reels for Reels",
    media: {
      image: { aspects: FEED, note: "Feed photos. 1:1, 4:5 or 1.91:1 recommended." },
      video: { aspects: VERTICAL, maxSeconds: 90, note: "Reels, vertical 9:16, up to 90 seconds." },
    },
    direct: "available_with_healthy_connection",
    accountRequirements: ["A Facebook Page the connecting user can post as (a Page role with the CREATE_CONTENT task)", "Posting is to Pages only, never personal profiles"],
    auth: { type: "oauth2", requiredScopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"], allowedScopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"] },
    rateLimit: { max24h: 30, ourCap24h: 6, note: "Meta documents 30 API-published Reels per 24 hours per Page. GravyBlock caps itself far lower." },
    approvalNote: "Posting to a Page you administer works for your own app roles. Serving other businesses' Pages needs Meta App Review (Advanced Access) and possibly Business Verification.",
    caption: { max: 5000 },
    needsTitle: false,
    schedulingNote: "Scheduling is done by Marketing Studio (the post is sent at the scheduled time); no platform scheduling is used.",
    exportNotes: ["Upload from Meta Business Suite or the Page's Create post / Reel flow.", "Paste the caption exactly as supplied."],
    verify: ["Current Graph API version", "Whether the app is in development mode for this Page", "Current Reels length limit"],
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    official_api: "Instagram Platform content publishing: create a media container, then media_publish",
    media: {
      image: { aspects: FEED, note: "Feed photos, JPEG recommended by Instagram. 1:1, 4:5 or 1.91:1." },
      video: { aspects: VERTICAL, maxSeconds: 90, note: "Reels, vertical 9:16, up to 90 seconds (VERIFY)." },
    },
    direct: "requires_platform_approval",
    accountRequirements: ["An Instagram Business or Creator account linked to a Facebook Page", "Personal accounts cannot be posted to through the API"],
    auth: { type: "oauth2", requiredScopes: ["instagram_business_basic", "instagram_business_content_publish"], allowedScopes: ["instagram_business_basic", "instagram_business_content_publish", "pages_show_list"] },
    rateLimit: { max24h: 100, ourCap24h: 6, note: "Meta documents about 100 API-published posts per 24 hours (a conflicting 50 appears in the same docs, VERIFY). GravyBlock caps itself far lower." },
    approvalNote: "instagram_business_content_publish needs Meta App Review for general use. Development mode only covers app roles and test users.",
    caption: { max: 2200 },
    needsTitle: false,
    schedulingNote: "The API has no scheduling endpoint; Marketing Studio sends the post at the scheduled time.",
    exportNotes: ["Upload from the Instagram app or Meta Business Suite.", "Hashtags and mentions are not added automatically."],
    verify: ["Current content-publishing limit (50 or 100)", "Reels maximum length", "Whether App Review for content_publish has been granted"],
  },
  youtube: {
    platform: "youtube",
    label: "YouTube / Shorts",
    official_api: "YouTube Data API v3 videos.insert (resumable upload)",
    media: { image: null, video: { aspects: [...VERTICAL, R("16:9", 16, 9)], maxSeconds: 60, note: "Shorts are vertical video (9:16); the game video engine's landscape formats go up as ordinary 16:9 videos. Marketing Studio keeps both at 60 seconds or less." } },
    direct: "available_with_healthy_connection",
    accountRequirements: ["A YouTube channel the connecting Google account owns or manages; the channel is chosen at Google consent and verified by id, never inferred", "youtube.readonly alongside youtube.upload: upload alone cannot identify the channel or confirm the uploaded video"],
    auth: { type: "oauth2", requiredScopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"], allowedScopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube"] },
    rateLimit: { max24h: null, ourCap24h: 3, note: "Default quota is reported as 10,000 units per day with about 1,600 per upload, so roughly 6 uploads a day (VERIFY). Do not create extra Cloud projects to multiply quota." },
    approvalNote: "No platform review blocks public uploads: Google lifted the private-only restriction on unverified API projects on 2 November 2026 (YouTube Data API revision history). Uploads still follow the YouTube API Services Terms; the owner declares made-for-kids and the visibility per product.",
    caption: { max: 5000, titleMax: 100 },
    needsTitle: true,
    schedulingNote: "videos.insert can upload with a publishAt time (private until then). Marketing Studio sends at the scheduled time.",
    exportNotes: ["Upload in YouTube Studio. Use the supplied title and description.", "Vertical video of 60 seconds or less is treated as a Short."],
    verify: ["Current videos.insert quota cost", "Current maximum Shorts length"],
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    official_api: "Content Posting API (Direct Post, or upload to the creator's inbox as a draft)",
    media: { image: null, video: { aspects: VERTICAL, maxSeconds: 60, note: "Vertical video. Marketing Studio keeps it at 60 seconds or less." } },
    direct: "requires_platform_approval",
    accountRequirements: ["A TikTok account that authorizes the app (per-user authorization)"],
    auth: { type: "oauth2", requiredScopes: ["video.publish"], allowedScopes: ["video.publish", "video.upload", "user.info.basic"] },
    rateLimit: { max24h: null, ourCap24h: 3, note: "Unaudited clients are reported limited to about 5 posting users per day, with posts forced private (VERIFY)." },
    approvalNote: "Direct Post to public requires the app to pass TikTok's audit; until then posts are private only (VERIFY).",
    caption: { max: 2200 },
    needsTitle: false,
    schedulingNote: "No scheduling endpoint; Marketing Studio sends the post at the scheduled time once approved.",
    exportNotes: ["Upload in the TikTok app or TikTok Studio.", "Check the privacy and disclosure options manually."],
    verify: ["Whether the app audit has passed", "Current per-day posting limits"],
  },
};

export const specFor = (platform: string): PlatformSpec | null => (PLATFORM_SPECS as Record<string, PlatformSpec | undefined>)[platform] ?? null;

export type MediaInfo = { kind: MediaKind; width: number; height: number; durationSec?: number | null };

/** Platform-specific format checks. Never truncates or rewrites text: a problem is reported for the operator to fix. */
export function validateForPlatform(platform: string, media: MediaInfo, text: { caption: string; title?: string | null; ctaUrl?: string | null }): string[] {
  const spec = specFor(platform);
  if (!spec) return [`Unknown platform "${platform}"`];
  const problems: string[] = [];
  const rule = media.kind === "image" ? spec.media.image : spec.media.video;
  if (!rule) problems.push(`${spec.label} does not accept ${media.kind}s through its official API or in Marketing Studio`);
  else {
    const ratio = media.width / media.height;
    if (!rule.aspects.some((a) => Math.abs(ratio - a.ratio) / a.ratio < 0.03)) problems.push(`${media.width}x${media.height} is not a supported aspect ratio for ${spec.label} (${rule.aspects.map((a) => a.label).join(", ")})`);
    if (media.kind === "video" && rule.maxSeconds && (media.durationSec ?? 0) > rule.maxSeconds + 0.5) problems.push(`video is ${media.durationSec?.toFixed(1)}s, over the ${rule.maxSeconds}s limit for ${spec.label}`);
  }
  if (!text.caption.trim()) problems.push("caption is empty");
  if (text.caption.length > spec.caption.max) problems.push(`caption is ${text.caption.length} characters, over the ${spec.caption.max} limit for ${spec.label}`);
  if (spec.needsTitle) {
    if (!text.title?.trim()) problems.push(`${spec.label} needs a title`);
    else if (spec.caption.titleMax && text.title.length > spec.caption.titleMax) problems.push(`title is ${text.title.length} characters, over the ${spec.caption.titleMax} limit`);
  }
  if (text.ctaUrl) {
    try {
      if (new URL(text.ctaUrl).protocol !== "https:") problems.push("CTA URL must be https");
    } catch {
      problems.push("CTA URL is not a valid URL");
    }
  }
  return problems;
}

/** The platform payload as it would be sent, for transparency and tests. Contains no credentials. */
export function formatPayload(platform: string, media: MediaInfo, text: { caption: string; title?: string | null }): Record<string, unknown> {
  switch (platform) {
    case "facebook":
      return media.kind === "image" ? { endpoint: "photos", message: text.caption } : { endpoint: "video_reels", description: text.caption };
    case "instagram":
      return media.kind === "image" ? { media_type: "IMAGE", caption: text.caption } : { media_type: "REELS", caption: text.caption };
    case "youtube":
      return { snippet: { title: text.title ?? "", description: text.caption }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } };
    case "tiktok":
      return { post_info: { title: text.caption, privacy_level: "PUBLIC_TO_EVERYONE" }, source_info: { source: "FILE_UPLOAD" } };
    default:
      return {};
  }
}

export function aspectLabel(width: number, height: number): string {
  const ratio = width / height;
  const all = [R("1:1", 1, 1), R("4:5", 4, 5), R("1.91:1", 1.91, 1), R("9:16", 9, 16)];
  return all.find((a) => Math.abs(ratio - a.ratio) / a.ratio < 0.03)?.label ?? `${width}x${height}`;
}
