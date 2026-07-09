export type SellerVerificationProfile = {
  phoneVerified?: boolean;
  emailVerified?: boolean;
  verified?: boolean;
  kycStatus?: string;
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

export function profileIdVerified(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  return profile?.kycStatus === "approved";
}

/** Public "Verified" badge — requires email, phone, and ID verification. */
export function isFullyVerifiedSeller(
  profile: SellerVerificationProfile | null | undefined
): boolean {
  if (!profile) return false;
  return (
    profileEmailVerified(profile) &&
    profilePhoneVerified(profile) &&
    profileIdVerified(profile)
  );
}

/** Legacy `verified` field on profiles — true only when all three checks pass. */
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
