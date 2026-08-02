/**
 * Inventory of Stripe charge/transfer creation sites (Commit 1 audit).
 *
 * Classification:
 * 1 Listing purchase — FAIL CLOSED when STRIPE_CHECKOUT_ENABLED is not true
 * 2 Historical maintenance — leave enabled
 * 3 Refund / dispute — leave enabled
 * 4 Seller advertising (bump/sponsor) — leave enabled (not listing purchase)
 * 5 Legacy / unused — document only
 */

export const STRIPE_OPERATION_INVENTORY = [
  {
    path: "app/api/create-payment-intent/route.ts",
    op: "paymentIntents.create",
    class: "listing_purchase" as const,
    v1: "fail_closed",
  },
  {
    path: "app/api/create-purchase/route.ts",
    op: "createPurchase after PI",
    class: "listing_purchase" as const,
    v1: "fail_closed",
  },
  {
    path: "app/api/pay-offer/route.ts",
    op: "payOfferWithAdmin after PI",
    class: "listing_purchase" as const,
    v1: "fail_closed",
  },
  {
    path: "app/api/accept-offer/route.ts",
    op: "acceptOffer → offer_accepted purchase",
    class: "listing_purchase" as const,
    v1: "fail_closed",
  },
  {
    path: "app/api/listing-checkout-mode/route.ts",
    op: "read paymentType",
    class: "listing_purchase" as const,
    v1: "force_contact",
  },
  {
    path: "app/api/webhooks/stripe/route.ts",
    op: "webhook reconciliation",
    class: "historical_maintenance" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/disputes/route.ts",
    op: "refunds.create / resolve",
    class: "refund_dispute" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/admin/disputes-manage/route.ts",
    op: "refunds.create",
    class: "refund_dispute" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/release-payment/route.ts",
    op: "order completion (no transfer in V1)",
    class: "historical_maintenance" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/create-bump-intent/route.ts",
    op: "paymentIntents.create",
    class: "seller_advertising" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/sponsor-drop/route.ts",
    op: "paymentIntents.create",
    class: "seller_advertising" as const,
    v1: "leave_enabled",
  },
  {
    path: "app/api/stripe-connect/route.ts",
    op: "transfers.create (earningsBalance withdraw)",
    class: "legacy_or_unused" as const,
    v1: "leave_enabled_documented",
  },
] as const;

/** No checkout.sessions.create, paymentLinks.create, or charges.create found in app/. */
