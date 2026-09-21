/**
 * WordPress REST helpers for editing EXISTING content with the customer's
 * Application Password (publishingTargets adapter "wordpress").
 * Every function returns a result object and never throws; every request has
 * a 15s timeout. Callers decide what is safe to change.
 */

import { isSafePublicUrl } from "@/lib/net/safe-fetch";
import type { WordPressConfig } from "@/lib/integrations/wordpress";

export type WpType = "posts" | "pages";

export type WpContent = {
  type: WpType;
  id: number;
  title: string;
  contentHtml: string;
  link: string;
  modified: string;
  status: string;
};

export type WpResult<T> = { ok: true; value: T } | { ok: false; error: string; status?: number };

const TIMEOUT_MS = 15_000;
const FIELDS = "id,title,content,link,modified,status,slug";

function base(config: WordPressConfig): string | null {
  const u = isSafePublicUrl(config.siteUrl ?? "");
  return u ? u.origin + u.pathname.replace(/\/$/, "") : null;
}

function authHeader(config: WordPressConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.appPassword}`).toString("base64")}`;
}

async function wpRequest(config: WordPressConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<WpResult<unknown>> {
  const root = base(config);
  if (!root) return { ok: false, error: "invalid_site_url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${root}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: authHeader(config), "content-type": "application/json", accept: "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const msg = (json as { message?: string } | null)?.message;
      return { ok: false, status: res.status, error: msg ?? `wordpress_http_${res.status}` };
    }
    return { ok: true, value: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? (err.name === "AbortError" ? "timeout" : err.message) : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

type RawWp = {
  id?: number;
  link?: string;
  modified?: string;
  status?: string;
  title?: { raw?: string; rendered?: string } | string;
  content?: { raw?: string; rendered?: string } | string;
};

function toContent(type: WpType, r: RawWp): WpContent | null {
  if (typeof r.id !== "number") return null;
  const title = typeof r.title === "string" ? r.title : r.title?.raw ?? r.title?.rendered ?? "";
  const html = typeof r.content === "string" ? r.content : r.content?.raw ?? r.content?.rendered ?? "";
  return { type, id: r.id, title, contentHtml: html, link: r.link ?? "", modified: r.modified ?? "", status: r.status ?? "" };
}

function normUrl(u: string): string {
  try {
    const p = new URL(u);
    return `${p.hostname.replace(/^www\./i, "").toLowerCase()}${p.pathname.replace(/\/+$/, "")}`;
  } catch {
    return u.toLowerCase();
  }
}

/** Find a post or page by its public URL (slug lookup, link must match). */
export async function findContentByUrl(config: WordPressConfig, url: string, opts: { anyStatus?: boolean } = {}): Promise<WpResult<WpContent>> {
  let slug = "";
  try {
    slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (!slug) return { ok: false, error: "no_slug_homepage_not_supported" };
  const status = opts.anyStatus ? "&status=any" : "";
  let lastErr = "not_found";
  for (const type of ["posts", "pages"] as WpType[]) {
    const res = await wpRequest(config, `/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&context=edit&_fields=${FIELDS}${status}`);
    if (!res.ok) {
      lastErr = res.error;
      continue;
    }
    const list = Array.isArray(res.value) ? (res.value as RawWp[]) : [];
    for (const item of list) {
      const c = toContent(type, item);
      if (c && normUrl(c.link) === normUrl(url)) return { ok: true, value: c };
    }
  }
  return { ok: false, error: lastErr };
}

export async function getContentById(config: WordPressConfig, type: WpType, id: number): Promise<WpResult<WpContent>> {
  const res = await wpRequest(config, `/wp-json/wp/v2/${type}/${id}?context=edit&_fields=${FIELDS}`);
  if (!res.ok) return res;
  const c = toContent(type, res.value as RawWp);
  return c ? { ok: true, value: c } : { ok: false, error: "unexpected_response" };
}

/** Update content/title/status of one post or page. Only the provided fields are sent. */
export async function updateContent(
  config: WordPressConfig,
  type: WpType,
  id: number,
  fields: { content?: string; title?: string; status?: "publish" | "draft" },
): Promise<WpResult<WpContent>> {
  const body: Record<string, string> = {};
  if (fields.content !== undefined) body.content = fields.content;
  if (fields.title !== undefined) body.title = fields.title;
  if (fields.status !== undefined) body.status = fields.status;
  if (!Object.keys(body).length) return { ok: false, error: "nothing_to_update" };
  const res = await wpRequest(config, `/wp-json/wp/v2/${type}/${id}?context=edit`, { method: "POST", body });
  if (!res.ok) return res;
  const c = toContent(type, res.value as RawWp);
  return c ? { ok: true, value: c } : { ok: false, error: "unexpected_response" };
}
