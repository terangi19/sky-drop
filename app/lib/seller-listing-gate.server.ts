import { kycRequiredBlockMessage } from "./seller-eligibility";

export type SellerProfileRecord = Record<string, unknown> | null;

export async function assertSellerCanCreateOrPublishListing(opts: {
  uid: string;
  email?: string | null;
  sellerProfile: SellerProfileRecord;
  paymentType?: string;
}): Promise<string | null> {
  const { sellerProfile } = opts;

  if (!sellerProfile) {
    return "Please complete your profile before creating a listing.";
  }

  if (sellerProfile.restricted || sellerProfile.suspended) {
    return sellerProfile.suspended
      ? "Your account is suspended. Contact support."
      : "Your account is restricted. Contact support.";
  }

  const kycApproved = sellerProfile.kycStatus === "approved";
  if (!kycApproved) {
    return kycRequiredBlockMessage();
  }

  return null;
}
