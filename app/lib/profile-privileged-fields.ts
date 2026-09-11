/** Profile fields that only Admin SDK / verification APIs may write. */

export const CLIENT_FORBIDDEN_PROFILE_FIELDS = [
  "phoneVerified",
  "phoneVerifiedAt",
  "emailVerified",
  "verified",
  "kycApproved",
  "kycStatus",
  "kycReviewedAt",
  "kycReviewedBy",
  "kycBannedReason",
  "trustedSeller",
  "topTrader",
  "profileBadge",
  "fastReply",
  "riskFlag",
  "badges",
  "xp",
  "level",
  "salesCount",
  "averageRating",
  "reviewCount",
  "followers",
  "following",
  "totalSales",
  "stripeAccountId",
  "stripeCustomerId",
  "restricted",
  "bannedAt",
  "banReason",
] as const;

export function stripClientForbiddenProfileFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...data };
  for (const key of CLIENT_FORBIDDEN_PROFILE_FIELDS) {
    delete next[key];
  }
  return next;
}
