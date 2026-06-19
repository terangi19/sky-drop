export const REPORT_REASONS = [
  "Scam/fraud",
  "Fake item",
  "Suspicious price",
  "Stolen images",
  "Harassment/abuse",
  "Seller bidding on own item",
  "Other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_SET = new Set<string>(REPORT_REASONS);
