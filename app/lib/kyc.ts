export type KycStatus = "none" | "pending" | "approved" | "rejected" | "banned_fake";

export interface KycSubmission {
  uid: string;
  email: string;
  username: string;
  status: KycStatus;
  idImageUrl: string;
  selfieImageUrl: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectReason?: string;
}

export const KYC_STORAGE_PATH = "kyc";

export const KYC_TRUST_BONUS = 20;

/** Shared KYC upload copy — front and back of licence or passport. */
export const KYC_UPLOAD_INTRO =
  "Upload a photo of the front and back of your driver's licence or passport.";

export const KYC_UPLOAD_INTRO_SELLER_BENEFITS =
  "Upload photos of your driver's licence or passport (front and back). Once approved you can list immediately and get an \"ID Verified\" badge. Phone verification is optional and adds a verified seller badge.";

export const KYC_PHOTO_LABEL = "Photo holding your ID";
