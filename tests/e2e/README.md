# Stripe Checkout E2E Tests

This directory contains end-to-end Playwright tests for the Stripe checkout flow.

## Test Suite

`stripe-checkout.spec.ts` - Comprehensive E2E tests for Stripe payment flow

## Test Scenarios

### 1. Successful Purchase Flow
- Buyer signs in and purchases using Stripe test card `4242 4242 4242 4242`
- Verifies PaymentIntent succeeds
- Verifies purchase document is created exactly once
- Verifies listing status updates correctly
- Verifies buyer sees the purchase in their purchases page
- Verifies seller sees the sale in their sales page
- Verifies notifications are created
- Verifies no console or server errors occur

### 2. Declined Payment Flow
- Uses Stripe's declined test card `4000 0000 0000 0002`
- Verifies clear error is shown to the user
- Verifies no purchase is created
- Verifies listing remains available
- Verifies no inconsistent database state

### 3. Cancelled Checkout Flow
- Verifies user can safely cancel checkout
- Verifies no purchase is created
- Verifies listing remains available
- Verifies no orphaned records

### 4. Duplicate Webhook Handling
- Simulates duplicate webhook delivery
- Verifies no duplicate purchase is created
- Verifies no duplicate notifications are created
- Verifies no duplicate payouts occur
- Note: This test verifies implementation logic; actual webhook testing requires Stripe CLI

### 5. Refund Flow
- Verifies refund updates purchase status
- Verifies buyer and seller state remain consistent
- Note: This test verifies implementation logic; actual refund testing requires Stripe CLI

## Required Environment Variables

To run these tests, the following environment variables must be configured:

### Firebase (Required)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_SERVICE_ACCOUNT=your_firebase_service_account_json_string
```

### Stripe (Required)
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Optional (NSFW Moderation)
```
NEXT_PUBLIC_ENABLE_NSFW_CHECK=true  # Set to true to enable NSFW moderation
```

## How to Run Tests

### Run all E2E tests
```bash
npm run test -- tests/e2e/stripe-checkout.spec.ts
```

### Run with UI mode
```bash
npm run test:ui -- tests/e2e/stripe-checkout.spec.ts
```

### Run headed (with visible browser)
```bash
npm run test:headed -- tests/e2e/stripe-checkout.spec.ts
```

### Run specific test scenario
```bash
npm run test -- tests/e2e/stripe-checkout.spec.ts -g "Successful Purchase Flow"
```

## Test Accounts

The tests automatically create and use the following test accounts:

- **Seller Account**: `test-seller-{timestamp}@skydrop.test`
  - Password: `TestPass123!`
  - Username: `seller-{timestamp}`
  - Creates listings for testing

- **Buyer Account**: `test-buyer-{timestamp}@skydrop.test`
  - Password: `TestPass123!`
  - Username: `buyer-{timestamp}`
  - Purchases items from seller

Note: Test accounts are created with unique timestamps to avoid conflicts. Manual cleanup may be required in Firebase Auth and Firestore after test runs.

## Stripe Test Cards

The tests use the following Stripe test cards:

### Success Card
- **Card Number**: `4242 4242 4242 4242`
- **Expiry**: Any future date (e.g., `12/34`)
- **CVC**: Any 3 digits (e.g., `123`)
- **Result**: Payment succeeds

### Declined Card
- **Card Number**: `4000 0000 0000 0002`
- **Expiry**: Any future date
- **CVC**: Any 3 digits
- **Result**: Payment declined (generic decline)

For more Stripe test cards, see: https://stripe.com/docs/testing#cards

## Environment Awareness

The tests are designed to be environment-aware. If required credentials are missing:
- Tests will skip gracefully with clear error messages
- No test failures will occur due to missing credentials
- Error messages will indicate exactly which credentials are missing

Example error messages:
- "Missing Firebase credentials: NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID required"
- "Missing Stripe credentials: STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY required"
- "Missing Firebase Service Account: FIREBASE_SERVICE_ACCOUNT required"

## Limitations

### Webhook Testing
The duplicate webhook and refund flow tests are currently placeholder tests because:
- Actual webhook testing requires Stripe CLI to trigger webhooks
- The tests verify the implementation logic exists in the code
- To fully test webhooks, use Stripe CLI to forward webhooks to your local development server

### Test Cleanup
Test accounts and listings are not automatically cleaned up after test runs. Manual cleanup may be required:
- Delete test accounts from Firebase Auth
- Delete test listings from Firestore
- Delete test purchases from Firestore

## NSFW Moderation Feature Flag

NSFW moderation is controlled by the `NEXT_PUBLIC_ENABLE_NSFW_CHECK` environment variable:

- **Disabled (default)**: `NEXT_PUBLIC_ENABLE_NSFW_CHECK=false` or not set
  - All images are automatically marked as safe
  - No TensorFlow.js or nsfwjs libraries are loaded
  - Faster development experience

- **Enabled**: `NEXT_PUBLIC_ENABLE_NSFW_CHECK=true`
  - Images are analyzed for NSFW content
  - TensorFlow.js and nsfwjs are loaded dynamically
  - May have webpack compilation issues with nsfwjs model files

### Why NSFW is Disabled by Default

The nsfwjs library contains model files with `require()` calls that webpack cannot statically analyze during build. This causes compilation errors in development. The feature flag allows:
1. Development to proceed without compilation errors
2. NSFW moderation to be optionally enabled when needed
3. Future migration to a different NSFW detection approach

### Re-enabling NSFW Moderation

To re-enable NSFW moderation:
1. Set `NEXT_PUBLIC_ENABLE_NSFW_CHECK=true` in your environment
2. Ensure nsfwjs and @tensorflow/tfjs are properly configured for webpack
3. Consider using server-side NSFW detection instead of client-side
4. Consider using a different NSFW detection library

## Troubleshooting

### Tests skip with credential errors
- Verify all required environment variables are set in `.env.local`
- Restart the dev server after adding environment variables
- Check that Firebase project is accessible with the provided credentials

### Stripe Elements don't load
- Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a test mode key (starts with `pk_test_`)
- Check browser console for Stripe-specific errors
- Ensure Stripe Elements are properly initialized in the checkout component

### Test accounts can't sign in
- Verify Firebase Auth is working
- Check that email verification is not required for test accounts
- Ensure test account passwords meet Firebase Auth requirements

### Purchases not appearing
- Check Firestore security rules allow reads
- Verify purchase documents are being created
- Check that the purchase ID is correctly stored in the test

## Future Improvements

1. Add Stripe CLI integration for actual webhook testing
2. Implement automated test cleanup
3. Add more test scenarios (partial payments, 3D Secure, etc.)
4. Add performance monitoring for payment flow
5. Add visual regression testing for checkout UI
