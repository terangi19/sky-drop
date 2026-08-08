import { getListingOwnerId } from "./listing-owner";
import {
  getSellerDisplayName,
  isEmailLike,
  sellerProfileSlug,
} from "./public-display";
import { sellerProfilePath } from "./seller-profile-nav";

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

type CacheEntry = {
  profile: PublicSellerProfile | null;
  fetchedAt: number;
};

/** SPA batch cache TTL — avoid sticky stale username after profile edits. */
export const SELLER_PROFILE_BATCH_CACHE_TTL_MS = 60_000;

const batchCache = new Map<string, CacheEntry>();
const inflightBatches = new Map<string, Promise<Map<string, PublicSellerProfile>>>();

function cacheKey(id: string): string {
  return id.trim().toLowerCase();
}

function isFresh(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < SELLER_PROFILE_BATCH_CACHE_TTL_MS;
}

function readFresh(key: string): PublicSellerProfile | null | undefined {
  const entry = batchCache.get(key);
  if (!entry) return undefined;
  if (!isFresh(entry)) {
    batchCache.delete(key);
    return undefined;
  }
  return entry.profile;
}

function writeCache(key: string, profile: PublicSellerProfile | null): void {
  batchCache.set(key, { profile, fetchedAt: Date.now() });
}

type BatchResponse = {
  profiles?: Record<string, PublicSellerProfile>;
  /** email → uid for legacy listings that only store sellerEmail */
  emailToUid?: Record<string, string>;
};

async function fetchPublicProfilesBatch(payload: {
  uids: string[];
  emails: string[];
}): Promise<BatchResponse> {
  const res = await fetch("/api/public-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { profiles: {}, emailToUid: {} };
  return (await res.json()) as BatchResponse;
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

  const emailsNeedingLookup = [
    ...new Set(
      listings
        .filter((l) => !getListingOwnerId(l))
        .map((l) => String(l.sellerEmail || "").trim())
        .filter((email) => email.length > 0 && isEmailLike(email))
    ),
  ];

  const missingUids = ownerIds.filter((uid) => readFresh(cacheKey(uid)) === undefined);
  const missingEmails = emailsNeedingLookup.filter(
    (email) => readFresh(cacheKey(email)) === undefined
  );

  if (missingUids.length > 0 || missingEmails.length > 0) {
    const batchKey = [
      ...missingUids.slice().sort(),
      ...missingEmails.slice().sort().map((e) => `e:${e}`),
    ].join(",");
    let promise = inflightBatches.get(batchKey);
    if (!promise) {
      promise = (async () => {
        const found = new Map<string, PublicSellerProfile>();
        try {
          const data = await fetchPublicProfilesBatch({
            uids: missingUids,
            emails: missingEmails,
          });
          const profiles = data.profiles || {};
          const emailToUid = data.emailToUid || {};

          for (const uid of missingUids) {
            const profile = profiles[uid];
            if (profile) {
              const normalized = { ...profile, uid };
              writeCache(cacheKey(uid), normalized);
              found.set(uid, normalized);
            } else {
              writeCache(cacheKey(uid), null);
            }
          }

          for (const email of missingEmails) {
            const uid = emailToUid[email] || emailToUid[email.toLowerCase()];
            const profile = uid ? profiles[uid] : undefined;
            if (profile && uid) {
              const normalized = { ...profile, uid };
              writeCache(cacheKey(uid), normalized);
              writeCache(cacheKey(email), normalized);
              found.set(uid, normalized);
              found.set(email, normalized);
            } else {
              writeCache(cacheKey(email), null);
            }
          }
        } catch {
          for (const uid of missingUids) writeCache(cacheKey(uid), null);
          for (const email of missingEmails) writeCache(cacheKey(email), null);
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
    const email = String(listing.sellerEmail || "").trim();
    const profile =
      (ownerId ? readFresh(cacheKey(ownerId)) : undefined) ??
      (email ? readFresh(cacheKey(email)) : undefined) ??
      null;
    if (!profile) continue;
    if (ownerId) byKey.set(ownerId, profile);
    if (email) byKey.set(email, profile);
    if (profile.uid) byKey.set(profile.uid, profile);
  }

  return byKey;
}

/** Best public card label from a public profile doc (username-first). */
export function sellerLabelFromPublicProfile(
  profile: PublicSellerProfile | null | undefined,
  fallback = ""
): string {
  if (!profile) return fallback;
  return getSellerDisplayName(
    {
      username: profile.username,
      displayName: profile.displayName || profile.name,
    },
    fallback
  );
}

/** Follower relation fields stored in Firestore — IDs only, never stale labels. */
export type FollowingRelation = {
  sellerId?: string | null;
  sellerEmail?: string | null;
  createdAt?: unknown;
};

/** Presentation row for Following UI — resolved live from public profiles. */
export type FollowingPresentation = {
  sellerId: string;
  username: string;
  photoURL?: string;
  href: string;
};

/**
 * Map follower relations → display rows using a public-profile batch map.
 * Does not invent stored labels; "Seller" only when username is unresolved.
 */
export function presentFollowingRelations(
  relations: FollowingRelation[],
  profiles: Map<string, PublicSellerProfile>
): FollowingPresentation[] {
  const seen = new Set<string>();
  const rows: FollowingPresentation[] = [];

  for (const rel of relations) {
    const sellerId = String(rel.sellerId || "").trim();
    if (!sellerId || seen.has(sellerId)) continue;
    seen.add(sellerId);

    const email = String(rel.sellerEmail || "").trim();
    const profile =
      profiles.get(sellerId) ||
      (email ? profiles.get(email) : undefined) ||
      null;

    const username = sellerLabelFromPublicProfile(profile, "Seller") || "Seller";
    const photoURL = String(profile?.photoURL || "").trim() || undefined;
    const slug =
      username !== "Seller"
        ? username
        : sellerProfileSlug({
            username: profile?.username,
            sellerId,
            sellerEmail: email || undefined,
            uid: profile?.uid || sellerId,
          }) || sellerId;

    rows.push({
      sellerId,
      username,
      photoURL,
      href: sellerProfilePath(slug),
    });
  }

  return rows;
}

/**
 * Fetch follower relations then batch-resolve current public profiles (cached).
 * One batch for all unique sellerIds — no N+1.
 */
export async function enrichFollowingRelations(
  relations: FollowingRelation[]
): Promise<FollowingPresentation[]> {
  const listings = relations
    .map((r) => ({
      sellerId: String(r.sellerId || "").trim() || undefined,
      sellerEmail: String(r.sellerEmail || "").trim() || undefined,
    }))
    .filter((r) => r.sellerId || r.sellerEmail);

  const profiles = await fetchSellerProfilesByListing(listings);
  return presentFollowingRelations(relations, profiles);
}

export function clearSellerProfileBatchCache(): void {
  batchCache.clear();
}

/** Drop cached entries for a seller after profile update (uid and/or email keys). */
export function invalidateSellerProfileBatchCache(
  ...ids: Array<string | null | undefined>
): void {
  for (const id of ids) {
    const raw = String(id || "").trim();
    if (!raw) continue;
    batchCache.delete(cacheKey(raw));
  }
}
