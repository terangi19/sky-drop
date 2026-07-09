/** Phone on file from a Firestore profile document. */

export function profilePhoneNumber(profile: Record<string, unknown> | null | undefined): string {

  if (!profile) return "";

  return String(profile.phone || profile.phoneNumber || "").trim();

}



/** Profile flags that mean the user completed phone verification in-app. */

export function profilePhoneMarkedVerified(profile: Record<string, unknown> | null | undefined): boolean {

  if (!profile) return false;

  return profile.phoneVerified === true;

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



/** @deprecated Selling no longer requires wait period — users can sell immediately after email verification. */

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



/** Why a user cannot create a listing (null = OK). Email verification is required to sell. */

export function getListingBlockReason(opts: {
  /** @deprecated Not used for listing gates — kept for call-site compatibility. */
  authEmailVerified?: boolean;

  phone?: string;

  phoneVerified?: boolean;

  authPhoneNumber?: string | null;

  restricted?: boolean;

  profileExists?: boolean;

  memberSince?: Date | null;

}): string | null {

  if (opts.restricted) {

    return "Your account is temporarily restricted.";

  }

  if (opts.profileExists === false) {

    return "Please complete your profile first.";

  }

  return null;

}



export function canCreateListing(opts: Parameters<typeof getListingBlockReason>[0]): boolean {

  return getListingBlockReason(opts) === null;

}


