/**
 * Canonical client public-identity cache/resolver.
 * identifier → { username, avatar, uid, publicSlug }
 *
 * Uses POST /api/public-profiles (via fetchPublicProfiles) for email/uid batches,
 * and GET /api/public-profile for username slugs. One in-flight promise per key;
 * sessionStorage warms PUBLIC identity only (never private message bodies).
 */

import {
  fetchPublicProfiles,
  type PublicSellerProfile,
} from "./fetch-seller-profiles";
import {
  isEmailLike,
  publicHandleFromProfile,
  sellerProfileSlug,
} from "./public-display";

export type PublicIdentity = {
  username: string;
  handle: string;
  avatar: string;
  uid: string;
  publicSlug: string;
  email?: string;
};

export type PublicIdentityMetrics = {
  resolveCalls: number;
  batchRequests: number;
  singleRequests: number;
  cacheHits: number;
  sessionHits: number;
  inFlightJoins: number;
  lastUniqueCount: number;
  lastResolveMs: number;
  lastBatchRequests: number;
  lastSingleRequests: number;
};

const MEMORY_TTL_MS = 60_000;
const SESSION_KEY = "sky-public-identity-v1";
const SESSION_TTL_MS = 30 * 60_000;

type MemoryEntry = {
  identity: PublicIdentity | null;
  fetchedAt: number;
  /** Session-warmed entries are shown immediately but still revalidated. */
  source: "network" | "session";
  profile?: Record<string, unknown> | null;
};

const memory = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<PublicIdentity | null>>();

const metrics: PublicIdentityMetrics = {
  resolveCalls: 0,
  batchRequests: 0,
  singleRequests: 0,
  cacheHits: 0,
  sessionHits: 0,
  inFlightJoins: 0,
  lastUniqueCount: 0,
  lastResolveMs: 0,
  lastBatchRequests: 0,
  lastSingleRequests: 0,
};

function cacheKey(id: string): string {
  return id.trim().toLowerCase();
}

function isFresh(entry: MemoryEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < MEMORY_TTL_MS;
}

