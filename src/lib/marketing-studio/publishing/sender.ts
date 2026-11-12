/**
 * The identity every Marketing Studio email is sent as. It is always the GravyBlock transactional sender, never a person: no personal name, no personal mailbox. The deployment's
 * general RESEND_FROM_EMAIL is deliberately NOT read here, because that setting may name a person and Marketing Studio mail must not.
 * A non-personal reply address (a support mailbox) is used as Reply-To only if one is configured; otherwise the mail says plainly that replies are not read.
 */
export const STUDIO_FROM = "GravyBlock <noreply@gravyblock.com>";

/** Anything that looks like a person rather than a team address. */
const PERSONAL = /\bchris\b|chris@|@iscreamstudio\.com/i;

/** The sender for Marketing Studio mail: the transactional sender, unless an explicitly configured Marketing Studio sender is itself non-personal. */
export function studioFrom(env: Record<string, string | undefined> = process.env): string {
  const set = (env.MARKETING_STUDIO_FROM_EMAIL ?? "").trim();
  return set && !PERSONAL.test(set) ? set : STUDIO_FROM;
}

/** A configured, non-personal support or reply address, if any. Never invented. */
export function studioReplyTo(env: Record<string, string | undefined> = process.env): string | undefined {
  const set = (env.MARKETING_STUDIO_REPLY_TO ?? env.SUPPORT_EMAIL ?? "").trim();
  return set && !PERSONAL.test(set) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(set) ? set : undefined;
}

/** The `from` and (when configured) `reply_to` fields of a Resend request. */
export function studioHeaders(env: Record<string, string | undefined> = process.env): { from: string; reply_to?: string } {
  const reply = studioReplyTo(env);
  return { from: studioFrom(env), ...(reply ? { reply_to: reply } : {}) };
}

/** One closing line that says how to respond, without naming anyone. */
export function replyNote(env: Record<string, string | undefined> = process.env): string {
  const reply = studioReplyTo(env);
  return reply ? `Questions? Reply to ${reply}.` : "This message was sent by GravyBlock from an address that is not monitored, so please do not reply to it. Use the buttons or links in the message to respond.";
}
