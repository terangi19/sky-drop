import { describe, it, expect } from "vitest";
import { calculateTrustScore } from "../trustscore";

describe("calculateTrustScore", () => {
  const baseParams = {
    emailVerified: false,
    hasProfile: false,
    hasBio: false,
    hasPhoto: false,
    memberSince: null,
    reportsCount: 0,
    salesCount: 0,
  };

  it("returns base score of 50 with no bonuses", () => {
    const result = calculateTrustScore(baseParams);
    expect(result.score).toBe(50);
    expect(result.label).toBe("Average");
  });

  it("adds 10 for email verified", () => {
    const result = calculateTrustScore({ ...baseParams, emailVerified: true });
    expect(result.score).toBe(60);
    expect(result.label).toBe("Good");
  });

  it("adds 10 for complete profile (profile + bio + photo)", () => {
    const result = calculateTrustScore({
      ...baseParams,
      hasProfile: true,
      hasBio: true,
      hasPhoto: true,
    });
    expect(result.score).toBe(60);
  });

  it("does not add profile bonus for partial profile", () => {
    const result = calculateTrustScore({
      ...baseParams,
      hasProfile: true,
      hasBio: true,
      hasPhoto: false,
    });
    expect(result.score).toBe(50);
  });

  it("adds 10 for member > 30 days", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86400000);
    const result = calculateTrustScore({
      ...baseParams,
      memberSince: thirtyOneDaysAgo,
    });
    expect(result.score).toBe(60);
  });

  it("adds 15 for member > 90 days", () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 86400000);
    const result = calculateTrustScore({
      ...baseParams,
      memberSince: ninetyOneDaysAgo,
    });
    expect(result.score).toBe(65);
  });

  it("adds 10 for salesCount > 0", () => {
    const result = calculateTrustScore({ ...baseParams, salesCount: 1 });
    expect(result.score).toBe(60);
  });

  it("adds 15 for salesCount > 10", () => {
    const result = calculateTrustScore({ ...baseParams, salesCount: 11 });
    expect(result.score).toBe(65);
  });

  it("subtracts 20 for reportsCount > 0", () => {
    const result = calculateTrustScore({ ...baseParams, reportsCount: 1 });
    expect(result.score).toBe(30);
    expect(result.label).toBe("Low");
  });

  it("subtracts 50 for reportsCount > 2", () => {
    const result = calculateTrustScore({ ...baseParams, reportsCount: 3 });
    expect(result.score).toBe(0);
    expect(result.label).toBe("Low");
  });

  it("clamps score to max 100", () => {
    const longAgo = new Date(Date.now() - 365 * 86400000);
    const result = calculateTrustScore({
      emailVerified: true,
      hasProfile: true,
      hasBio: true,
      hasPhoto: true,
      memberSince: longAgo,
      reportsCount: 0,
      salesCount: 50,
    });
    expect(result.score).toBe(100);
    expect(result.label).toBe("Trusted");
  });

  it("clamps score to min 0", () => {
    const result = calculateTrustScore({ ...baseParams, reportsCount: 10 });
    expect(result.score).toBe(0);
  });

  it("returns correct color for each label", () => {
    expect(calculateTrustScore({ ...baseParams, emailVerified: true, hasProfile: true, hasBio: true, hasPhoto: true, salesCount: 11, memberSince: new Date(Date.now() - 365 * 86400000) }).color).toBe("text-emerald-400");
    expect(calculateTrustScore({ ...baseParams, emailVerified: true }).color).toBe("text-sky-400");
    expect(calculateTrustScore(baseParams).color).toBe("text-zinc-400");
    expect(calculateTrustScore({ ...baseParams, reportsCount: 2 }).color).toBe("text-orange-400");
  });

  it("supports TimestampLike objects", () => {
    const ts = {
      toMillis: () => Date.now() - 91 * 86400000,
      toDate: () => new Date(Date.now() - 91 * 86400000),
    };
    const result = calculateTrustScore({ ...baseParams, memberSince: ts });
    expect(result.score).toBe(65);
  });
});