function looksLikeUid(value: string): boolean {
  if (isEmailLike(value)) return false;
  return /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

function readSessionStore(): Record<
  string,
  { identity: PublicIdentity; savedAt: number }
> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      { identity: PublicIdentity; savedAt: number }
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionIdentity(key: string, identity: PublicIdentity): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const store = readSessionStore();
    store[key] = { identity, savedAt: Date.now() };
    const keys = Object.keys(store);
    if (keys.length > 200) {
      keys
        .sort((a, b) => (store[a].savedAt || 0) - (store[b].savedAt || 0))
        .slice(0, keys.length - 200)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

function readSessionIdentity(key: string): PublicIdentity | null {
  const store = readSessionStore();
  const entry = store[key];
  if (!entry?.identity) return null;
  if (Date.now() - (entry.savedAt || 0) > SESSION_TTL_MS) {
    delete store[key];
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
    return null;
  }
  return entry.identity;
}

function identityFromProfile(
  profile: PublicSellerProfile | Record<string, unknown> | null | undefined,
  lookupKey?: string
): PublicIdentity | null {
  if (!profile) return null;
  const uid = String(profile.uid || "").trim();
  const email = String((profile as { email?: string }).email || "").trim();
  const handle = publicHandleFromProfile(
    {
      username: String(profile.username || "").trim() || undefined,
      displayName:
        String(profile.displayName || profile.name || "").trim() || undefined,
    },
    ""
  );
  if (!handle) return null;
  const username = handle.startsWith("@") ? handle.slice(1) : handle;
  const avatar = String(profile.photoURL || "").trim();
  const publicSlug =
    sellerProfileSlug({
      username: String(profile.username || "").trim() || undefined,
      sellerId: uid || undefined,
      uid: uid || undefined,
      sellerEmail: email || undefined,
      email: email || undefined,
    }) ||
    username ||
    uid ||
    lookupKey ||
    "";
  return {
    username,
    handle,
    avatar,
    uid,
    publicSlug,
    email: email || undefined,
  };
}

function writeMemory(
  key: string,
  identity: PublicIdentity | null,
  profile?: Record<string, unknown> | null,
  source: "network" | "session" = "network"
): void {
  memory.set(key, {
    identity,
    fetchedAt: Date.now(),
    source,
    profile: profile === undefined ? memory.get(key)?.profile : profile,
  });
  if (!identity) return;

  if (source === "network") writeSessionIdentity(key, identity);
  const aliases = [identity.email, identity.uid, identity.publicSlug, identity.username]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .map(cacheKey);
  for (const alias of aliases) {
    if (alias === key) continue;
    memory.set(alias, {
      identity,
      fetchedAt: Date.now(),
      source,
      profile: profile === undefined ? memory.get(alias)?.profile : profile,
    });
    if (source === "network") writeSessionIdentity(alias, identity);
  }
}

function peekSilent(identifier: string): PublicIdentity | null {
  const trimmed = String(identifier || "").trim();
  if (!trimmed || trimmed === "system") return null;
  const key = cacheKey(trimmed);
  const mem = memory.get(key);
  if (isFresh(mem) && mem!.identity) return mem!.identity;
  // Negative cache (resolved missing) — still fresh
  if (isFresh(mem) && mem!.identity === null && mem!.source === "network") {
    return null;
  }
  const session = readSessionIdentity(key);
  if (session) {
    writeMemory(key, session, undefined, "session");
    return session;
  }
  return null;
}

/** True when a network-fresh entry exists (skip refetch). Session-warm still revalidates. */
function hasNetworkFresh(identifier: string): boolean {
  const entry = memory.get(cacheKey(identifier));
  return Boolean(entry && isFresh(entry) && entry.source === "network");
}

/** Sync peek — memory then session (warm return to /messages). */
export function peekPublicIdentity(identifier: string): PublicIdentity | null {
  const trimmed = String(identifier || "").trim();
  if (!trimmed || trimmed === "system") return null;
  const key = cacheKey(trimmed);
  const mem = memory.get(key);
  if (isFresh(mem) && mem!.identity) {
    metrics.cacheHits += 1;
    return mem!.identity;
  }
  const session = readSessionIdentity(key);
  if (session) {
    metrics.sessionHits += 1;
    writeMemory(key, session, undefined, "session");
    return session;
  }
  return null;
}

export function peekPublicProfileRecord(
  identifier: string
): Record<string, unknown> | null {
  const trimmed = String(identifier || "").trim();
  if (!trimmed) return null;
  const mem = memory.get(cacheKey(trimmed));
  if (isFresh(mem) && mem?.profile) return mem.profile;
  return null;
}

export function hydrateIdentityFromProfile(
  identifier: string,
  profile: PublicSellerProfile | Record<string, unknown> | null
): PublicIdentity | null {
  const trimmed = String(identifier || "").trim();
  if (!trimmed) return null;
  const identity = identityFromProfile(profile, trimmed);
  writeMemory(
    cacheKey(trimmed),
    identity,
    profile ? (profile as Record<string, unknown>) : null,
    "network"
  );
  return identity;
}

async function fetchSingleSlugProfile(
  slug: string
): Promise<Record<string, unknown> | null> {
  metrics.singleRequests += 1;
  try {
    const res = await fetch(
      `/api/public-profile?slug=${encodeURIComponent(slug)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      profile?: Record<string, unknown> | null;
    };
    return data.profile ?? null;
  } catch {
    return null;
  }
}

function pickFromBatchMap(
  map: Map<string, PublicSellerProfile>,
  id: string
): PublicSellerProfile | null {
  const direct =
    map.get(id) || map.get(id.toLowerCase()) || map.get(cacheKey(id));
  if (direct) return direct;
  for (const [k, v] of map) {
    if (cacheKey(k) === cacheKey(id)) return v;
    if (v.uid && cacheKey(v.uid) === cacheKey(id)) return v;
    if (
      typeof (v as { email?: string }).email === "string" &&
      cacheKey(String((v as { email?: string }).email)) === cacheKey(id)
    ) {
      return v;
    }
  }
  return null;
}

async function ensureInflight(
  identifier: string,
  factory: () => Promise<PublicIdentity | null>
): Promise<PublicIdentity | null> {
  const key = cacheKey(identifier);
  const existing = inflight.get(key);
  if (existing) {
    metrics.inFlightJoins += 1;
    return existing;
  }
  const promise = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * Resolve one identifier. Shares in-flight/batch with resolvePublicIdentities
 * so inbox + chatUser for the same participant issue one network path.
 */
export async function resolvePublicIdentity(
  identifier: string,
  options?: { forceRefresh?: boolean }
): Promise<PublicIdentity | null> {
  const trimmed = String(identifier || "").trim();
  if (!trimmed || trimmed === "system") return null;
  const map = await resolvePublicIdentities([trimmed], options);
  return map.get(trimmed) ?? peekSilent(trimmed);
}

/**
 * Batch-resolve identifiers. Emails/UIDs → one POST /api/public-profiles;
 * username slugs → parallel singles sharing the in-flight map.
 */
export async function resolvePublicIdentities(
  identifiers: string[],
  options?: { forceRefresh?: boolean }
): Promise<Map<string, PublicIdentity>> {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const batchBefore = metrics.batchRequests;
  const singleBefore = metrics.singleRequests;

  const unique = [
    ...new Set(
      identifiers
        .map((id) => String(id || "").trim())
        .filter((id) => id && id !== "system")
    ),
  ];
  metrics.lastUniqueCount = unique.length;
  metrics.resolveCalls += 1;

  const out = new Map<string, PublicIdentity>();
  const needFetch: string[] = [];
  const joinExisting: Promise<void>[] = [];

  for (const id of unique) {
    if (options?.forceRefresh) {
      memory.delete(cacheKey(id));
      inflight.delete(cacheKey(id));
      needFetch.push(id);
      continue;
    }
    const peeked = peekSilent(id);
    if (peeked) {
      if (memory.get(cacheKey(id))?.source === "session") {
        metrics.sessionHits += 1;
        out.set(id, peeked);
        // Fall through to revalidate
      } else if (hasNetworkFresh(id)) {
        metrics.cacheHits += 1;
        out.set(id, peeked);
        continue;
      } else {
        out.set(id, peeked);
      }
    } else if (hasNetworkFresh(id)) {
      continue;
    }

    const pending = inflight.get(cacheKey(id));
    if (pending) {
      metrics.inFlightJoins += 1;
      joinExisting.push(
        pending.then((identity) => {
          if (identity) out.set(id, identity);
        })
      );
      continue;
    }
    needFetch.push(id);
  }

  const emailsOrUids = needFetch.filter(
    (id) => isEmailLike(id) || looksLikeUid(id)
  );
  const slugs = needFetch.filter(
    (id) => !isEmailLike(id) && !looksLikeUid(id)
  );

  let batchWork: Promise<void> = Promise.resolve();
  if (emailsOrUids.length > 0) {
    batchWork = (async () => {
      metrics.batchRequests += 1;
      const map = await fetchPublicProfiles(emailsOrUids);
      for (const id of emailsOrUids) {
        const profile = pickFromBatchMap(map, id);
        const identity = hydrateIdentityFromProfile(id, profile);
        if (identity) out.set(id, identity);
      }
    })();

    for (const id of emailsOrUids) {
      const key = cacheKey(id);
      if (!inflight.has(key)) {
        inflight.set(
          key,
          batchWork
            .then(() => peekSilent(id))
            .finally(() => {
              inflight.delete(key);
            })
        );
      }
    }
  }

  const slugWork = slugs.map((id) =>
    ensureInflight(id, async () => {
      const profile = await fetchSingleSlugProfile(id);
      return hydrateIdentityFromProfile(id, profile);
    }).then((identity) => {
      if (identity) out.set(id, identity);
    })
  );

  await Promise.all([batchWork, ...slugWork, ...joinExisting]);

  metrics.lastResolveMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    started;
  metrics.lastBatchRequests = metrics.batchRequests - batchBefore;
  metrics.lastSingleRequests = metrics.singleRequests - singleBefore;
  return out;
}

export function getPublicIdentityMetrics(): PublicIdentityMetrics {
  return { ...metrics };
}

export function resetPublicIdentityMetrics(): void {
  metrics.resolveCalls = 0;
  metrics.batchRequests = 0;
  metrics.singleRequests = 0;
  metrics.cacheHits = 0;
  metrics.sessionHits = 0;
  metrics.inFlightJoins = 0;
  metrics.lastUniqueCount = 0;
  metrics.lastResolveMs = 0;
  metrics.lastBatchRequests = 0;
  metrics.lastSingleRequests = 0;
}

export function clearPublicIdentityCache(identifier?: string): void {
  if (identifier) {
    const key = cacheKey(identifier);
    memory.delete(key);
    inflight.delete(key);
    try {
      const store = readSessionStore();
      delete store[key];
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
      }
    } catch {
      /* ignore */
    }
    return;
  }
  memory.clear();
  inflight.clear();
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}
