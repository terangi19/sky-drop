/**
 * users/{me}/blocked/{id} — one place that decides how a block is KEYED, written and found.
 *
 * Contract:
 *  - doc id        = the blocked user's uid when it can be resolved, else (legacy / unknown account) their lowercase email
 *  - blockedUid    = uid (only when resolved)
 *  - blockedEmail  = lowercase email (when known). Inbox filtering, the navbar cache and /api/unread-counts match
 *                    on this field (messages-unread.ts blockedEmailsFromDocs), never on the doc id.
 *  - the seller page looks a block up by doc id = seller uid, so blocks made from /messages and /blocked must be uid-keyed.
 *
 * Why not `profiles where email ==`: profiles is owner-only by document id in firestore.rules, so that LIST query is
 * denied for every actor and the old code silently fell back to keying the doc by email. The uid comes from the public
 * identity API (POST /api/public-profiles, signed-in callers, email -> uid), via fetchPublicProfileBySlug.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { fetchPublicProfileBySlug } from "./fetch-public-profile-client";

export function normalizeBlockedEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

/** Blocked user's uid via the public identity API ("" when the account is unknown or the lookup is unavailable). */
export async function resolveBlockedUid(email: string): Promise<string> {
  const clean = normalizeBlockedEmail(email);
  if (!clean) return "";
  try {
    const profile = await fetchPublicProfileBySlug(clean);
    const uid = typeof profile?.uid === "string" ? profile.uid.trim() : "";
    return uid && !uid.includes("@") ? uid : "";
  } catch {
    return "";
  }
}

/** Doc id + fields for a block. Never contains `undefined` (the Firestore web SDK throws on it). */
export function buildBlockedDoc(target: { uid?: string; email?: string }): {
  id: string;
  data: { blockedUid?: string; blockedEmail?: string };
} {
  const uid = String(target.uid || "").trim();
  const email = normalizeBlockedEmail(target.email);
  const data: { blockedUid?: string; blockedEmail?: string } = {};
  if (uid) data.blockedUid = uid;
  if (email) data.blockedEmail = email;
  return { id: uid || email, data };
}

/**
 * Save a block for `ownerUid`. Resolves the uid unless `knownUid` is given, writes the uid-keyed doc, and (compat) removes
 * a legacy email-keyed doc for the same person so unblocking later cannot leave a stale twin behind.
 * Falls back to the email-keyed doc when the uid cannot be resolved, so the inbox filter still works.
 */
export async function saveBlockedUser(
  db: Firestore,
  ownerUid: string,
  email: string,
  knownUid?: string
): Promise<{ id: string; uidResolved: boolean }> {
  const cleanEmail = normalizeBlockedEmail(email);
  const uid = (knownUid || "").trim() || (await resolveBlockedUid(cleanEmail));
  const { id, data } = buildBlockedDoc({ uid, email: cleanEmail });
  if (!id) throw new Error("Cannot block: no uid or email");
  await setDoc(doc(db, "users", ownerUid, "blocked", id), { ...data, createdAt: serverTimestamp() });
  if (uid && cleanEmail && cleanEmail !== uid) {
    try {
      await deleteDoc(doc(db, "users", ownerUid, "blocked", cleanEmail));
    } catch {
      /* best effort: the legacy twin may not exist */
    }
  }
  return { id, uidResolved: !!uid };
}

/**
 * Ids of the block docs that mean "ownerUid blocked this person": the uid-keyed doc, and (compat for docs saved
 * before this fix, which were keyed by email) any doc whose blockedEmail matches. At most two small reads.
 */
export async function findBlockedDocIds(
  db: Firestore,
  ownerUid: string,
  target: { uid?: string; email?: string }
): Promise<string[]> {
  const ids = new Set<string>();
  const uid = String(target.uid || "").trim();
  const email = normalizeBlockedEmail(target.email);
  if (uid) {
    const snap = await getDoc(doc(db, "users", ownerUid, "blocked", uid));
    if (snap.exists()) ids.add(snap.id);
  }
  if (email) {
    const snap = await getDocs(
      query(collection(db, "users", ownerUid, "blocked"), where("blockedEmail", "==", email), limit(5))
    );
    snap.docs.forEach((d) => ids.add(d.id));
  }
  return [...ids];
}

export async function removeBlockedDocs(db: Firestore, ownerUid: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteDoc(doc(db, "users", ownerUid, "blocked", id))));
}
