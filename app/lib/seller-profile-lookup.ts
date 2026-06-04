import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { stripAtPrefix } from "./public-display";

export type ResolvedSellerProfile = {
  uid: string;
  data: Record<string, unknown>;
};

/**
 * Resolve a /seller/[slug] to a profile document.
 * Slug may be lowercase username, mixed-case username, or email.
 */
export async function resolveSellerBySlug(
  slug: string
): Promise<ResolvedSellerProfile | null> {
  const normalized = stripAtPrefix(slug.trim());
  if (!normalized) return null;
  const lower = normalized.toLowerCase();

  const unameSnap = await getDoc(doc(db, "usernames", lower));
  if (unameSnap.exists()) {
    const uid = String(unameSnap.data()?.uid || "");
    if (uid) {
      const profileSnap = await getDoc(doc(db, "profiles", uid));
      if (profileSnap.exists()) {
        return { uid: profileSnap.id, data: profileSnap.data()! };
      }
    }
  }

  const titleCase =
    lower.length > 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  const usernameCandidates = [...new Set([normalized, lower, titleCase])];

  let profileDoc: ResolvedSellerProfile | null = null;

  for (const candidate of usernameCandidates) {
    const attempt = await getDocs(
      query(collection(db, "profiles"), where("username", "==", candidate))
    );
    if (!attempt.empty) {
      profileDoc = { uid: attempt.docs[0].id, data: attempt.docs[0].data() };
      break;
    }
  }

  if (!profileDoc) {
    const emailSnap = await getDocs(
      query(collection(db, "profiles"), where("email", "==", normalized))
    );
    if (!emailSnap.empty) {
      profileDoc = { uid: emailSnap.docs[0].id, data: emailSnap.docs[0].data() };
    }
  }

  if (!profileDoc) {
    for (const candidate of usernameCandidates) {
      const listingByUser = await getDocs(
        query(
          collection(db, "listings"),
          where("sellerUsername", "==", candidate),
          limit(1)
        )
      );
      const sellerEmail = listingByUser.docs[0]?.data()?.sellerEmail;
      if (sellerEmail) {
        const snap = await getDocs(
          query(collection(db, "profiles"), where("email", "==", sellerEmail))
        );
        if (!snap.empty) {
          profileDoc = { uid: snap.docs[0].id, data: snap.docs[0].data() };
          break;
        }
      }
    }
  }

  if (!profileDoc) {
    const listingSnap = await getDocs(
      query(
        collection(db, "listings"),
        where("sellerEmail", "==", normalized),
        limit(1)
      )
    );
    const sellerEmail = listingSnap.docs[0]?.data()?.sellerEmail;
    if (sellerEmail) {
      const snap = await getDocs(
        query(collection(db, "profiles"), where("email", "==", sellerEmail))
      );
      if (!snap.empty) {
        profileDoc = { uid: snap.docs[0].id, data: snap.docs[0].data() };
      }
    }
  }

  return profileDoc;
}
