# Sky Drop Stripe Connect Comprehensive Test Plan

## Test Environment Setup

### Prerequisites
- Stripe Test Account with API keys
- Test Firebase project
- Running dev server (`npm run dev`)
- Stripe CLI for webhook testing
- Test buyer and seller accounts

### Environment Variables Required
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_URL=http://localhost:3000
```

## Test Data Setup

### Test Seller Account
- Email: test-seller@skydrop.co.nz
- Stripe Connect: Onboarded with test account
- Test Listing: $50 item, ID: test-listing-001

### Test Buyer Account
- Email: test-buyer@skydrop.co.nz
- Payment Method: Stripe test card (4242 4242 4242 4242)

## Test Cases

### Test 1: Successful Payment Flow

**Objective**: Verify end-to-end successful payment creates purchase correctly

**Steps**:
1. Buyer navigates to `/post/listing/test-listing-001`
2. Clicks "Buy Now"
3. Enters card details: 4242 4242 4242 4242, 12/25, 123
4. Completes payment
5. Verifies redirect to `/purchases`
6. Checks purchase status in Firestore

**Expected Results**:
- Payment intent status: `succeeded`
- Purchase created in Firestore with status: `confirmed`
- Purchase contains: listingId, buyerEmail, sellerEmail, total, stripePaymentIntentId
- Webhook event `payment_intent.succeeded` processed
- Seller notification sent

**Verification Commands**:
```bash
# Check purchase in Firestore
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz

# Check webhook event
firebase firestore:documents get webhookEvents/pi_3MtwBw2eZvKYlo2C1g5y5r4f
```

**Edge Cases to Monitor**:
- Payment succeeds but webhook delayed
- Purchase created twice (should be prevented by duplicate check)

---

### Test 2: Failed Payment Flow

**Objective**: Verify failed payments are handled correctly without creating purchases

**Steps**:
1. Buyer navigates to `/post/listing/test-listing-001`
2. Clicks "Buy Now"
3. Enters declined card: 4000 0000 0000 0002
4. Attempts payment
5. Verifies error message displayed
6. Checks no purchase created in Firestore

**Expected Results**:
- Payment intent status: `requires_payment_method` or `canceled`
- No purchase created in Firestore
- Error message: "Your card was declined"
- Webhook event `payment_intent.payment_failed` logged
- Admin notified of payment failure

**Verification Commands**:
```bash
# Verify no purchase created
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
# Should return: No document exists

# Check webhook failure record
firebase firestore:documents get webhookFailures --where "eventType==payment_intent.payment_failed"
```

**Edge Cases to Monitor**:
- Payment fails after webhook delivery
- User retries immediately with same card

---

### Test 3: Cancelled Payment Flow

**Objective**: Verify cancelled payments don't create purchases

**Steps**:
1. Buyer navigates to `/post/listing/test-listing-001`
2. Clicks "Buy Now"
3. Enters card details: 4242 4242 4242 4242
4. Clicks "Cancel" on Stripe Checkout
5. Verifies redirect back to listing
6. Checks no purchase created in Firestore

**Expected Results**:
- Payment intent status: `canceled`
- No purchase created in Firestore
- User redirected to listing page
- No webhook events fired for cancellation

**Verification Commands**:
```bash
# Check payment intent status via Stripe CLI
stripe payment_intents retrieve pi_3MtwBw2eZvKYlo2C1g5y5r4f

# Verify no purchase created
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
```

**Edge Cases to Monitor**:
- User cancels after payment succeeds (race condition)
- Multiple cancel attempts

---

### Test 4: Duplicate Payment Attempts

**Objective**: Verify duplicate payment attempts are prevented

**Steps**:
1. Buyer navigates to `/post/listing/test-listing-001`
2. Clicks "Buy Now"
3. Enters card details: 4242 4242 4242 4242
4. Completes payment successfully
5. Immediately clicks "Buy Now" again on same listing
6. Attempts second payment with same card

**Expected Results**:
- First payment: succeeds, purchase created
- Second payment: succeeds, but returns existing purchase (line 86-89 in create-purchase route)
- Only one purchase record in Firestore
- Second call returns: `{ success: true, ...existingPurchase }`

**Verification Commands**:
```bash
# Check only one purchase exists
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz

