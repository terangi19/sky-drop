import { getListingOwnerId } from "./listing-owner";
import { getSellerDisplayName } from "./public-display";

export type SellerProfileListingInput = {
  sellerEmail?: string;
  sellerId?: string;
  userId?: string;
  ownerId?: string;
  sellerUid?: string;
  uid?: string;
};

export type PublicSellerProfile = {
  uid: string;
  username?: string;
  displayName?: string;
  name?: string;
  photoURL?: string;
  profileBadge?: string;
  createdAt?: unknown;
  memberSince?: unknown;
  [key: string]: unknown;
};

const batchCache = new Map<string, PublicSellerProfile | null>();
const inflightBatches = new Map<string, Promise<Map<string, PublicSellerProfile>>>();

function cacheKey(uid: string): string {
  return uid.trim();
}

/**
 * Batch-fetch public seller profiles by listing owner UIDs via Admin-backed API.
 * Profiles collection is owner-only in Firestore rules — never getDoc(profiles) from client.
 *
 * Returns a map keyed by UID and (when known from the listing) sellerEmail so existing
 * email-keyed card lookups keep working while enrichment uses canonical owner IDs.
 */
export async function fetchSellerProfilesByListing(
  listings: SellerProfileListingInput[]
): Promise<Map<string, PublicSellerProfile>> {
  const byKey = new Map<string, PublicSellerProfile>();

  const ownerIds = [
    ...new Set(
      listings
        .map((l) => getListingOwnerId(l))
        .filter((id) => id.length > 0)
    ),
  ];

  const missing = ownerIds.filter((uid) => !batchCache.has(cacheKey(uid)));
  if (missing.length > 0) {
    const batchKey = missing.slice().sort().join(",");
    let promise = inflightBatches.get(batchKey);
    if (!promise) {
      promise = (async () => {
        const found = new Map<string, PublicSellerProfile>();
        try {
          const res = await fetch("/api/public-profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uids: missing }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              profiles?: Record<string, PublicSellerProfile>;
            };
            for (const uid of missing) {
              const profile = data.profiles?.[uid];
              if (profile) {
                const normalized = { ...profile, uid };
                batchCache.set(cacheKey(uid), normalized);
                found.set(uid, normalized);
              } else {
                batchCache.set(cacheKey(uid), null);
              }
            }
          } else {
            for (const uid of missing) batchCache.set(cacheKey(uid), null);
          }
        } catch {
          for (const uid of missing) batchCache.set(cacheKey(uid), null);
        }
        return found;
      })();
      inflightBatches.set(batchKey, promise);
      try {
        await promise;
      } finally {
        inflightBatches.delete(batchKey);
      }
    } else {
      await promise;
    }
  }

  for (const listing of listings) {
    const ownerId = getListingOwnerId(listing);
    if (!ownerId) continue;
    const profile = batchCache.get(cacheKey(ownerId));
    if (!profile) continue;
    byKey.set(ownerId, profile);
    const email = String(listing.sellerEmail || "").trim();
    if (email) byKey.set(email, profile);
  }

  return byKey;
}

/** Best public card label from a public profile doc. */
export function sellerLabelFromPublicProfile(
  profile: PublicSellerProfile | null | undefined,
  fallback = ""
): string {
  if (!profile) return fallback;
  return getSellerDisplayName(
    {
      displayName: profile.displayName || profile.name,
      username: profile.username,
    },
    fallback
  );
}

export function clearSellerProfileBatchCache(): void {
  batchCache.clear();
}
