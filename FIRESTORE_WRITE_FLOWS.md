# Firestore Write Flows Documentation

This document maps out which operations write to Firestore directly from the client vs which must go through API routes.

## Client-Side Writes (Direct to Firestore)

These operations write directly to Firestore from the client. They typically involve user-owned data or require real-time updates.

### Profile Updates
- **Location**: `app/profile/page.tsx`, `app/lib/firebase.ts`
- **Operations**: User profile fields (username, bio, region, social links, notification settings)
- **Collection**: `profiles/{uid}`
- **Security**: Uses Firebase Auth to ensure user can only write their own profile

### Messages
- **Location**: `app/messages/page.tsx`, `app/lib/message-sender.ts`
- **Operations**: Sending messages between users
- **Collection**: `conversations/{convKey}/messages/{messageId}`
- **Security**: Uses Firebase Auth to ensure proper sender/recipient validation

### Listings (Read-only)
- **Location**: Various listing pages
- **Operations**: Listing reads only (no direct writes)
- **Collection**: `listings/{id}`
- **Note**: Listing creation must go through API route

### Real-time Listeners
- **Location**: Throughout the app
- **Operations**: `onSnapshot` listeners for real-time updates
- **Collections**: profiles, listings, conversations, purchases, etc.
- **Purpose**: Real-time UI updates without server polling

## API Route Writes (Server-Side)

These operations must go through API routes for security, validation, or complex business logic.

### Listing Creation
- **Location**: `app/api/create-listing/route.ts`
- **Operations**: Create new listings
- **Collection**: `listings/{id}`
- **Why API Required**:
  - KYC verification check
  - Rate limiting
  - Content sanitization
  - Scam detection
  - Decision engine validation
  - Captcha verification
  - Image uploads to Firebase Storage

### Purchase Creation
- **Location**: `app/api/create-purchase/route.ts`
- **Operations**: Create purchase records
- **Collection**: `purchases/{id}`
- **Why API Required**:
  - Payment validation
  - Stripe integration
  - Payment processing
  - Fraud detection

### Offer Acceptance
- **Location**: `app/api/accept-offer/route.ts`
- **Operations**: Accept/reject offers
- **Collection**: `purchases/{id}`, `listings/{id}`
- **Why API Required**:
  - Business logic validation
  - Notification triggers
  - Status updates

### Arrange Purchase
- **Location**: `app/api/arrange-purchase/route.ts`
- **Operations**: Initiate arrange purchase flow
- **Collection**: `purchases/{id}`, `conversations/{convKey}/messages`
- **Why API Required**:
  - Purchase record creation
  - Message system integration
  - Validation

### KYC Verification
- **Location**: `app/api/kyc-notify/route.ts` (and related)
- **Operations**: Submit KYC documents
- **Collection**: `kycSubmissions/{id}`, `profiles/{uid}`
- **Why API Required**:
  - Document upload to storage
  - NSFW image detection
  - Admin notification
  - Status updates

### Admin Operations
- **Location**: `app/api/admin/*`
- **Operations**: User management, listing verification, KYC review, etc.
- **Collections**: Various (profiles, listings, users, etc.)
- **Why API Required**:
  - Admin authentication
  - Audit logging
  - Critical business operations
  - Bulk operations

### Stripe Integration
- **Location**: `app/api/create-payment-intent/route.ts`, `app/api/stripe-connect/route.ts`
- **Operations**: Payment processing, account linking
- **Collections**: `purchases/{id}`, `profiles/{uid}`
- **Why API Required**:
  - Secret key handling
  - Secure API communication with Stripe
  - Webhook validation

### Phone Verification
- **Location**: `app/api/claim-verified-phone/route.ts`
- **Operations**: Verify phone numbers
- **Collection**: `profiles/{uid}`
- **Why API Required**:
  - SMS sending (via external service)
  - Code validation
  - Rate limiting
  - Fraud prevention

### Dispute Management
- **Location**: `app/api/disputes/route.ts`
- **Operations**: Create and manage disputes
- **Collection**: `disputes/{id}`, `purchases/{id}`
- **Why API Required**:
  - Payment release logic
  - Evidence collection
  - Admin review workflow

### Listing Deletion
- **Location**: `app/api/delete-listing/route.ts`
- **Operations**: Delete listings
- **Collection**: `listings/{id}`
- **Why API Required**:
  - Ownership verification
  - Cleanup of related data (purchases, messages)
  - Audit logging

### Notification Creation
- **Location**: `app/api/create-notification/route.ts`
- **Operations**: Create system notifications
- **Collection**: `notifications/{id}`
- **Why API Required**:
  - Bulk operations
  - Rate limiting
  - User targeting logic

### Cron Jobs
- **Location**: `app/api/cron/*`
- **Operations**: Expire auctions, expire offers, etc.
- **Collections**: Various (listings, purchases, offers)
- **Why API Required**:
  - Scheduled execution
  - Bulk updates
  - Complex business logic

## Key Patterns

### When to Use Client-Side Writes:
1. **User-owned data**: Profiles, preferences
2. **Real-time collaboration**: Messages, chat
3. **Simple updates**: Field changes that don't affect business logic
4. **Optimistic UI**: Updates that need immediate feedback

### When to Use API Routes:
1. **Financial operations**: Payments, purchases, refunds
2. **Security-sensitive**: KYC, verification, admin actions
3. **Complex validation**: Multi-step business logic
4. **External integrations**: Stripe, SMS, email
5. **Bulk operations**: Cron jobs, batch updates
6. **Cross-collection updates**: Operations affecting multiple documents
7. **Rate limiting**: Operations that need throttling
8. **Audit requirements**: Actions that need logging

## Security Considerations

### Client-Side Security:
- Firebase Security Rules validate writes
- Users can only write their own data
- No secret keys exposed to client

### API Route Security:
- Firebase Admin SDK (bypasses security rules)
- Authentication via Firebase tokens
- Server-side validation
- Secret keys managed server-side
- Rate limiting and abuse prevention

## Common Mistakes to Avoid

1. **Don't write financial data client-side**: Always use API routes for money operations
2. **Don't bypass KYC checks**: Listing creation must go through API
3. **Don't expose admin logic**: Admin operations must be server-side
4. **Don't skip validation**: API routes should validate all inputs
5. **Don't forget cleanup**: Deleting data should clean up related collections
