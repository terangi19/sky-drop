import { publicHandleFromProfile } from "./public-display";

export type ClientPublicProfile = {
  uid?: string;
  username?: string;
  email?: string;
  photoURL?: string;
  bannerURL?: string;
  bio?: string;
  region?: string;
  memberSince?: { seconds: number };
  verified?: boolean;
  trustedSeller?: boolean;
  fastReply?: boolean;
  topTrader?: boolean;
  profileBadge?: string;
  salesCount?: number;
  kycStatus?: string;
};

const profileCache = new Map<string, Promise<ClientPublicProfile | null>>();

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function clearPublicProfileCache(slug?: string): void {
  if (slug) profileCache.delete(cacheKey(slug));
  else profileCache.clear();
}

/** Resolve a public profile by username, uid slug, or email via server API. */
export async function fetchPublicProfileBySlug(
  slug: string,
  options?: { forceRefresh?: boolean }
): Promise<ClientPublicProfile | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const key = cacheKey(trimmed);
  if (options?.forceRefresh) profileCache.delete(key);

  if (!profileCache.has(key)) {
    profileCache.set(
      key,
      (async () => {
        try {
          const res = await fetch(
            `/api/public-profile?slug=${encodeURIComponent(trimmed)}`
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { profile?: ClientPublicProfile | null };
          return data.profile ?? null;
        } catch {
          return null;
        }
      })()
    );
  }

  return profileCache.get(key)!;
}

export async function fetchPublicHandle(
  identifier: string,
  fallback = "User",
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const profile = await fetchPublicProfileBySlug(identifier, options);
  return publicHandleFromProfile(profile, fallback);
}
