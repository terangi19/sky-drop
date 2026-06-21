/**
 * Simple in-memory query result cache to reduce Firestore reads
 * Cache entries expire after 5 minutes by default
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const now = Date.now();
  if (now > entry.timestamp + entry.ttl) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.timestamp + entry.ttl) {
      cache.delete(key);
    }
  }
}

// Clear expired cache every minute
if (typeof window !== 'undefined') {
  setInterval(clearExpiredCache, 60 * 1000);
}

/**
 * Helper to generate cache keys from query parameters
 */
export function generateCacheKey(collection: string, filters: Record<string, unknown>): string {
  const sortedFilters = Object.keys(filters)
    .sort()
    .map(k => `${k}:${String(filters[k])}`)
    .join('|');
  return `${collection}:${sortedFilters}`;
}
