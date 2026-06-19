import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { stripAtPrefix } from "./public-display";

export type ResolvedSellerAdmin = {
  uid: string;
  username: string;
  email: string;
};

function usernameCandidates(slug: string): string[] {
  const normalized = stripAtPrefix(slug.trim());
  if (!normalized) return [];
  const lower = normalized.toLowerCase();
  const titleCase = lower.length > 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  return [...new Set([normalized, lower, titleCase])];
}

/** Server-side seller slug resolution (for Āwhina navigation and APIs). */
export async function resolveSellerBySlugAdmin(
  slug: string
): Promise<ResolvedSellerAdmin | null> {
  if (!isAdminInitialized()) return null;

  const normalized = stripAtPrefix(slug.trim());
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const db = getAdminDb();

  const unameSnap = await db.collection("usernames").doc(lower).get();
  if (unameSnap.exists) {
    const uid = String(unameSnap.data()?.uid || "");
    if (uid) {
      const profileSnap = await db.collection("profiles").doc(uid).get();
      if (profileSnap.exists) {
        const data = profileSnap.data() || {};
        const username = stripAtPrefix(String(data.username || lower));
        const email = String(data.email || "");
        return { uid: profileSnap.id, username, email };
      }
    }
  }

  for (const candidate of usernameCandidates(slug)) {
    const snap = await db
      .collection("profiles")
      .where("username", "==", candidate)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      return {
        uid: doc.id,
        username: stripAtPrefix(String(data.username || candidate)),
        email: String(data.email || ""),
      };
    }
  }

  const emailSnap = await db
    .collection("profiles")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  if (!emailSnap.empty) {
    const doc = emailSnap.docs[0];
    const data = doc.data();
    return {
      uid: doc.id,
      username: stripAtPrefix(String(data.username || normalized)),
      email: String(data.email || normalized),
    };
  }

  for (const candidate of usernameCandidates(slug)) {
    const listingSnap = await db
      .collection("listings")
      .where("sellerUsername", "==", candidate)
      .limit(1)
      .get();
    const sellerEmail = listingSnap.docs[0]?.data()?.sellerEmail as string | undefined;
    if (sellerEmail) {
      const profileSnap = await db
        .collection("profiles")
        .where("email", "==", sellerEmail)
        .limit(1)
        .get();
      if (!profileSnap.empty) {
        const doc = profileSnap.docs[0];
        const data = doc.data();
        return {
          uid: doc.id,
          username: stripAtPrefix(String(data.username || candidate)),
          email: sellerEmail,
        };
      }
    }
  }

  return null;
}
