import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pickPublicProfileFields } from "../app/lib/public-profile-fields";

describe("Rate-limit launch gate", () => {
  beforeAll(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT", "");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
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
