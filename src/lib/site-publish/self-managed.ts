/**
 * GravyBlock's own marketing site. As a house account it is READ-ONLY: the House engine never modifies
 * gravyblock.com (see site-publish/write-policy.ts). This module keeps the pass-through the page code already
 * calls, so those pages stay unchanged and perform no database read.
 */
import type { Metadata } from "next";

/** Configuration, not engine logic: the id of GravyBlock's own house account. */
export const SELF_BUSINESS_ID = process.env.GRAVYBLOCK_SELF_BUSINESS_ID ?? "d44e8ae8-948f-40c0-8a64-5f0c4aab8ac5";

export async function applySelfManagedMetadata(_path: string, base: Metadata): Promise<Metadata> {
  return base;
}
