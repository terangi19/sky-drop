# Sky Drop Payment Architecture

**Last updated:** 2026-08-02  
**Status:** V1 messaging-first marketplace. Stripe Connect destination charges remain in codebase for V2, gated by dual env flags.

---

## V1 messaging-only (current default)

Primary public journey:

**Browse / Search → Listing → Message Seller → Agree in chat → Pay / meet outside Sky Drop → Review when order is completed.**

Sky Drop does **not** process new listing checkout payments while the server flag is off. There is no escrow, no platform-held funds, and no buyer-protection guarantee for V1 marketplace transactions.

Safety one-liner (user-facing):

> Agree on payment, pickup or delivery directly with the seller. Meet in a public place and verify the item before paying.

### Feature flags

| Flag | Role | Default when unset |
|------|------|--------------------|
| `STRIPE_CHECKOUT_ENABLED` | **Server** source of truth for authorizing new listing charges | **false** (disabled) |
| `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED` | **UI visibility only** | **false** (disabled) |

Helpers: `app/lib/stripe-checkout-flags.ts`

- `isStripeCheckoutEnabledServer()` — reads **only** `STRIPE_CHECKOUT_ENABLED`; never the public flag
- `isStripeCheckoutVisibleClient()` — reads `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED` for UI
- `listingCheckoutUnavailableBody()` — controlled JSON for fail-closed APIs

**Never trust the public flag for payment authorization.**

When the server flag is off, these APIs return **503** with `code: STRIPE_CHECKOUT_DISABLED`:

- `POST /api/create-payment-intent`
- `POST /api/create-purchase`
- `POST /api/pay-offer`

Still enabled: Stripe webhooks, refunds, dispute processing, historical purchase/sale pages.

Listing writes force `paymentType: "contact"` when the server flag is off (create + update paths).

---

## Supported models (V2 recoverable)

### 1. Stripe Checkout (listing Buy Now / accepted-offer card pay)

1. Buyer pays via PaymentIntent created in `app/api/create-payment-intent/route.ts`.
2. Stripe parameters:
   - `transfer_data.destination` = seller Express account id
   - `application_fee_amount` = $1.00 (100 cents NZD)
   - `automatic_payment_methods.enabled` = true
   - **No** `capture_method` (automatic capture)
   - **No** `on_behalf_of`
3. On success, funds split immediately:
   - Seller connected balance ← item price − fee
   - Platform ← application fee
4. Purchase row is created with `destinationCharge: true` (`create-purchase`, Stripe webhook).
5. Bank payout to the seller follows **Stripe Express payout timing**, not delivery confirmation.

Sky Drop **never holds** listing purchase funds and **never** creates a later `transfers.create` for listing checkout.

### 2. Arrange Purchase / messaging-first contact

1. Buyer messages the seller (V1 primary CTA: **Message Seller**).
2. Buyer and seller arrange bank transfer / cash / pickup themselves.
3. No PaymentIntent. No Stripe money movement.
4. Purchase / review eligibility uses the existing completed-transaction model (`delivered` / `completed` / `returned`).

---

## Review eligibility (do not weaken)

Reviews are purchase-bound. Same rules for Arrange Purchase and (when enabled) Stripe Checkout.

| Rule | Behaviour |
|------|-----------|
| Auth | Bearer token required; email must be verified |
| Party | Reviewer email must match `buyerEmail` or `sellerEmail` |
| Status | `delivered`, `completed`, or `returned` only |
| Dispute | Active `open` / `pending` / `under_review` blocks reviews |
| Duplicate | One review per role; doc id `purchaseId_reviewerUid` |
| Self | Reviewee email must differ from reviewer |

Helpers: `evaluateReviewEligibility()` in `app/lib/order-reviews.ts`  
API: `POST /api/submit-review`  
Tests: `app/lib/order-reviews.test.ts`

---

## Order completion (not fund release)

| Field | Meaning |
|-------|---------|
| `orderCompleted` | Order administratively complete |
| `orderCompletedAt` | When completion was recorded |
| `autoCompleted` | Set by scheduled job after 14 days delivered |
| `status: completed` | FSM / UI status |

Legacy reads still honor `fundsReleased` via `isOrderCompleted()` in `app/lib/payment-order-completion.ts`. **New writes use `orderCompleted` only.**

Completion endpoints:

- `POST /api/release-payment` — completes a **delivered** order (no Stripe transfer). Kept path for clients/tests; behaviour is order completion.
- `POST /api/disputes` `action: release` — admin resolves dispute for seller (status only).
- Cloud Function `autoCompleteDeliveredOrders` — daily; marks old delivered orders complete if no active dispute.

---

## Refunds and disputes

- Admin refund: `stripe.refunds.create({ payment_intent })` — reverses the destination charge via Stripe.
- **Refund eligibility does not depend on `orderCompleted` / `fundsReleased`.**
- Eligibility requires: active dispute, PaymentIntent id, not already refunded.
- Delivery confirmation (`POST /api/update-purchase-status`) only updates order status — it does not move money.

---

## Explicitly removed / rejected

| Path | Status |
|------|--------|
| Separate charges + later `transfers.create` for listings | **Removed** from `/api/release-payment` and dispute resolve |
| Deployed `autoReleaseEscrow` | **Removed** from both regions: `asia-southeast1` (already gone) and `us-central1` (FAILED orphan deleted via Cloud Functions API v2 after CLI scheduler 404). Replaced by `autoCompleteDeliveredOrders`. Do not redeploy escrow-named jobs. |
| User copy implying "we release funds after delivery" | **Rewritten** |

If a purchase has `stripePaymentIntentId` and `destinationCharge === false`, completion/dispute-resolve APIs return **400** (retired path — contact support). No manual transfer is created.

---

## Out of scope (not listing checkout)

| Feature | Notes |
|---------|--------|
| Listing bump / sponsor PaymentIntents | Platform-only charges (no `transfer_data`) |
| `stripe-connect` `withdraw` + `earningsBalance` | Separate platform ledger; not used for new listing destination charges |

---

## Money-flow diagram

```
V1 messaging-first (default)
  Buyer ── Messages ──► Seller
  Agree payment / pickup / delivery offline
  (No Stripe listing charge)

Stripe Checkout (flag on — V2)
  Buyer card
       │
       ▼
  Platform PaymentIntent (NZD)
       ├── application_fee → Sky Drop
       └── transfer_data.destination → Seller Express balance
              │
              ▼
         Stripe payout schedule → Seller bank
```

---

## Regression tests

- `app/lib/payment-order-completion.test.ts`
- `app/lib/payment-architecture.test.ts`
- `app/lib/stripe-refund-sync.test.ts`
- `app/lib/order-reviews.test.ts`
- `app/lib/stripe-checkout-flags.test.ts`

Run: `npx vitest run app/lib/payment-order-completion.test.ts app/lib/payment-architecture.test.ts app/lib/stripe-refund-sync.test.ts app/lib/order-reviews.test.ts app/lib/stripe-checkout-flags.test.ts`
