export type SellerVerificationProfile = {
  kycStatus?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  verified?: boolean;
};

export function profileEmailVerified(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.emailVerified === true;
}

export function profilePhoneVerified(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.phoneVerified === true;
}

export function profileKycApproved(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.kycStatus === "approved";
}

/** Public "Verified" badge — requires email, phone, and ID approval. */
export function isFullyVerifiedSeller(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  if (!profile) return false;
  return (
    profileKycApproved(profile) &&
    profilePhoneVerified(profile) &&
    profileEmailVerified(profile)
  );
}

/** Legacy `verified` field on profiles — kept in sync with full verification. */
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
