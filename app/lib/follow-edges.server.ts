import "server-only";
/**
 * Follow edges (PROMPT-13). `followers/{sellerUid}_{followerUid}` stores uids only:
 *   { sellerId, followerId, createdAt }
 * No emails: nothing reads them (the Following tab resolves sellers by uid via the public profile
 * API, and there are no follower notifications). If a "new listing from people you follow" alert is
 * added later, resolve the follower's email server-side from profiles/{followerId} at send time.
 * Writes are Admin SDK only (/api/follow, admin moderation). firestore.rules: a user may read only
 * edges where they are the follower; sellers see `profiles.followers` (count) only.
 */
import { FieldValue, type Firestore, type WriteBatch } from "firebase-admin/firestore";

export const FOLLOW_EDGE_KEYS = ["sellerId", "followerId", "createdAt"] as const;

export function followEdgeId(sellerUid: string, followerUid: string): string {
  return `${sellerUid}_${followerUid}`;
}

export function followEdgeData(sellerUid: string, followerUid: string) {
  return { sellerId: sellerUid, followerId: followerUid, createdAt: FieldValue.serverTimestamp() };
}

const CHUNK = 400; // stay under the 500-op batch limit

/**
 * Moderation cleanup for a banned user: delete edges where they are followed (and zero their
 * count) and edges where they follow others (decrementing each seller's count).
 * The old code queried a "following id" field that no edge ever had, so nothing was removed.
 */
export async function removeFollowEdgesForUser(
  db: Firestore,
  uid: string
): Promise<{ followersRemoved: number; followingRemoved: number }> {
  if (!uid) return { followersRemoved: 0, followingRemoved: 0 };
  const [incoming, outgoing] = await Promise.all([
    db.collection("followers").where("sellerId", "==", uid).get(),
    db.collection("followers").where("followerId", "==", uid).get(),
  ]);

  const ops: Array<(b: WriteBatch) => void> = [];
  for (const d of incoming.docs) ops.push((b) => b.delete(d.ref));
  if (incoming.size > 0) {
    ops.push((b) => b.set(db.collection("profiles").doc(uid), { followers: 0 }, { merge: true }));
  }
  for (const d of outgoing.docs) {
    const sellerId = String(d.get("sellerId") || "");
    ops.push((b) => b.delete(d.ref));
    if (sellerId && sellerId !== uid) {
      ops.push((b) =>
        b.set(db.collection("profiles").doc(sellerId), { followers: FieldValue.increment(-1) }, { merge: true })
      );
    }
  }
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
  return { followersRemoved: incoming.size, followingRemoved: outgoing.size };
}