# Count purchases for this listing
firebase firestore:documents get purchases --where "listingId==test-listing-001 AND buyerEmail==test-buyer@skydrop.co.nz"
# Should return exactly 1 document
```

**Edge Cases to Monitor**:
- Race condition: two simultaneous payment attempts
- Payment succeeds but create-purchase fails (recovery mechanism)

---

### Test 5: Duplicate Webhook Delivery

**Objective**: Verify duplicate webhook events don't create duplicate purchases

**Steps**:
1. Create test payment intent via Stripe CLI
2. Trigger webhook manually with same event ID twice
3. Verify only one purchase created

**Commands**:
```bash
# Create test payment intent
stripe payment_intents create --amount 5000 --currency nzd --metadata '{"listingId":"test-listing-001","buyerEmail":"test-buyer@skydrop.co.nz","title":"Test Item"}'

# Trigger webhook twice with same event ID
stripe trigger payment_intent.succeeded --add payment_intent:pi_3MtwBw2eZvKYlo2C1g5y5r4f
stripe trigger payment_intent.succeeded --add payment_intent:pi_3MtwBw2eZvKYlo2C1g5y5r4f
```

**Expected Results**:
- First webhook: creates purchase, sets webhookEvents doc to "processing" → "completed"
- Second webhook: detects existing webhookEvents doc, returns early (line 43-57 in webhook route)
- Only one purchase created
- Second webhook returns: `{ received: true }` without processing

**Verification Commands**:
```bash
# Check webhook event processed once
firebase firestore:documents get webhookEvents/evt_3MtwBw2eZvKYlo2C1g5y5r4f

# Check only one purchase
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
```

**Edge Cases to Monitor**:
- Webhook fails mid-processing, second webhook arrives
- Transaction rollback in webhook handler

---

### Test 6: Refund Flow

**Objective**: Verify refunds are processed correctly and purchase status updated

**Steps**:
1. Complete successful payment (Test 1)
2. Admin initiates refund via Stripe Dashboard
3. Verify webhook `charge.refund.updated` processed
4. Check purchase status in Firestore

**Commands**:
```bash
# Create refund via Stripe CLI
stripe refunds create --charge ch_3MtwBw2eZvKYlo2C1g5y5r4f --amount 5000

# Trigger refund webhook
stripe trigger charge.refund.updated --add charge:ch_3MtwBw2eZvKYlo2C1g5y5r4f
```

**Expected Results**:
- Refund created in Stripe
- Purchase status updated to `refunded` (if full refund) or `partially_refunded`
- Seller notification sent
- Admin notified of refund

**Verification Commands**:
```bash
# Check refund in Stripe
stripe refunds retrieve re_3MtwBw2eZvKYlo2C1g5y5r4f

# Check purchase status
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
# Should have status: refunded or partially_refunded
```

**Edge Cases to Monitor**:
- Partial refund vs full refund
- Multiple refunds on same purchase
- Refund after dispute resolution

---

### Test 7: Dispute Flow

**Objective**: Verify disputes are tracked and purchase status updated

**Steps**:
1. Complete successful payment (Test 1)
2. Buyer opens dispute via Stripe Dashboard
3. Verify webhook `charge.dispute.created` processed
4. Check dispute record in Firestore
5. Check purchase status updated to `disputed`

**Commands**:
```bash
# Create dispute via Stripe CLI (test mode)
stripe disputes create --charge ch_3MtwBw2eZvKYlo2C1g5y5r4f --reason product_not_received

# Trigger dispute webhook
stripe trigger charge.dispute.created --add charge:ch_3MtwBw2eZvKYlo2C1g5y5r4f
```

**Expected Results**:
- Dispute record created in Firestore `disputes` collection
- Purchase status updated to `disputed`
- Dispute fields: stripeDisputeId, chargeId, paymentIntentId, reason, status
- Admin notified of dispute

**Verification Commands**:
```bash
# Check dispute record
firebase firestore:documents get disputes/dp_3MtwBw2eZvKYlo2C1g5y5r4f

