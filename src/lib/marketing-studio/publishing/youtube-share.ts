/**
 * One iScream Studio YouTube channel serves several products. A connection belongs to ONE product (its tokens stay encrypted under that product's
 * row and are only ever read through that row); the owner may allow other products to post through the same channel. Nothing is copied: a shared
 * product's publication points at the owning product's connection, and every token use is audited under the owner row.
 */
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import { evaluateHealth, usable } from "./connections";

export const YOUTUBE_SHARE_SETTING = "youtube_channel_share";
type ShareMap = Record<string, string[]>;

/**
 * Tenant isolation: the shared umbrella channel exists only for the owner's own products (owner_kind internal or house). A customer's videos belong to the customer's own
 * accounts: a customer product can neither borrow the owner's channel nor lend its own to another product, whatever the share map says.
 */
async function sameOwnerFamily(db: StudioDb, a: string, b: string): Promise<boolean> {
  const rows = await db.select({ id: ms.msProducts.id, kind: ms.msProducts.ownerKind }).from(ms.msProducts);
  const kind = (id: string) => rows.find((r) => r.id === id)?.kind;
  return kind(a) !== undefined && kind(b) !== undefined && kind(a) !== "customer" && kind(b) !== "customer";
}

export async function shareYoutubeConnection(db: StudioDb, actor: string, connectionId: string, productId: string): Promise<void> {
  const [conn] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.platform, "youtube"))).limit(1);
  if (!conn) throw new Error("No such YouTube connection");
  if (conn.productId === productId) return;
  if (!(await sameOwnerFamily(db, conn.productId, productId))) throw new Error("A channel can only be shared between the owner's own products, never with or from a customer");
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  const next: ShareMap = { ...map, [connectionId]: [...new Set([...(map[connectionId] ?? []), productId])] };
  await setSetting(YOUTUBE_SHARE_SETTING, next, actor, db);
  await audit(db, { actor, action: "connection.share", entity: "connection", entityId: connectionId, productId, detail: { owner: conn.productId, platform: "youtube" } });
}

/** May this product post through this connection? Its own, or one the owner explicitly shared with it. */
export async function connectionAllowedFor(db: StudioDb, conn: { id: string; productId: string }, productId: string): Promise<boolean> {
  if (conn.productId === productId) return true;
  if (!(await sameOwnerFamily(db, conn.productId, productId))) return false;
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  return (map[conn.id] ?? []).includes(productId);
}

/** The healthy YouTube connection this product posts through: its own, else one shared with it. */
export async function youtubeConnectionFor(db: StudioDb, productId: string) {
  const all = await db.select().from(ms.msConnections).where(eq(ms.msConnections.platform, "youtube"));
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  const mine: typeof all = [];
  for (const c of all) if (c.productId === productId || ((map[c.id] ?? []).includes(productId) && (await sameOwnerFamily(db, c.productId, productId)))) mine.push(c);
  return mine.find((c) => usable(evaluateHealth(c))) ?? null;
}
