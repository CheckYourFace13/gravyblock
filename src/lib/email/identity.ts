/**
 * The identity of every customer-facing GravyBlock email: "Casey at GravyBlock" at hello@gravyblock.com, with replies going to the same address. No personal name and no personal
 * mailbox is ever used. The deployment's general RESEND_FROM_EMAIL setting is deliberately NOT read for customer mail, because that setting has named a person before.
 * Owner-only reports are separate and may go to the owner's own address.
 */
export const CUSTOMER_FROM_NAME = "Casey";
export const CUSTOMER_FROM = "Casey at GravyBlock <hello@gravyblock.com>";
export const CUSTOMER_REPLY_TO = "hello@gravyblock.com";

/** Anything that names a person or uses a personal mailbox. */
export const PERSONAL_IDENTITY = /\bchris\b|chris@|@iscreamstudio\.com/i;

/** A separately configured sender (for example a dedicated outreach domain) is used only if it is itself not personal; otherwise the standard identity. */
export function outreachFrom(env: Record<string, string | undefined> = process.env): string {
  const set = (env.OUTREACH_FROM_EMAIL ?? "").trim();
  return set && !PERSONAL_IDENTITY.test(set) ? set : CUSTOMER_FROM;
}

/** The bare address inside a "Name <address>" sender. */
export const bareAddress = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
