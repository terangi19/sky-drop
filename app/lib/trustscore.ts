import { parseFirestoreDate } from "./date-format";

interface TimestampLike {
  toMillis: () => number;
  toDate: () => Date;
}

/**
 * Account-age input. Callers pass whatever the profile holds: a Firestore Timestamp (client SDK),
 * Admin JSON `{ _seconds }`, `{ seconds }`, a Date, an ISO string (serialized / legacy profiles,
 * e.g. "2026-05-30T12:06:41.784Z") or epoch ms.
 */
export type TrustMemberSince =
  | Date
  | TimestampLike
  | { seconds?: number; _seconds?: number }
  | string
  | number
  | null
  | undefined;

export function calculateTrustScore(params: {
  emailVerified?: boolean;
  hasProfile: boolean;
  hasBio: boolean;
  hasPhoto: boolean;
  memberSince: TrustMemberSince;
  reportsCount: number;
  salesCount: number;
}): { score: number; label: string; color: string } {
  let score = 50;

  if (params.emailVerified) score += 10;

  if (params.hasProfile && params.hasBio && params.hasPhoto) score += 10;

  // Safe for every shape: the old `"toMillis" in value` threw a TypeError on ISO strings
  // ("Cannot use 'in' operator to search for 'toMillis' in 2026-05-30T…"), and an unknown shape
  // counted as ms = 0 (a 56-year-old account). Unparseable → no account-age bonus.
  const memberDate = parseFirestoreDate(params.memberSince);
  if (memberDate) {
    const daysOld = (Date.now() - memberDate.getTime()) / 86400000;
    if (daysOld > 30) score += 10;
    if (daysOld > 90) score += 5;
  }

  if (params.salesCount > 0) score += 10;
  if (params.salesCount > 10) score += 5;

  if (params.reportsCount > 0) score -= 20;
  if (params.reportsCount > 2) score -= 30;

  score = Math.max(0, Math.min(100, score));

  let label: string;
  let color: string;
  if (score >= 80) { label = "Trusted"; color = "text-sky-400"; }
  else if (score >= 60) { label = "Good"; color = "text-sky-400"; }
  else if (score >= 40) { label = "Average"; color = "text-zinc-400"; }
  else { label = "Low"; color = "text-sky-400"; }

  return { score, label, color };
}