# Check purchase status
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
# Should have disputeStatus: disputed
```

**Edge Cases to Monitor**:
- Dispute opened after refund
- Dispute closed as won/lost
- Multiple disputes on same charge

---

### Test 8: Seller Payout Flow

**Objective**: Verify seller receives payouts after successful payments

**Steps**:
1. Complete successful payment (Test 1)
2. Wait for Stripe Connect payout schedule (daily for test accounts)
3. Verify payout created in Stripe
4. Check seller Stripe Connect balance
5. Verify funds transferred to seller bank account

**Commands**:
```bash
# Check Stripe Connect balance
stripe balance --stripe-account=acct_1MtwBw2eZvKYlo2C1g5y5r4f

# Check payouts
stripe payouts list --stripe-account=acct_1MtwBw2eZvKYlo2C1g5y5r4f

# Check connected account balance
stripe balance --stripe-account=acct_1MtwBw2eZvKYlo2C1g5y5r4f
```

**Expected Results**:
- Payment amount minus platform fee (1.00) transferred to seller
- Payout created in Stripe
- Seller bank account credited (in test mode, this is simulated)
- Transaction recorded in Stripe Connect dashboard

**Verification Commands**:
```bash
# Check payment destination charge
stripe charges retrieve ch_3MtwBw2eZvKYlo2C1g5y5r4f --expand destination

# Verify destination charge amount = total - processingFee
# Should be: $50.00 - $1.00 = $49.00
```

**Edge Cases to Monitor**:
- Seller not onboarded with Stripe Connect
- Negative balance due to refunds
- Payout failure (bank account issues)

---

### Test 9: Purchase Status Updates

**Objective**: Verify purchase status transitions work correctly

**Steps**:
1. Create purchase via successful payment (status: `confirmed`)
2. Update to `shipped` via API
3. Update to `delivered` via API
4. Update to `completed` via API
5. Verify each status transition

**Commands**:
```bash
# Update to shipped
curl -X POST http://localhost:3000/api/update-purchase-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purchaseId":"test-listing-001_test-buyer_skydrop_co_nz","status":"shipped"}'

# Update to delivered
curl -X POST http://localhost:3000/api/update-purchase-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purchaseId":"test-listing-001_test-buyer_skydrop_co_nz","status":"delivered"}'

