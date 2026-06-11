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

/** True when the seller can list (phone verified on profile or linked in Firebase Auth). */
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

/** Check if a non-KYC seller has waited 30 days since joining. */
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

export function sellUnlockBlockMessage(memberSince: Date | null | undefined): string {
  const daysLeft = sellUnlockDaysLeft(memberSince);
  return `You can browse and buy now. To start selling, complete identity verification. Otherwise, selling unlocks in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;
}

export type SellerAccessState = "kyc_unlocked" | "wait_complete" | "waiting" | "no_join_date";

export function getSellerAccessState(
  kycApproved: boolean,
  memberSince: Date | null | undefined
): SellerAccessState {
  if (kycApproved) return "kyc_unlocked";
  if (!memberSince) return "no_join_date";
  if (hasWaited30Days(memberSince)) return "wait_complete";
  return "waiting";
}

/** Why a user cannot create a listing (null = OK). */
export function getListingBlockReason(opts: {
  authEmailVerified: boolean;
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
  if (!opts.authEmailVerified) {
    return "Verify your email — check your inbox (and spam), then use \"Refresh status\" on Profile.";
  }

  const profileForPhone =
    opts.phone !== undefined || opts.phoneVerified !== undefined
      ? { phone: opts.phone, phoneVerified: opts.phoneVerified, verified: opts.phoneVerified }
      : null;

  if (!profileHasVerifiedPhone(profileForPhone, opts.authPhoneNumber)) {
    return "Add and verify your phone number in Identity verification on Profile.";
  }

  if (!opts.kycApproved) {
    if (!opts.memberSince || !hasWaited30Days(opts.memberSince)) {
      return sellUnlockBlockMessage(opts.memberSince);
    }
  }

  return null;
}

export function canCreateListing(opts: Parameters<typeof getListingBlockReason>[0]): boolean {
  return getListingBlockReason(opts) === null;
}
