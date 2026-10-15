/**
 * Self connector: GravyBlock's own marketing site applies its own active overrides through the SAME
 * desired-state builder the signed feed uses, in process (no HTTP, no signature, no network loop).
 * Capabilities are page metadata and social preview image only; it never edits anything else.
 */
import type { Metadata } from "next";
import { buildManagedFeed } from "./managed-feed";

/** Configuration, not engine logic: the id of GravyBlock's own house account. */
export const SELF_BUSINESS_ID = process.env.GRAVYBLOCK_SELF_BUSINESS_ID ?? "d44e8ae8-948f-40c0-8a64-5f0c4aab8ac5";

function httpsUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
}

export async function applySelfManagedMetadata(path: string, base: Metadata): Promise<Metadata> {
  try {
    const feed = await buildManagedFeed(SELF_BUSINESS_ID);
    const ov = feed.overrides.find((o) => o.path === path);
    if (!ov) return base;
    const out: Metadata = { ...base };
    if (typeof ov.title === "string" && ov.title) {
      out.title = { absolute: ov.title };
      out.openGraph = { ...(out.openGraph ?? {}), title: ov.title };
    }
    if (typeof ov.description === "string" && ov.description) {
      out.description = ov.description;
      out.openGraph = { ...(out.openGraph ?? {}), description: ov.description };
    }
    const img = httpsUrl(ov.ogImage);
    if (img) {
      out.openGraph = { ...(out.openGraph ?? {}), images: [{ url: img }] };
      out.twitter = { ...(out.twitter ?? {}), images: [img] };
    }
    return out;
  } catch {
    return base;
  }
}
