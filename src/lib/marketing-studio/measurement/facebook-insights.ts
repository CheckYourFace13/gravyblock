/**
 * Reads the numbers for ONE already published Facebook post. Read-only Graph calls with the product's own page token.
 * Meta has retired several older metric names, so each insight is requested on its own: a metric the API refuses becomes
 * UNKNOWN with the reason, and never blocks the others or turns into zero.
 */
import { graphBase, type Deps } from "../publishing/adapters";
import { confirmed, unknown, type MetricSet } from "./metrics";

type GraphErr = { error?: { message?: string; code?: number } };

async function getJson<T>(fetchFn: typeof fetch, url: string): Promise<{ ok: true; body: T } | { ok: false; status: number; reason: string; auth: boolean }> {
  try {
    const res = await fetchFn(url, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as T & GraphErr;
    if (!res.ok || body.error) {
      const code = body.error?.code;
      return { ok: false, status: res.status, reason: body.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`, auth: code === 190 || res.status === 401 || res.status === 403 };
    }
    return { ok: true, body };
  } catch (e) {
    return { ok: false, status: 0, reason: e instanceof Error ? e.message.slice(0, 200) : "network error", auth: false };
  }
}

const token = (t: string) => `access_token=${encodeURIComponent(t)}`;

/** One insight value from a response of the form { data: [{ name, values: [{ value }] }] }. */
function insightValue(body: { data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> }): number | null {
  const v = body.data?.[0]?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

export type FacebookMetricsResult = { metrics: MetricSet; postExists: boolean; authFailure: boolean; detail: string[] };

export async function collectFacebookMetrics(input: { externalId: string; kind: "image" | "video"; accessToken: string }, deps: Deps): Promise<FacebookMetricsResult> {
  const base = graphBase();
  const id = encodeURIComponent(input.externalId);
  const metrics: MetricSet = {};
  const detail: string[] = [];
  let authFailure = false;

  if (input.kind === "image") {
    // Engagement counts come from stable post fields, not from the insights API.
    const post = await getJson<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(
      deps.fetch,
      `${base}/${id}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&${token(input.accessToken)}`,
    );
    if (!post.ok) {
      authFailure = post.auth;
      const why = `post fields unavailable: ${post.reason}`;
      detail.push(why);
      metrics.reactions = unknown(why);
      metrics.comments = unknown(why);
      metrics.shares = unknown(why);
      return { metrics, postExists: post.status !== 404 && post.status !== 400 ? true : false, authFailure, detail };
    }
    const b = post.body;
    if (typeof b.reactions?.summary?.total_count === "number") metrics.reactions = confirmed(b.reactions.summary.total_count);
    else metrics.reactions = unknown("reaction count missing from response");
    if (typeof b.comments?.summary?.total_count === "number") metrics.comments = confirmed(b.comments.summary.total_count);
    else metrics.comments = unknown("comment count missing from response");
    // Facebook leaves `shares` out entirely when a post has none; we say so rather than hide the inference.
    metrics.shares = typeof b.shares?.count === "number" ? confirmed(b.shares.count) : { value: 0, status: "estimated", note: "shares field absent, which Facebook does for posts with no shares" };
  }

  const single = async (path: string, metric: string) => {
    const r = await getJson<{ data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> }>(deps.fetch, `${base}/${id}/${path}?metric=${metric}&${token(input.accessToken)}`);
    if (!r.ok) {
      authFailure ||= r.auth;
      detail.push(`${metric}: ${r.reason}`);
      return { value: null as number | null, why: r.reason };
    }
    const v = insightValue(r.body);
    return v === null ? { value: null, why: "no value returned (metric may need more time or does not apply)" } : { value: v, why: "" };
  };

  if (input.kind === "image") {
    const views = await single("insights", "post_media_view");
    metrics.impressions = views.value !== null ? confirmed(views.value, "Meta media views") : unknown(views.why);
    const reach = await single("insights", "post_total_media_view_unique");
    metrics.reach = reach.value !== null ? confirmed(reach.value) : unknown(reach.why);
    const clicks = await single("insights", "post_clicks");
    metrics.link_clicks = clicks.value !== null ? { value: clicks.value, status: "estimated", note: "all post clicks, which include clicks that are not on the link" } : unknown(clicks.why);
  } else {
    const plays = await single("video_insights", "post_video_views");
    metrics.views = plays.value !== null ? confirmed(plays.value) : unknown(plays.why);
    const watch = await single("video_insights", "post_video_view_time");
    metrics.video_watch_seconds = watch.value !== null ? confirmed(Math.round(watch.value / 1000), "converted from milliseconds") : unknown(watch.why);
    const avg = await single("video_insights", "post_video_avg_time_watched");
    metrics.avg_watch_seconds = avg.value !== null ? confirmed(Math.round(avg.value / 1000), "converted from milliseconds") : unknown(avg.why);
    // Reels expose their reactions and comments on the video object.
    const eng = await getJson<{ likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(deps.fetch, `${base}/${id}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0)&${token(input.accessToken)}`);
    if (eng.ok) {
      metrics.reactions = typeof eng.body.likes?.summary?.total_count === "number" ? confirmed(eng.body.likes.summary.total_count, "likes only for video objects") : unknown("likes missing");
      metrics.comments = typeof eng.body.comments?.summary?.total_count === "number" ? confirmed(eng.body.comments.summary.total_count) : unknown("comments missing");
    } else {
      authFailure ||= eng.auth;
      detail.push(`video engagement: ${eng.reason}`);
    }
  }
  return { metrics, postExists: true, authFailure, detail };
}

/** Confirms the post is really live and public, straight from Facebook. */
export async function verifyFacebookPostLive(input: { externalId: string; accessToken: string }, deps: Deps): Promise<{ live: boolean; permalink: string | null; reason?: string }> {
  const r = await getJson<{ permalink_url?: string; is_published?: boolean; id?: string; permalink?: string }>(deps.fetch, `${graphBase()}/${encodeURIComponent(input.externalId)}?fields=id,permalink_url,is_published&${token(input.accessToken)}`);
  if (!r.ok) return { live: false, permalink: null, reason: r.reason };
  const published = r.body.is_published !== false;
  return { live: published, permalink: r.body.permalink_url ?? null, reason: published ? undefined : "Facebook reports the post as not published" };
}
