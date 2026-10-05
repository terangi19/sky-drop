/** Shared public profile field selection for single + batch profile APIs. */

import {
  isEmailDerivedName,
  resolvePublicProfileName,
} from "./safe-display-name";

export const PUBLIC_PROFILE_FIELDS = [
  "username",
  "displayName",
  "name",
  "photoURL",
  "bannerURL",
  "bio",
  "region",
  "memberSince",
  "createdAt",
  "followers",
  "following",
  "verified",
  "emailVerified",
  "phoneVerified",
  "kycStatus",
  "trustedSeller",
  "fastReply",
  "topTrader",
  "profileBadge",
  "profileViews",
  "salesCount",
  "averageRating",
  "reviewCount",
  "responseTime",
  "hideOnline",
] as const;

export type PublicProfileField = (typeof PUBLIC_PROFILE_FIELDS)[number];

export function pickPublicProfileFields(
  uid: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const profile: Record<string, unknown> = { uid };
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (data[field] !== undefined) profile[field] = data[field];
  }
  return profile;
}

/**
 * Adds derived public labels. `source` may contain email (server-side only);
 * email is never copied onto the returned object.
 * publicName: displayName, then username (even if auto-assigned), then fallback.
 * usernameIsAutoAssigned is informational and does not hide the username.
 */
export function decoratePublicProfile(
  profile: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const email = typeof source.email === "string" ? source.email : null;
  const username = profile.username;
  const displayName = profile.displayName ?? profile.name;
  return {
    ...profile,
    publicName: resolvePublicProfileName({ displayName, username, email }),
    usernameIsAutoAssigned: isEmailDerivedName(username, email),
  };
}

type LooseDb = {
  collection: (name: string) => {
    doc: (id: string) => { get: () => Promise<{ exists: boolean; id: string; data: () => Record<string, unknown> | undefined }> };
    where: (
      field: string,
      op: "==",
      value: string
    ) => {
      limit: (n: number) => {
        get: () => Promise<{
          empty: boolean;
          docs: Array<{ id: string; data: () => Record<string, unknown> }>;
        }>;
      };
    };
  };
};

/**
 * Resolve a public slug (username, email, or UID) to a profile document id.
 * Always try direct doc id first so listing sellerId lookups work.
 */
export async function resolvePublicProfileUid(
  // Admin SDK Firestore — kept loose so client bundles don't pull firebase-admin types.
  db: LooseDb,
  slug: string
): Promise<string> {
  const normalized = slug.trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();

  // Direct UID / profile doc id (canonical marketplace enrichment path)
  const direct = await db.collection("profiles").doc(normalized).get();
  if (direct.exists) return direct.id;

  // Public lookup is username or UID only. Never resolve by email — that is
  // an account-enumeration oracle for anyone who can guess an address.
  if (normalized.includes("@")) {
    return "";
  }

  const unameSnap = await db.collection("usernames").doc(lower).get();
  if (unameSnap.exists && unameSnap.data()?.uid) {
    return String(unameSnap.data()!.uid);
  }

  const candidates = [
    ...new Set([
      normalized,
      lower,
      lower.charAt(0).toUpperCase() + lower.slice(1),
    ]),
  ];
  for (const candidate of candidates) {
    const snap = await db
      .collection("profiles")
      .where("username", "==", candidate)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  }

  const listingSnap = await db
    .collection("listings")
    .where("sellerUsername", "==", lower)
    .limit(1)
    .get();
  if (!listingSnap.empty) {
    const sellerEmail = String(listingSnap.docs[0]?.data()?.sellerEmail || "");
    if (sellerEmail) {
      const snap = await db
        .collection("profiles")
        .where("email", "==", sellerEmail)
        .limit(1)
        .get();
      if (!snap.empty) return snap.docs[0].id;
    }
  }

  return "";
}
