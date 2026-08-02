# Sky Drop V1 Messaging-First — Go / No-Go Report

**Date:** 2026-08-02  
**Verdict:** **GO** (with one residual note on browser smoke)

---

## Commit hashes

| Stage | Hash | Summary |
|-------|------|---------|
| 1 Flags + fail-closed APIs | `aa84178` | Gate listing Stripe Checkout behind server flag |
| 2 Message Seller CTAs | `db04278` | Force contact listings + Message Seller CTAs |
| 3 Nav + historical notices | `a6f1622` | Browse/Search/Sell/Messages/Profile; historical pages kept |
| 4 Messaging polish | `9165ff4` | Quick replies, hide Pay Now, soft-block checkout routes, hide profile payouts |
| 5 Copy + docs + reviews | `c4b5828` | PAYMENT_ARCHITECTURE V1 section, copy audit, review eligibility tests |
| 6 Verify + Firebase cleanup | *(this commit)* | Tests, build, escrow delete, go/no-go |

---

## Mandatory completion checklist

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Dual flags; server sole auth | `app/lib/stripe-checkout-flags.ts`; UI uses `NEXT_PUBLIC_*` only | Pass |
| Listing payment APIs fail-closed | `create-payment-intent`, `create-purchase`, `pay-offer` (+ `accept-offer`) return 503 when server flag off | Pass |
| Message Seller primary CTA | Listing detail, cards, purchase labels when UI flag off | Pass |
| Contact-only listing writes | `resolveListingPaymentTypeForWrite` → `contact` when server flag off; used by create-listing + update-listing | Pass |
| Historical purchases/sales/disputes reachable | Pages kept; `HistoricalOrdersNotice`; no blanket redirect to Messages | Pass |
| Nav simplified | Browse · Search · Sell · Messages · Profile; no Purchases/Sales/payout nav | Pass |
| Messages: one-tap quick replies + meet chips | Buyer/seller sets + public-meeting chips; `sendQuickReply`; Pay Now gated | Pass |
| Soft-block `/payments`, `/checkout*`, `/buyer-protection` | Messaging-first empty / safety tips when UI flag off | Pass |
| Profile hides Connect Stripe / payouts | Payments tab filtered when UI flag off | Pass |
| Safety wording (no escrow/guarantees) | `V1_ARRANGE_SAFETY_ONE_LINER` | Pass |
| Reviews not weakened | Same completed-order model; `evaluateReviewEligibility` + expanded tests | Pass |
| Stripe V2 code retained | CheckoutModal, OfferPaymentModal, payment APIs still present behind flags | Pass |
| Both `autoReleaseEscrow` removed | See Firebase section | Pass |
| No `autoReleaseFunds` / escrow redeploy | Source uses `autoCompleteDeliveredOrders` only | Pass |

---

## Verification results

### Unit tests
```
npx vitest run app/lib/order-reviews.test.ts app/lib/stripe-checkout-flags.test.ts \
  app/lib/payment-architecture.test.ts app/lib/payment-order-completion.test.ts \
  app/lib/stripe-refund-sync.test.ts app/lib/listing-payment-type-write.test.ts
```
**Result:** Pass (40+ related tests including listing payment-type write + review integrity matrix).

### Typecheck
```
npx tsc --noEmit
```
**Result:** Pass (after narrowing review test status assertion).

### Production build
```
npx next build
```
**Result:** Pass — `/messages`, `/payments`, `/checkout`, `/buyer-protection`, listing routes compile.

### Payments-on recoverability
Stripe components and APIs remain in tree; helpers flip on when `STRIPE_CHECKOUT_ENABLED=true` / `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=true`. Build compiles with flags unset (default off).

### Browser smoke
Not run end-to-end in this session (no local preview server attached). Code paths for desktop/mobile messages layout and soft-block pages are present; recommend a quick manual pass on production preview after deploy.

---

## Firebase `autoReleaseEscrow` delete

### asia-southeast1
```
firebase functions:delete autoReleaseEscrow --region asia-southeast1 --force
```
**Result:** Already absent — `The specified filters do not match any existing functions` (previously deleted; documented in PAYMENT_ARCHITECTURE).

### us-central1
```
firebase functions:delete autoReleaseEscrow --region us-central1 --force
```
**Result:** **Failed via Firebase CLI** — scheduler job 404 caused CLI to abort before function delete. Function was in `FAILED` state (`CloudRunServiceNotFound`), Memory `---`, no active schedule.

**Successful delete via Cloud Functions API v2:**
```
DELETE https://cloudfunctions.googleapis.com/v2/projects/sky-drop-de459/locations/us-central1/functions/autoReleaseEscrow
```
Operation `operation-1785651714788-6580a70270e0b-bfeb4f40-a49de7fe` → **done: true**.

### Post-delete `firebase functions:list`
Only active functions remain in `asia-southeast1`:
- `autoCompleteDeliveredOrders`
- `cleanupOldData`
- `onListingCreated` / `onListingUpdated`
- `onMessageCreated` / `onReportCreated`

**No `autoReleaseEscrow` in any region.**

---

## Remaining wording / residual risks

- Some Stripe-on copy remains behind `isStripeCheckoutVisibleClient()` (intentional for V2).
- Knowledge base / guide-assistant may still mention Buy Now in Stripe-enabled contexts.
- Browser smoke not automated this session — recommend production preview check of Messages chips + soft-block pages.
- Protected Āwhina files were not modified.

---

## Final verdict

**GO** for V1 messaging-first launch with flags default-off.

Blockers cleared: escrow function remnants removed; build/tests green; review integrity preserved; listing payment APIs fail-closed; Message Seller journey wired.
