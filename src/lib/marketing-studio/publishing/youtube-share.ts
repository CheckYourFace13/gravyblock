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

export async function shareYoutubeConnection(db: StudioDb, actor: string, connectionId: string, productId: string): Promise<void> {
  const [conn] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.platform, "youtube"))).limit(1);
  if (!conn) throw new Error("No such YouTube connection");
  if (conn.productId === productId) return;
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  const next: ShareMap = { ...map, [connectionId]: [...new Set([...(map[connectionId] ?? []), productId])] };
  await setSetting(YOUTUBE_SHARE_SETTING, next, actor, db);
  await audit(db, { actor, action: "connection.share", entity: "connection", entityId: connectionId, productId, detail: { owner: conn.productId, platform: "youtube" } });
}

/** May this product post through this connection? Its own, or one the owner explicitly shared with it. */
export async function connectionAllowedFor(db: StudioDb, conn: { id: string; productId: string }, productId: string): Promise<boolean> {
  if (conn.productId === productId) return true;
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  return (map[conn.id] ?? []).includes(productId);
}

/** The healthy YouTube connection this product posts through: its own, else one shared with it. */
export async function youtubeConnectionFor(db: StudioDb, productId: string) {
  const all = await db.select().from(ms.msConnections).where(eq(ms.msConnections.platform, "youtube"));
  const map = await getSetting<ShareMap>(YOUTUBE_SHARE_SETTING, {}, db);
  const mine = all.filter((c) => c.productId === productId || (map[c.id] ?? []).includes(productId));
  return mine.find((c) => usable(evaluateHealth(c))) ?? null;
}
