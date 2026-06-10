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

/** Shared KYC upload copy — one photo holding licence or passport. */
export const KYC_UPLOAD_INTRO =
  "Upload one photo of you holding your driver's licence or passport next to your face. That's all we need for ID verification.";

export const KYC_UPLOAD_INTRO_SELLER_BENEFITS =
  "Upload one photo of you holding your driver's licence or passport — that's all we need. Once approved you can list immediately, unlock higher price caps, and get an \"ID Verified\" badge.";

export const KYC_PHOTO_LABEL = "Photo holding your ID";
