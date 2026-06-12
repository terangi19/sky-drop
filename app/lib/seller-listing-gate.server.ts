import { getAdminAuth } from "./firebase-admin";
import {
  hasWaited30Days,
  memberSinceFromProfile,
  profileHasVerifiedPhone,
  sellUnlockBlockMessage,
} from "./seller-eligibility";

export type SellerProfileRecord = Record<string, unknown> | null;

export async function assertSellerCanCreateOrPublishListing(opts: {
  uid: string;
  email?: string | null;
  sellerProfile: SellerProfileRecord;
  paymentType?: string;
}): Promise<string | null> {
  const { uid, sellerProfile } = opts;

  if (!sellerProfile) {
    return "Please complete your profile before creating a listing.";
  }

  if (sellerProfile.restricted || sellerProfile.suspended) {
    return sellerProfile.suspended
      ? "Your account is suspended. Contact support."
      : "Your account is restricted. Contact support.";
  }

  let authPhone: string | undefined;
  try {
    const userRecord = await getAdminAuth().getUser(uid);
    if (!userRecord.emailVerified) {
      return "Please verify your email address before creating a listing.";
    }
    authPhone = userRecord.phoneNumber;
  } catch {
    return "Please verify your email address before creating a listing.";
  }

  if (!profileHasVerifiedPhone(sellerProfile, authPhone)) {
    return "Please add and verify your phone number in Profile → Identity verification.";
  }

  const kycApproved = sellerProfile.kycStatus === "approved";
  if (!kycApproved) {
    const memberSince = memberSinceFromProfile(sellerProfile);
    if (!hasWaited30Days(memberSince)) {
      return sellUnlockBlockMessage(memberSince);
    }
  }

  return null;
}
