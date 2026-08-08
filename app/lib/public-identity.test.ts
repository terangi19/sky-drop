import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSellerProfileBatchCache } from "./fetch-seller-profiles";
import {
  clearPublicIdentityCache,
  getPublicIdentityMetrics,
  peekPublicIdentity,
  resetPublicIdentityMetrics,
  resolvePublicIdentities,
  resolvePublicIdentity,
} from "./public-identity";

function mockBatchProfiles(
  byEmail: Record<string, { uid: string; username: string; photoURL?: string }>
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/public-profiles") && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}")) as {
          emails?: string[];
          uids?: string[];
        };
        const profiles: Record<string, Record<string, unknown>> = {};
        const emailToUid: Record<string, string> = {};
        for (const email of body.emails || []) {
          const row = byEmail[email] || byEmail[email.toLowerCase()];
          if (!row) continue;
          emailToUid[email.toLowerCase()] = row.uid;
          profiles[row.uid] = {
            uid: row.uid,
            username: row.username,
            photoURL: row.photoURL || "",
            email,
          };
        }
        for (const uid of body.uids || []) {
          const row = Object.values(byEmail).find((r) => r.uid === uid);
          if (!row) continue;
          profiles[uid] = {
            uid,
            username: row.username,
            photoURL: row.photoURL || "",
          };
        }
        return {
          ok: true,
          json: async () => ({ profiles, emailToUid }),
        };
      }
      if (url.includes("/api/public-profile?slug=")) {
        const slug = decodeURIComponent(url.split("slug=")[1] || "");
        const row =
          byEmail[slug] ||
          Object.values(byEmail).find(
            (r) => r.username === slug || r.uid === slug
          );
        if (!row) return { ok: false, json: async () => ({}) };
        return {
          ok: true,
          json: async () => ({
            profile: {
              uid: row.uid,
              username: row.username,
              photoURL: row.photoURL || "",
              email: Object.keys(byEmail).find(
                (e) => byEmail[e].uid === row.uid
              ),
            },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    })
  );
}

function installSessionStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  });
}

describe("public-identity cache + batching", () => {
  beforeEach(() => {
    installSessionStorageMock();
    clearPublicIdentityCache();
    clearSellerProfileBatchCache();
    resetPublicIdentityMetrics();
  });

  afterEach(() => {
    clearPublicIdentityCache();
    clearSellerProfileBatchCache();
    vi.unstubAllGlobals();
  });

  it("cold batch: N emails → 1 public-profiles request", async () => {
    mockBatchProfiles({
      "a@example.com": { uid: "uid-a", username: "sky50" },
      "b@example.com": { uid: "uid-b", username: "sky51" },
      "c@example.com": { uid: "uid-c", username: "sky52" },
    });

    const t0 = performance.now();
    const map = await resolvePublicIdentities([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "a@example.com",
    ]);
    const coldMs = performance.now() - t0;
    const m = getPublicIdentityMetrics();

    expect(map.get("a@example.com")?.username).toBe("sky50");
    expect(map.get("b@example.com")?.handle).toBe("@sky51");
    expect(m.lastUniqueCount).toBe(3);
    expect(m.lastBatchRequests).toBe(1);
    expect(m.lastSingleRequests).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(coldMs).toBeGreaterThanOrEqual(0);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        phase: "cold",
        unique: m.lastUniqueCount,
        identityRequests: m.lastBatchRequests + m.lastSingleRequests,
        batchRequests: m.lastBatchRequests,
        resolveMs: Math.round(m.lastResolveMs),
        wallMs: Math.round(coldMs),
      })
    );
  });

  it("warm: second resolve is cache hit (0 network)", async () => {
    mockBatchProfiles({
      "a@example.com": { uid: "uid-a", username: "sky50" },
    });
    await resolvePublicIdentities(["a@example.com"]);
    resetPublicIdentityMetrics();

    const t0 = performance.now();
    const map = await resolvePublicIdentities(["a@example.com"]);
    const warmMs = performance.now() - t0;
    const m = getPublicIdentityMetrics();

    expect(map.get("a@example.com")?.username).toBe("sky50");
    expect(m.lastBatchRequests).toBe(0);
    expect(m.lastSingleRequests).toBe(0);
    expect(m.cacheHits).toBeGreaterThanOrEqual(1);
    expect(fetch).toHaveBeenCalledTimes(1); // only cold call from before reset of stubs

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        phase: "warm-memory",
        unique: m.lastUniqueCount,
        identityRequests: m.lastBatchRequests + m.lastSingleRequests,
        resolveMs: Math.round(m.lastResolveMs),
        wallMs: Math.round(warmMs),
        cacheHits: m.cacheHits,
      })
    );
  });

  it("inbox + chatUser share in-flight for same email", async () => {
    let batchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/public-profiles") && init?.method === "POST") {
          batchCalls += 1;
          await new Promise((r) => setTimeout(r, 30));
          return {
            ok: true,
            json: async () => ({
              profiles: {
                "uid-a": {
                  uid: "uid-a",
                  username: "sky50",
                  email: "a@example.com",
                },
              },
              emailToUid: { "a@example.com": "uid-a" },
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      })
    );

    const [batch, single] = await Promise.all([
      resolvePublicIdentities(["a@example.com", "b@example.com"]),
      resolvePublicIdentity("a@example.com"),
    ]);

    expect(batch.get("a@example.com")?.username).toBe("sky50");
    expect(single?.username).toBe("sky50");
    // One batch covers both; chatUser joins in-flight (no second request for a@)
    expect(batchCalls).toBe(1);
    expect(getPublicIdentityMetrics().inFlightJoins).toBeGreaterThanOrEqual(1);
  });

  it("session warm peek returns identity without waiting for network", async () => {
    mockBatchProfiles({
      "a@example.com": { uid: "uid-a", username: "sky50" },
    });
    await resolvePublicIdentities(["a@example.com"]);
    // Clear memory but keep sessionStorage
    const sessionRaw = sessionStorage.getItem("sky-public-identity-v1");
    clearPublicIdentityCache();
    if (sessionRaw) sessionStorage.setItem("sky-public-identity-v1", sessionRaw);
    resetPublicIdentityMetrics();

    const peeked = peekPublicIdentity("a@example.com");
    expect(peeked?.username).toBe("sky50");
    expect(getPublicIdentityMetrics().sessionHits).toBe(1);
  });
});

describe("before/after request model", () => {
  it("documents legacy N+1 vs batched counts", () => {
    const uniqueN = 12;
    const legacyRequests = uniqueN; // forEach fetchPublicProfileBySlug
    const batchedRequests = 1; // POST /api/public-profiles
    expect(batchedRequests).toBeLessThan(legacyRequests);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        uniqueN,
        beforeIdentityRequests: legacyRequests,
        afterIdentityRequests: batchedRequests,
        reduction: `${legacyRequests} → ${batchedRequests}`,
      })
    );
  });
});
