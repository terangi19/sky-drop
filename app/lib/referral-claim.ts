/** Pure referral-claim helpers. No Firestore or Auth I/O. */

export const REFERRAL_MAX_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

export type ReferralProfileCandidate = {
  id: string;
  createdAt?: unknown;
  memberSince?: unknown;
};

type TimestampLike = {
  toMillis?: () => number;
  seconds?: number;
  _seconds?: number;
  nanoseconds?: number;
};

function finiteMillis(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** Firestore Timestamp, Date, ISO string, or epoch millis. Missing/invalid → null. */
export function timestampToMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return finiteMillis(value);
  if (value instanceof Date) return finiteMillis(value.getTime());
  if (typeof value === "string") return finiteMillis(Date.parse(value));
  if (typeof value === "object") {
    const obj = value as TimestampLike;
    if (typeof obj.toMillis === "function") {
      return finiteMillis(obj.toMillis());
    }
    const seconds =
      typeof obj.seconds === "number"
        ? obj.seconds
        : typeof obj._seconds === "number"
          ? obj._seconds
          : null;
    if (seconds != null && Number.isFinite(seconds)) {
      const nanos = typeof obj.nanoseconds === "number" ? obj.nanoseconds : 0;
      return finiteMillis(seconds * 1000 + Math.floor(nanos / 1e6));
    }
  }
  return null;
}

/** Account age key: createdAt, else memberSince. Missing both sorts as newest. */
function profileSortMillis(doc: ReferralProfileCandidate): number {
  const created = timestampToMillis(doc.createdAt);
  if (created != null) return created;
  const memberSince = timestampToMillis(doc.memberSince);
  if (memberSince != null) return memberSince;
  return Number.POSITIVE_INFINITY;
}

/**
 * Oldest createdAt/memberSince wins. A missing timestamp sorts as newest.
 * Equal timestamps tie-break by document id ascending.
 */
export function pickOldestProfile<T extends ReferralProfileCandidate>(docs: T[]): T | null {
  if (docs.length === 0) return null;
  const ranked = [...docs].sort((a, b) => {
    const aMs = profileSortMillis(a);
    const bMs = profileSortMillis(b);
    if (aMs !== bMs) return aMs - bMs;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return ranked[0] ?? null;
}

/** True when the account was created within [0, maxAgeMs] of nowMs. */
export function isFreshAccount(creationTimeMs: number, nowMs: number, maxAgeMs: number): boolean {
  if (!Number.isFinite(creationTimeMs) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs)) {
    return false;
  }
  if (maxAgeMs < 0) return false;
  const age = nowMs - creationTimeMs;
  return age >= 0 && age <= maxAgeMs;
}

export function isSelfReferral(input: {
  referrerUid: string;
  refereeUid: string;
  referrerEmail: string;
  refereeEmail: string;
}): boolean {
  const referrerUid = input.referrerUid.trim();
  const refereeUid = input.refereeUid.trim();
  if (referrerUid && refereeUid && referrerUid === refereeUid) return true;

  const referrerEmail = input.referrerEmail.trim().toLowerCase();
  const refereeEmail = input.refereeEmail.trim().toLowerCase();
  if (referrerEmail && refereeEmail && referrerEmail === refereeEmail) return true;
  return false;
}

export function referralEventId(refereeUid: string): string {
  return `signup_${refereeUid}`;
}
