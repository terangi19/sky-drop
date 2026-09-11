import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pickPublicProfileFields } from "../app/lib/public-profile-fields";

const {
  isUpstashEnabledMock,
  rateLimitUpstashMock,
  collectionMock,
  firestoreGet,
  firestoreSet,
} = vi.hoisted(() => {
  const firestoreGet = vi.fn();
  const firestoreSet = vi.fn();
  const collectionMock = vi.fn((_name: string) => ({
    doc: vi.fn(() => ({
      get: firestoreGet,
      set: firestoreSet,
    })),
    add: vi.fn().mockResolvedValue({ id: "evt" }),
  }));
  return {
    isUpstashEnabledMock: vi.fn(() => false),
    rateLimitUpstashMock: vi.fn(),
    collectionMock,
    firestoreGet,
    firestoreSet,
  };
});

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  getAdminDb: () => ({ collection: collectionMock }),
}));

vi.mock("../app/lib/rate-limit-upstash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/rate-limit-upstash")>();
  return {
    ...actual,
    isUpstashEnabled: isUpstashEnabledMock,
    rateLimitUpstash: rateLimitUpstashMock,
  };
});

function rateLimitsCollectionCalls() {
  return collectionMock.mock.calls.filter(([name]) => name === "rateLimits");
}

async function expectInMemoryLimitEnforced(
  rateLimit: (key: string, max: number, windowMs: number) => Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
  }>,
  keyPrefix: string
) {
  const key = `${keyPrefix}:${Date.now()}:${Math.random()}`;

  await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
    allowed: true,
    remaining: 2,
    limit: 3,
  });
  await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
    allowed: true,
    remaining: 1,
    limit: 3,
  });
  await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
    allowed: true,
    remaining: 0,
    limit: 3,
  });
  await expect(rateLimit(key, 3, 60_000)).resolves.toEqual({
    allowed: false,
    remaining: 0,
    limit: 3,
  });
}

describe("Rate-limit launch gate", () => {
  beforeAll(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "not-a-real-sa");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  });

  beforeEach(() => {
    isUpstashEnabledMock.mockReturnValue(false);
    rateLimitUpstashMock.mockReset();
    collectionMock.mockClear();
    firestoreGet.mockReset();
    firestoreSet.mockReset();
    firestoreGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    });
    firestoreSet.mockResolvedValue(undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("allows requests through the threshold and blocks the next request", async () => {
    const { rateLimit } = await import("../app/lib/rate-limit");
    const key = `launch-gate:${Date.now()}:${Math.random()}`;

    await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
      limit: 3,
    });
    await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      limit: 3,
    });
    await expect(rateLimit(key, 3, 60_000)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      limit: 3,
    });
    await expect(rateLimit(key, 3, 60_000)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      limit: 3,
    });
  });

  it("keeps independent identities in separate buckets", async () => {
    const { rateLimit } = await import("../app/lib/rate-limit");
    const suffix = `${Date.now()}:${Math.random()}`;

    await expect(rateLimit(`user-a:${suffix}`, 1, 60_000)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(rateLimit(`user-a:${suffix}`, 1, 60_000)).resolves.toMatchObject({
      allowed: false,
    });
    await expect(rateLimit(`user-b:${suffix}`, 1, 60_000)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("does not read or write Firestore rateLimits when Upstash is unset", async () => {
    const { rateLimit } = await import("../app/lib/rate-limit");
    await expectInMemoryLimitEnforced(rateLimit, "unset-no-fs");

    expect(rateLimitsCollectionCalls()).toEqual([]);
    expect(firestoreGet).not.toHaveBeenCalled();
    expect(firestoreSet).not.toHaveBeenCalled();
    expect(rateLimitUpstashMock).not.toHaveBeenCalled();
  });
});

describe("Rate-limit Upstash degraded fallback", () => {
  beforeEach(() => {
    isUpstashEnabledMock.mockReturnValue(true);
    rateLimitUpstashMock.mockResolvedValue({
      allowed: true,
      remaining: 99,
      limit: 99,
      degraded: true,
    });
    collectionMock.mockClear();
    firestoreGet.mockReset();
    firestoreSet.mockReset();
    firestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({ count: 1, resetAt: { toMillis: () => Date.now() + 60_000 } }),
    });
    firestoreSet.mockResolvedValue(undefined);
  });

  it("enforces in-memory limits and skips Firestore when Upstash is degraded", async () => {
    const { rateLimit } = await import("../app/lib/rate-limit");
    await expectInMemoryLimitEnforced(rateLimit, "degraded-no-fs");

    expect(rateLimitUpstashMock).toHaveBeenCalled();
    expect(rateLimitsCollectionCalls()).toEqual([]);
    expect(firestoreGet).not.toHaveBeenCalled();
    expect(firestoreSet).not.toHaveBeenCalled();
  });
});

describe("Rate-limit source contract", () => {
  it("does not import firebase-admin or write the rateLimits collection", async () => {
    const src = await readFile(
      path.resolve(__dirname, "../app/lib/rate-limit.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/firebase-admin/);
    expect(src).not.toMatch(/collection\(\s*["']rateLimits["']\s*\)/);
  });
});

describe("Public profile allowlist launch gate", () => {
  it("returns intended public fields and strips private account data", () => {
    const result = pickPublicProfileFields("profile-user-a", {
      username: "user-a",
      displayName: "User A",
      bio: "Public bio",
      trustedSeller: true,
      email: "private@example.test",
      phone: "+6412345678",
      address: "Private address",
      bankAccount: "00-0000-0000000-00",
      riskFlag: true,
      kycDocumentUrl: "https://private.example.test/id",
    });

    expect(result).toEqual({
      uid: "profile-user-a",
      username: "user-a",
      displayName: "User A",
      bio: "Public bio",
      trustedSeller: true,
    });
  });
});
