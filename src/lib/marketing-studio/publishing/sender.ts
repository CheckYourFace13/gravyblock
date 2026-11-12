/**
 * The identity every Marketing Studio email is sent as: the standard customer identity (Casey at GravyBlock, hello@gravyblock.com, replies to the same address). It never names a
 * person and never uses a personal mailbox, and the deployment's general RESEND_FROM_EMAIL is deliberately not read.
 */
import { CUSTOMER_FROM, CUSTOMER_REPLY_TO } from "../../email/identity";

export const STUDIO_FROM = CUSTOMER_FROM;

export const studioFrom = (): string => CUSTOMER_FROM;
export const studioReplyTo = (): string => CUSTOMER_REPLY_TO;

/** The `from` and `reply_to` fields of a Resend request. */
export const studioHeaders = (): { from: string; reply_to: string } => ({ from: CUSTOMER_FROM, reply_to: CUSTOMER_REPLY_TO });

/** One closing line that says how to respond, without naming anyone. */
export const replyNote = (): string => `You can reply to this email: it reaches GravyBlock at ${CUSTOMER_REPLY_TO}.`;
