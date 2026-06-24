export interface RateLimitRule {
  name: string;
  max: number;
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // Auth & signup
  signup: { name: "signup", max: 3, windowMs: 60_000 },
  login: { name: "login", max: 5, windowMs: 60_000 },
  passwordReset: { name: "password-reset", max: 2, windowMs: 60_000 },
  authSession: { name: "auth-session", max: 10, windowMs: 60_000 },
  checkEmailTemp: { name: "check-email-temp", max: 15, windowMs: 60_000 },
  checkPhone: { name: "check-phone", max: 15, windowMs: 60_000 },
  checkPhoneBan: { name: "check-phone-ban", max: 15, windowMs: 60_000 },

  // Listings
  createListing: { name: "create-listing", max: 5, windowMs: 60_000 },
  updateListing: { name: "update-listing", max: 10, windowMs: 60_000 },
  deleteListing: { name: "delete-listing", max: 10, windowMs: 60_000 },
  renewListing: { name: "renew-listing", max: 10, windowMs: 60_000 },
  listingView: { name: "listing-view", max: 8, windowMs: 60_000 },
  listingWatchlistCount: { name: "listing-watchlist-count", max: 30, windowMs: 60_000 },

  // Messaging
  sendMessage: { name: "send-message", max: 20, windowMs: 60_000 },
  markMessagesRead: { name: "mark-messages-read", max: 40, windowMs: 60_000 },

  // Offers
  acceptOffer: { name: "accept-offer", max: 10, windowMs: 60_000 },
  payOffer: { name: "pay-offer", max: 10, windowMs: 60_000 },

  // Purchases
  createPaymentIntent: { name: "create-payment-intent", max: 10, windowMs: 60_000 },
  createPurchase: { name: "create-purchase", max: 10, windowMs: 60_000 },
  arrangePurchase: { name: "arrange-purchase", max: 15, windowMs: 60_000 },
  confirmArrangeSale: { name: "confirm-arrange-sale", max: 15, windowMs: 60_000 },
  checkoutMessage: { name: "checkout-message", max: 15, windowMs: 60_000 },
  updatePurchaseStatus: { name: "update-purchase-status", max: 30, windowMs: 60_000 },
  updatePurchaseShipping: { name: "update-purchase-shipping", max: 20, windowMs: 60_000 },

  // Payments
  releasePayment: { name: "release-payment", max: 10, windowMs: 60_000 },
  stripeConnect: { name: "stripe-connect", max: 10, windowMs: 60_000 },
  createBumpIntent: { name: "create-bump-intent", max: 5, windowMs: 60_000 },
  sponsorDrop: { name: "sponsor-drop", max: 3, windowMs: 60_000 },

  // Disputes
  openDispute: { name: "open-dispute", max: 5, windowMs: 60_000 },
  disputeAction: { name: "dispute-action", max: 5, windowMs: 60_000 },

  // Reports & reviews
  submitReport: { name: "submit-report", max: 10, windowMs: 60_000 },
  submitReview: { name: "submit-review", max: 10, windowMs: 60_000 },

  // Profile & KYC
  saveProfile: { name: "save-profile", max: 10, windowMs: 60_000 },
  submitKyc: { name: "submit-kyc", max: 3, windowMs: 60_000 },
  claimPhone: { name: "claim-phone", max: 10, windowMs: 60_000 },
  selfApproveKyc: { name: "self-approve-kyc", max: 3, windowMs: 60_000 },

  // Email & notifications
  sendEmail: { name: "send-email", max: 15, windowMs: 60_000 },
  sendPush: { name: "send-push", max: 15, windowMs: 60_000 },
  sendNotifEmail: { name: "send-notif-email", max: 30, windowMs: 60_000 },
  createNotification: { name: "create-notification", max: 30, windowMs: 60_000 },
  createTradePost: { name: "create-trade-post", max: 10, windowMs: 60_000 },
  listingQuestion: { name: "listing-question", max: 20, windowMs: 60_000 },
  submitJobApplication: { name: "submit-job-application", max: 10, windowMs: 60_000 },
  updateJobApplication: { name: "update-job-application", max: 20, windowMs: 60_000 },
  confirmSponsorDrop: { name: "confirm-sponsor-drop", max: 5, windowMs: 60_000 },

  // Referrals & misc
  trackReferral: { name: "track-referral", max: 8, windowMs: 60_000 },
  knowledge: { name: "knowledge", max: 60, windowMs: 60_000 },
  skyAiStatus: { name: "sky-ai-status", max: 30, windowMs: 60_000 },
  skyAiChat: { name: "sky-ai-chat", max: 500, windowMs: 900_000 },
  skyAiChatAnon: { name: "sky-ai-chat-anon", max: 100, windowMs: 900_000 },
  skyAiConvList: { name: "sky-ai-conv-list", max: 30, windowMs: 60_000 },
  skyAiConvNew: { name: "sky-ai-conv-new", max: 20, windowMs: 60_000 },
  skyAiConvGet: { name: "sky-ai-conv-get", max: 40, windowMs: 60_000 },

  // Edge-level
  apiBurst: { name: "api-burst", max: 30, windowMs: 10_000 },
  apiGlobal: { name: "api-global", max: 150, windowMs: 60_000 },

  // Public endpoints
  listingViewPublic: { name: "listing-view-public", max: 8, windowMs: 60_000 },

  // Admin
  adminVerifyListing: { name: "admin-verify-listing", max: 30, windowMs: 60_000 },
  adminRejectListing: { name: "admin-reject-listing", max: 30, windowMs: 60_000 },
  adminApproveDigital: { name: "admin-approve-digital", max: 30, windowMs: 60_000 },
  adminRejectDigital: { name: "admin-reject-digital", max: 30, windowMs: 60_000 },
  adminResolveDispute: { name: "admin-resolve-dispute", max: 20, windowMs: 60_000 },
  adminBanUser: { name: "admin-ban-user", max: 10, windowMs: 60_000 },
  adminUserAction: { name: "admin-user-action", max: 20, windowMs: 60_000 },
  adminSettings: { name: "admin-settings", max: 10, windowMs: 60_000 },
  adminDashboard: { name: "admin-dashboard", max: 20, windowMs: 60_000 },
};

export function getRateLimitKey(namespace: string, identifier: string): string {
  const rule = RATE_LIMITS[namespace];
  if (!rule) return `rl:${namespace}:${identifier}`;
  return `rl:${rule.name}:${identifier}`;
}
