import { publicHandleFromProfile } from "./public-display";
import {
  clearPublicIdentityCache,
  hydrateIdentityFromProfile,
  peekPublicProfileRecord,
  resolvePublicIdentity,
} from "./public-identity";

export type ClientPublicProfile = {
  uid?: string;
  username?: string;
  displayName?: string;
  name?: string;
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

export function clearPublicProfileCache(slug?: string): void {
  clearPublicIdentityCache(slug);
}

/**
 * Resolve a public profile by username, uid slug, or email via shared
 * public-identity cache (batch + single + session warm).
 */
export async function fetchPublicProfileBySlug(
  slug: string,
  options?: { forceRefresh?: boolean }
): Promise<ClientPublicProfile | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  if (!options?.forceRefresh) {
    const cached = peekPublicProfileRecord(trimmed);
    if (cached) return cached as ClientPublicProfile;
  }

  const identity = await resolvePublicIdentity(trimmed, options);
  if (!identity) return null;

  const fromCache = peekPublicProfileRecord(trimmed);
  if (fromCache) return fromCache as ClientPublicProfile;

  // Identity resolved but profile payload missing (session warm without full doc)
  const minimal: ClientPublicProfile = {
    uid: identity.uid || undefined,
    username: identity.username || undefined,
    email: identity.email,
    photoURL: identity.avatar || undefined,
  };
  hydrateIdentityFromProfile(trimmed, minimal as Record<string, unknown>);
  return minimal;
}

export async function fetchPublicHandle(
  identifier: string,
  fallback = "User",
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const profile = await fetchPublicProfileBySlug(identifier, options);
  return publicHandleFromProfile(profile, fallback);
}
