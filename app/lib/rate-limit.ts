const store = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();

  // Fast in-memory check
  const memEntry = store.get(key);
  if (memEntry && now > memEntry.resetAt) {
    store.delete(key);
  } else if (memEntry && memEntry.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  // Firestore-backed check (persistent across instances)
  try {
    const { getAdminDb, isAdminInitialized } = await import("./firebase-admin");
    if (isAdminInitialized()) {
      const db = getAdminDb();
      const fsKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const ref = db.collection("rateLimits").doc(fsKey);
      const snap = await ref.get();
      const data = snap.data();
      let count = 1;
      let resetAt = now + windowMs;

      if (data && now < data.resetAt?.toMillis?.()) {
        count = (data.count || 0) + 1;
        resetAt = data.resetAt.toMillis();
        if (count > maxRequests) {
          store.set(key, { count, resetAt });
          return { allowed: false, remaining: 0 };
        }
      }

      await ref.set({ count, resetAt: new Date(resetAt), key }, { merge: true });
      store.set(key, { count, resetAt });
      return { allowed: true, remaining: maxRequests - count };
    }
  } catch {}

  // Fall back to in-memory only
  if (!memEntry || now > memEntry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  memEntry.count++;
  return { allowed: true, remaining: maxRequests - memEntry.count };
}

// Clean up stale in-memory entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
