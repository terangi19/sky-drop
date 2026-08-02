# Sky Drop Payment Architecture

**Last updated:** 2026-08-02  
**Status:** Single supported listing checkout model — Stripe Connect **destination charges** + **Arrange Purchase** (off-platform).

---

## Supported models

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

### 2. Arrange Purchase

1. `POST /api/arrange-purchase` marks the listing sold and opens Messages.
2. Buyer and seller arrange bank transfer / cash / pickup themselves.
3. No PaymentIntent. No Stripe money movement.
4. Purchase may use `paymentType: "contact"` and `destinationCharge: false` (meaning “no Stripe charge”, not “platform-held funds”).

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
| Deployed `autoReleaseEscrow` | **Deleted** from `asia-southeast1` (was the live daily job). Replaced by `autoCompleteDeliveredOrders`. A **FAILED** leftover named `autoReleaseEscrow` may still appear under `us-central1` in the Firebase list (no active schedule) — delete when Cloud Console access allows. |
| User copy implying “we release funds after delivery” | **Rewritten** |

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
Stripe Checkout
  Buyer card
       │
       ▼
  Platform PaymentIntent (NZD)
       ├── application_fee → Sky Drop
       └── transfer_data.destination → Seller Express balance
              │
              ▼
         Stripe payout schedule → Seller bank

Arrange Purchase
  Buyer ──(bank/cash/pickup)──► Seller
  (Sky Drop Messages only; no Stripe)
```

---

## Regression tests

- `app/lib/payment-order-completion.test.ts`
- `app/lib/payment-architecture.test.ts`
- `app/lib/stripe-refund-sync.test.ts`
- `app/lib/order-reviews.test.ts`

Run: `npx vitest run app/lib/payment-order-completion.test.ts app/lib/payment-architecture.test.ts app/lib/stripe-refund-sync.test.ts app/lib/order-reviews.test.ts`
