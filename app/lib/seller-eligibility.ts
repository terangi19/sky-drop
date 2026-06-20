/** Phone on file from a Firestore profile document. */

export function profilePhoneNumber(profile: Record<string, unknown> | null | undefined): string {

  if (!profile) return "";

  return String(profile.phone || profile.phoneNumber || "").trim();

}



/** Profile flags that mean the user completed phone verification in-app. */

export function profilePhoneMarkedVerified(profile: Record<string, unknown> | null | undefined): boolean {

  if (!profile) return false;

  return profile.phoneVerified === true || profile.verified === true;

}



/** True when the profile has a verified phone (or Firebase Auth phone linked). Used for badge display only — not required to sell. */

export function profileHasVerifiedPhone(

  profile: Record<string, unknown> | null | undefined,

  authPhoneNumber?: string | null

): boolean {

  const authPhone = String(authPhoneNumber || "").trim();

  if (authPhone) return true;

  if (!profile) return false;

  const phone = profilePhoneNumber(profile);

  if (!phone) return false;

  return profilePhoneMarkedVerified(profile);

}



export function isKycApprovedProfile(profile: Record<string, unknown> | null | undefined): boolean {

  return profile?.kycStatus === "approved";

}



/** Parse memberSince / createdAt from a Firestore profile document. */

export function memberSinceFromProfile(profile: Record<string, unknown> | null | undefined): Date | null {

  if (!profile) return null;

  const raw = profile.memberSince ?? profile.createdAt;

  if (!raw) return null;

  if (raw instanceof Date) return raw;

  const value = raw as { toDate?: () => Date; toMillis?: () => number; seconds?: number };

  if (typeof value.toDate === "function") return value.toDate();

  if (typeof value.toMillis === "function") return new Date(value.toMillis());

  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  return null;

}



export const SELL_WAIT_DAYS = 30;



/** @deprecated Selling no longer unlocks via account age — KYC approval is required. Kept for legacy UI helpers. */

export function hasWaited30Days(memberSince: Date | null | undefined): boolean {

  if (!memberSince) return false;

  const daysSince = (Date.now() - memberSince.getTime()) / 86400000;

  return daysSince >= SELL_WAIT_DAYS;

}



export function sellUnlockDate(memberSince: Date | null | undefined): Date | null {

  if (!memberSince) return null;

  return new Date(memberSince.getTime() + SELL_WAIT_DAYS * 86400000);

}



export function sellWaitDaysElapsed(memberSince: Date | null | undefined): number {

  if (!memberSince) return 0;

  return Math.min(SELL_WAIT_DAYS, Math.floor((Date.now() - memberSince.getTime()) / 86400000));

}



export function sellWaitProgressPercent(memberSince: Date | null | undefined): number {

  if (!memberSince) return 0;

  return Math.min(100, Math.round((sellWaitDaysElapsed(memberSince) / SELL_WAIT_DAYS) * 100));

}



export function sellUnlockDaysLeft(memberSince: Date | null | undefined): number {

  if (!memberSince) return SELL_WAIT_DAYS;

  const left = Math.ceil(SELL_WAIT_DAYS - (Date.now() - memberSince.getTime()) / 86400000);

  if (left <= 0) return 0;

  return left;

}



export function kycRequiredBlockMessage(): string {

  return "Complete verification in Profile → Verification to start selling.";

}



/** @deprecated Use kycRequiredBlockMessage — selling requires KYC, not a wait period. */

export function sellUnlockBlockMessage(_memberSince?: Date | null | undefined): string {

  return kycRequiredBlockMessage();

}



export type SellerAccessState = "kyc_unlocked" | "needs_kyc";



export function getSellerAccessState(kycApproved: boolean): SellerAccessState {

  return kycApproved ? "kyc_unlocked" : "needs_kyc";

}



/** Why a user cannot create a listing (null = OK). Selling requires approved KYC only. Phone is optional (badge only). */

export function getListingBlockReason(opts: {

  /** @deprecated Not used for listing gates — kept for call-site compatibility. */
  authEmailVerified?: boolean;

  phone?: string;

  phoneVerified?: boolean;

  authPhoneNumber?: string | null;

  restricted?: boolean;

  profileExists?: boolean;

  kycApproved?: boolean;

  memberSince?: Date | null;

}): string | null {

  if (opts.restricted) {

    return "Your account is temporarily restricted.";

  }

  if (opts.profileExists === false) {

    return "Please complete your profile first.";

  }

  // KYC requirement paused - users can post without verification
  // if (!opts.kycApproved) {
  //   return kycRequiredBlockMessage();
  // }

  return null;

}



export function canCreateListing(opts: Parameters<typeof getListingBlockReason>[0]): boolean {

  return getListingBlockReason(opts) === null;

}


