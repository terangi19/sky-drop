export type SellerVerificationProfile = {
  phoneVerified?: boolean;
  emailVerified?: boolean;
  verified?: boolean;
};

export function profileEmailVerified(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.emailVerified === true || profile?.verified === true;
}

export function profilePhoneVerified(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.phoneVerified === true;
}

/** Public "Verified" badge — requires email verification only. */
export function isFullyVerifiedSeller(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  if (!profile) return false;
  return profileEmailVerified(profile);
}

/** Legacy `verified` field on profiles — kept in sync with email verification. */
export function sellerVerifiedFlag(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return isFullyVerifiedSeller(profile);
}

export function verifiedFlagAfterUpdate(
  existing: SellerVerificationProfile | null | undefined,
  patch: Partial<SellerVerificationProfile>
): boolean {
  return isFullyVerifiedSeller({ ...existing, ...patch });
}
