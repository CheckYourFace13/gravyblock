/**
 * Platform adapters. Facebook Pages has a real Graph API implementation (it can only ever run through the publish gate with live
 * publishing switched on, and is tested against a stubbed fetch). The YouTube adapter (youtube-api.ts) is real too but stays behind the
 * platform-approval gate. Instagram and TikTok adapters deliberately do NOT call
 * any API: their direct publishing needs platform approval or an audit that has not happened, so they refuse and point to the export
 * bundle instead of pretending to work. Independent of the website publishing stack and of the older Facebook helper in
 * src/lib/integrations (which takes plaintext tokens from site configuration).
 */
import type { Platform } from "../config";
import type { MediaKind } from "./platforms";
import { PLATFORM_SPECS } from "./platforms";
import { youtubeAdapter, type YoutubeUploadExtras } from "./youtube-api";

export type PublishInput = {
  platform: Platform;
  externalAccountId: string;
  media: { kind: MediaKind; bytes: Buffer; mime: string; fileName: string };
  caption: string;
  title?: string | null;
  accessToken: string;
  /** YouTube only: visibility and the owner's made-for-kids declaration. */
  youtube?: YoutubeUploadExtras;
};

export type PublishResult =
  | { ok: true; externalId: string; url?: string }
  | { ok: false; retryable: boolean; reason: string; authFailure?: boolean; unsupported?: boolean };

export type Deps = { fetch: typeof fetch };

export interface Adapter {
  platform: Platform;
  publish(input: PublishInput, deps: Deps): Promise<PublishResult>;
  remove?(input: { externalAccountId: string; externalId: string; accessToken: string }, deps: Deps): Promise<{ ok: boolean; reason?: string }>;
}

/** Graph API version. Configurable because Meta retires old versions; the default is a recent one (VERIFY against current docs). */
const graphVersion = () => process.env.MARKETING_FB_GRAPH_VERSION?.trim() || "v25.0";
const GRAPH = () => `https://graph.facebook.com/${graphVersion()}`;
export const graphBase = GRAPH;

type FbError = { error?: { message?: string; code?: number; type?: string } };

function classify(status: number, body: FbError): Extract<PublishResult, { ok: false }> {
  const code = body.error?.code;
  const reason = body.error?.message ?? `HTTP ${status}`;
  // 190 is an invalid or expired access token; 200-299 are permission errors; 10 is a missing permission.
  if (code === 190 || status === 401 || code === 10 || (code !== undefined && code >= 200 && code <= 299) || status === 403) return { ok: false, retryable: false, authFailure: true, reason: `Facebook rejected the credentials or permissions: ${reason}` };
  if (status === 429 || status >= 500 || code === 4 || code === 17 || code === 32 || code === 613) return { ok: false, retryable: true, reason: `Facebook temporary error: ${reason}` };
  return { ok: false, retryable: false, reason: `Facebook rejected the post: ${reason}` };
}

export const facebookAdapter: Adapter = {
  platform: "facebook",
  async publish(input, { fetch }) {
    const pageId = input.externalAccountId;
    try {
      if (input.media.kind === "image") {
        const form = new FormData();
        form.set("caption", input.caption);
        form.set("access_token", input.accessToken);
        form.set("published", "true");
        form.set("source", new Blob([new Uint8Array(input.media.bytes)], { type: input.media.mime }), input.media.fileName);
        const res = await fetch(`${GRAPH()}/${pageId}/photos`, { method: "POST", body: form });
        const json = (await res.json()) as { id?: string; post_id?: string } & FbError;
        if (!res.ok || json.error || !(json.post_id ?? json.id)) return classify(res.status, json);
        const id = json.post_id ?? json.id!;
        return { ok: true, externalId: id, url: `https://www.facebook.com/${id}` };
      }
      // Reels: start an upload session, upload the bytes, then finish and publish.
      const start = await fetch(`${GRAPH()}/${pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "start", access_token: input.accessToken }) });
      const s = (await start.json()) as { video_id?: string; upload_url?: string } & FbError;
      if (!start.ok || s.error || !s.video_id || !s.upload_url) return classify(start.status, s);
      const up = await fetch(s.upload_url, { method: "POST", headers: { Authorization: `OAuth ${input.accessToken}`, offset: "0", file_size: String(input.media.bytes.length) }, body: new Uint8Array(input.media.bytes) });
      if (!up.ok) return classify(up.status, (await up.json().catch(() => ({}))) as FbError);
      const fin = await fetch(`${GRAPH()}/${pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "finish", video_id: s.video_id, video_state: "PUBLISHED", description: input.caption, access_token: input.accessToken }) });
      const f = (await fin.json()) as { success?: boolean } & FbError;
      if (!fin.ok || f.error || f.success === false) return classify(fin.status, f);
      return { ok: true, externalId: s.video_id, url: `https://www.facebook.com/reel/${s.video_id}` };
    } catch (e) {
      return { ok: false, retryable: true, reason: `Network error talking to Facebook: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
  async remove(input, { fetch }) {
    try {
      const res = await fetch(`${GRAPH()}/${input.externalId}?access_token=${encodeURIComponent(input.accessToken)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as FbError & { success?: boolean };
      return res.ok && !json.error ? { ok: true } : { ok: false, reason: json.error?.message ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
};

/** An adapter that never touches the network: direct posting is not available for this platform until its review or audit passes. */
function notApproved(platform: Platform): Adapter {
  const spec = PLATFORM_SPECS[platform];
  return {
    platform,
    async publish() {
      return { ok: false, retryable: false, unsupported: true, reason: `${spec.label}: direct publishing is not available (${spec.approvalNote}) Use the export bundle and post manually.` };
    },
  };
}

export const ADAPTERS: Record<Platform, Adapter> = {
  facebook: facebookAdapter,
  instagram: notApproved("instagram"),
  youtube: youtubeAdapter,
  tiktok: notApproved("tiktok"),
};
