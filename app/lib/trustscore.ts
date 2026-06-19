interface TimestampLike {
  toMillis: () => number;
  toDate: () => Date;
}

export function calculateTrustScore(params: {
  emailVerified?: boolean;
  hasProfile: boolean;
  hasBio: boolean;
  hasPhoto: boolean;
  memberSince: Date | TimestampLike | null;
  reportsCount: number;
  salesCount: number;
}): { score: number; label: string; color: string } {
  let score = 50;

  if (params.emailVerified) score += 10;

  if (params.hasProfile && params.hasBio && params.hasPhoto) score += 10;

  if (params.memberSince) {
    let ms = 0;
    if (params.memberSince instanceof Date) {
      ms = params.memberSince.getTime();
    } else if ("toMillis" in params.memberSince) {
      ms = params.memberSince.toMillis?.() || 0;
    } else if ("getTime" in params.memberSince) {
      ms = (params.memberSince as unknown as Date).getTime();
    }
    const daysOld = (Date.now() - ms) / 86400000;
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