# Update to completed
curl -X POST http://localhost:3000/api/update-purchase-status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purchaseId":"test-listing-001_test-buyer_skydrop_co_nz","status":"completed"}'
```

**Expected Results**:
- Status transitions: `confirmed` → `shipped` → `delivered` → `completed`
- Each update persists in Firestore
- Notifications sent on status changes
- Status cannot transition backwards (e.g., completed → shipped)

**Verification Commands**:
```bash
# Check purchase status after each update
firebase firestore:documents get purchases/test-listing-001_test-buyer_skydrop_co_nz
```

**Edge Cases to Monitor**:
- Invalid status transitions
- Status update by wrong user (buyer vs seller)
- Status update after refund

---

### Test 10: Network Interruption During Payment

**Objective**: Verify payment flow handles network interruptions gracefully

**Steps**:
1. Buyer navigates to `/post/listing/test-listing-001`
2. Clicks "Buy Now"
3. Enters card details: 4242 4242 4242 4242
4. Disconnect network during payment processing
5. Reconnect network
6. Navigate to `/purchases`
7. Verify purchase recovery via duplicate check

**Simulation**:
```bash
# Use Chrome DevTools to simulate network interruption
# Or use Charles Proxy to block requests during payment
```

**Expected Results**:
- If payment succeeded in Stripe but client disconnected:
  - User navigates to `/purchases`
  - Retries payment creation
  - Duplicate check finds existing purchase (lines 86-89)
  - Returns existing purchase data
- If payment failed in Stripe:
  - No purchase created
  - User can retry payment

**Edge Cases to Monitor**:
- Payment succeeds but webhook delayed
- Client receives success but fails to call create-purchase API
- Webhook creates purchase, client retries and recovers

## Edge Cases That Could Cause Issues

### 1. Double Charging

**Risk**: User charged twice but only one purchase created

**Prevention**:
- Duplicate check in `create-purchase` route (lines 86-89)
- Idempotency key in Stripe payment intent
- Webhook duplicate prevention (lines 43-57)

**Test**: Test 4 (Duplicate Payment Attempts)

### 2. Missing Payouts

**Risk**: Seller not paid for successful transaction

**Prevention**:
- `destinationCharge: true` in createPurchase (line 136)
- Stripe Connect automatic payouts
- Admin monitoring via webhook failure notifications

**Test**: Test 8 (Seller Payout Flow)

### 3. Incorrect Order Status

**Risk**: Purchase status doesn't match actual payment state

**Prevention**:
- Stripe webhook updates status based on payment intent
- Status validation in update-purchase-status API
- Transaction isolation in Firestore

**Test**: Test 9 (Purchase Status Updates)

### 4. Stuck Purchases

**Risk**: Purchase stuck in intermediate state (e.g., processing)

**Prevention**:
- Webhook error handling with retry
- Admin notifications for webhook failures
- Transaction rollback on webhook failure (line 286)
- Failure records in `webhookFailures` collection

**Test**: Test 10 (Network Interruption)

## Implementation Status

### Already Implemented ✅

1. **Duplicate Payment Prevention**
   - File: `app/api/create-purchase/route.ts` lines 86-89
   - Check: `findPurchaseByPaymentIntent(stripePaymentIntentId)`
   - Returns existing purchase if found

2. **Duplicate Webhook Prevention**
   - File: `app/api/webhooks/stripe/route.ts` lines 43-57
   - Firestore transaction checks existing webhook event
   - Returns early if already processed

3. **Payment Status Tracking**
   - File: `app/api/webhooks/stripe/route.ts` lines 59-138
   - Handles `payment_intent.succeeded` and `payment_intent.payment_failed`

4. **Dispute Tracking**
   - File: `app/api/webhooks/stripe/route.ts` lines 180-240
   - Creates dispute records in Firestore
   - Updates purchase dispute status

5. **Webhook Failure Logging**
   - File: `app/api/webhooks/stripe/route.ts` lines 22-36, 146-163, 290-305
   - Writes to `webhookFailures` collection
   - Notifies admin via `notifyAdmin`

### Missing Tests ⚠️

1. Comprehensive payment flow tests (only basic auth tests exist)
2. Refund flow testing
3. Dispute flow testing
4. Network interruption testing
5. Payout flow verification

## Recommended Test Execution Order

1. **Test 1**: Successful Payment (baseline)
2. **Test 4**: Duplicate Payment Attempts (critical for double charging prevention)
3. **Test 5**: Duplicate Webhook Delivery (critical for duplicate prevention)
4. **Test 2**: Failed Payment (error handling)
5. **Test 3**: Cancelled Payment (edge case)
6. **Test 9**: Purchase Status Updates (core functionality)
7. **Test 6**: Refund Flow (money movement)
8. **Test 7**: Dispute Flow (edge case)
9. **Test 8**: Seller Payout Flow (money movement)
10. **Test 10**: Network Interruption (resilience)

## Test Execution Checklist

- [ ] Stripe test keys configured in environment
- [ ] Test Firebase project selected
- [ ] Test seller account created and onboarded
- [ ] Test buyer account created
- [ ] Test listing created
- [ ] Dev server running (`npm run dev`)
- [ ] Stripe CLI installed
- [ ] Webhook tunnel running (ngrok or Stripe CLI webhook forwarding)
- [ ] Firestore emulator running (optional, for faster testing)

## Success Criteria

All tests pass if:
- No double charges occur
- No missing payouts occur
- Purchase status always matches payment state
- No stuck purchases in intermediate states
- Webhook failures are logged and notified
- Duplicate attempts return existing data without creating duplicates
