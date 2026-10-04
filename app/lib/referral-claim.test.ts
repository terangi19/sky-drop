import { describe, expect, it } from "vitest";
import {
  REFERRAL_MAX_ACCOUNT_AGE_MS,
  isFreshAccount,
  isSelfReferral,
  pickOldestProfile,
  referralEventId,
} from "./referral-claim";

describe("pickOldestProfile", () => {
  it("picks the oldest createdAt among duplicate-code holders", () => {
    const picked = pickOldestProfile([
      { id: "newer", createdAt: 2_000 },
      { id: "oldest", createdAt: 1_000 },
      { id: "middle", createdAt: 1_500 },
    ]);
    expect(picked?.id).toBe("oldest");
  });

  it("falls back to memberSince when createdAt is missing", () => {
    const picked = pickOldestProfile([
      { id: "no-dates" },
      { id: "member", memberSince: 500 },
      { id: "created", createdAt: 5_000 },
    ]);
    expect(picked?.id).toBe("member");
  });

  it("treats a missing timestamp as newest", () => {
    const picked = pickOldestProfile([
      { id: "undated" },
      { id: "dated", createdAt: new Date("2020-01-01T00:00:00.000Z") },
    ]);
    expect(picked?.id).toBe("dated");
  });

  it("reads Firestore Timestamp-like values", () => {
    const picked = pickOldestProfile([
      { id: "millis", createdAt: 3_000 },
      { id: "timestamp", createdAt: { toMillis: () => 100 } },
      { id: "seconds", createdAt: { seconds: 2, nanoseconds: 0 } },
    ]);
    expect(picked?.id).toBe("timestamp");
  });

  it("tie-breaks equal timestamps by document id ascending", () => {
    const picked = pickOldestProfile([
      { id: "b", createdAt: 100 },
      { id: "a", createdAt: 100 },
      { id: "c", createdAt: { seconds: 0, nanoseconds: 100_000_000 } },
    ]);
    expect(picked?.id).toBe("a");
  });

  it("returns null for an empty list", () => {
    expect(pickOldestProfile([])).toBeNull();
  });
});

describe("isFreshAccount", () => {
  const now = 1_700_000_000_000;
  const max = REFERRAL_MAX_ACCOUNT_AGE_MS;

  it("accepts an account created at the window boundary", () => {
    expect(isFreshAccount(now, now, max)).toBe(true);
    expect(isFreshAccount(now - max, now, max)).toBe(true);
  });

  it("rejects an account one millisecond older than the window", () => {
    expect(isFreshAccount(now - max - 1, now, max)).toBe(false);
  });

  it("rejects a future creation time and non-finite inputs", () => {
    expect(isFreshAccount(now + 1, now, max)).toBe(false);
    expect(isFreshAccount(Number.NaN, now, max)).toBe(false);
  });
});

describe("isSelfReferral", () => {
  it("matches on uid even when emails differ", () => {
    expect(
      isSelfReferral({
        referrerUid: "uid-1",
        refereeUid: "uid-1",
        referrerEmail: "a@example.test",
        refereeEmail: "b@example.test",
      })
    ).toBe(true);
  });

  it("matches emails case-insensitively", () => {
    expect(
      isSelfReferral({
        referrerUid: "uid-1",
        refereeUid: "uid-2",
        referrerEmail: "Seller@Example.test",
        refereeEmail: " seller@example.test ",
      })
    ).toBe(true);
  });

  it("does not treat empty emails or empty uids as a match", () => {
    expect(
      isSelfReferral({
        referrerUid: "",
        refereeUid: "",
        referrerEmail: "",
        refereeEmail: "",
      })
    ).toBe(false);
    expect(
      isSelfReferral({
        referrerUid: "uid-1",
        refereeUid: "uid-2",
        referrerEmail: "a@example.test",
        refereeEmail: "b@example.test",
      })
    ).toBe(false);
  });
});

describe("referralEventId", () => {
  it("is the deterministic signup document id", () => {
    expect(referralEventId("abc")).toBe("signup_abc");
  });
});
