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

/** Shared KYC upload copy — licence or passport + selfie holding the ID. */
export const KYC_UPLOAD_INTRO =
  "Upload your driver's licence or passport and a selfie holding it. That's all we need for ID verification.";

export const KYC_UPLOAD_INTRO_SELLER_BENEFITS =
  "Upload your driver's licence or passport and a selfie holding it — that's all we need. Once approved you can list immediately, unlock higher price caps, and get an \"ID Verified\" badge.";

export const KYC_ID_DOCUMENT_LABEL = "Driver's licence or passport";

export const KYC_SELFIE_LABEL = "Selfie holding your ID";
