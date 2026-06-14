# AI Agent Guidelines

## Protected Files — Do Not Modify

The following files implement the Āwhina AI assistant integration and have been carefully tuned. AI coding agents (OpenCode, Cursor, Copilot, etc.) must NOT modify, refactor, rewrite, or suggest changes to these files unless explicitly instructed by the user:

### Āwhina AI Core
- `app/api/sky-ai/route.ts`
- `app/lib/sky-ai-listing-fill.ts`
- `app/lib/sky-ai-prompt.ts`
- `app/lib/sky-ai-prompts.ts`
- `app/lib/sky-ai-form-actions.ts`
- `app/lib/sky-ai-listing-context.ts`
- `app/lib/sky-ai-draft-merge.ts`
- `app/lib/sky-ai-events.ts`
- `app/lib/sky-ai-images.ts`
- `app/lib/sky-ai-types.ts`
- `app/lib/openai-health.ts`
- `app/lib/openai-errors.ts`

### Āwhina UI
- `app/components/SkyAiChatPanel.tsx`
- `app/post/ai/page.tsx`

These files contain intentional logic, carefully structured prompts, and extraction heuristics that are easy to silently break with well-intentioned refactors.

---

# SKY DROP – DO NOT BREAK AWHINA CHECKLIST

## Current Status

Awhina is finally becoming useful.

Awhina can now:

* Detect listing types
* Generate titles
* Generate descriptions
* Generate listing data
* Understand Vehicles
* Understand Physical items
* Understand Digital products
* Understand Services
* Understand Rentals

This functionality is critical to Sky Drop.

Before ANY changes are merged, verify the following still works.

---

## Core Rule

A user should be able to provide:

* A few words
* A messy paragraph
* A complete listing

And Awhina should create the listing correctly.

Example:

`2015 Mazda Axela blue 128000km Auckland $11500`

Expected:

* Vehicle selected
* Fields populated
* Ready to publish

No manual form filling.

---

## Listing Type Detection

Verify:

### Physical

Examples: Samsung TV, Couch, Drill, Laptop — **Physical selected**

### Digital

Examples: Template Pack, Ebook, Software, Invoice Bundle — **Digital selected**

### Services

Examples: Lawn Mowing, Handyman, House Cleaning — **Service selected**

### Rental

Examples: Apartment, House, Trailer Hire — **Rental selected**

### Vehicle

Examples: Toyota Corolla, Mazda Axela, Ford Ranger — **Vehicle selected**

---

## Form Population

After Awhina generates `LISTING_FILL`, must populate:

* Title
* Description
* Price
* Category
* Listing-specific fields

for **ALL** listing types. No exceptions.

---

## Buttons

After successful form fill, must show:

* Add Photos
* Edit Listing
* Publish Listing

If these buttons disappear: **STOP. Do not deploy.**

---

## Digital Rules

**Fixed Price:**

* Require downloadable file
* Show Buy Now

**Quote Required:**

* No downloadable file required
* Hide Buy Now
* Show Contact Seller / Request Quote

Never mix these.

---

## Services Rules

Allowed:

* Fixed Price
* Hourly Rate
* Quote Required

---

## Rental Rules

**Property Rental:** Weekly Rent, Bond, Bedrooms, Bathrooms, Parking, Furnished Status, Pets Policy, Available From, Minimum Tenancy

**Equipment Rental:** Daily / Weekly / Monthly

**Vehicle Rental:** Daily / Weekly / Monthly

---

## Property Rentals

Do **NOT** add on normal rental properties:

* Daily Rate
* End Date
* Condition
* Quantity Available

---

## Quote Required Rules

Quote Required listings **MUST NOT** show:

* Buy Now
* Stripe Checkout
* Purchase actions

**MUST** show:

* Contact Seller
* Request Quote
* Message Seller

---

## Testing Before Every Deploy

Test all seven flows:

1. Physical Listing
2. Digital Product
3. Digital Quote Required Service
4. Local Service
5. Property Rental
6. Equipment Rental
7. Vehicle Listing

Verify: Generate → Fill Form → Add Photos → Edit Listing → Publish Listing

---

## Never Break These

* Awhina listing generation
* Form autofill
* Listing type detection
* Photo uploads
* Publish flow
* Quote Required flow
* Digital downloads
* Vehicle autofill
* Rental autofill

If any fail: **block deployment**.

---

# Security Architecture (Updated June 2026)

## Admin Authorization — Three-Layer Model

```
Layer 1 (Fastest) — Environment Variable
  ADMIN_EMAILS=user1@example.com,user2@example.com
  SUPER_ADMIN_EMAILS=super@example.com
  isAdminEmail() — synchronous, client & server, no Firestore needed

Layer 2 (Authoritative) — Firestore config/adminRoles document
  { admins: [{ email: "...", role: "super_admin|admin|moderator|support" }] }
  isAdminUser() — async, server-only, checked after Layer 1
  All admin API routes use requireAdminFromRequest() which calls this

Layer 3 (Rules) — Firebase custom claims + Firestore config/adminEmails doc
  request.auth.token.admin == true (set by syncAdminCustomClaim())
  config/adminEmails.emails array (synced when adminRoles changes)
  Used by firestore.rules for collection-level access control
```

## Key Files

| File | Purpose |
|------|---------|
| `app/lib/admin-check.ts` | `isAdminEmail()` — env var only, no hardcoded fallback |
| `app/lib/admin-check.server.ts` | `isAdminUser()` — Firestore-based, `syncAdminCustomClaim()` |
| `app/lib/admin-roles.ts` | Role types, `isSuperAdminEmail()` — env var only |
| `app/lib/admin-request.ts` | `requireAdminFromRequest()` — all admin API routes |
| `app/lib/admin-alerts.ts` | Admin notifications via Firestore config, no hardcoded emails |
| `app/lib/rate-limit.ts` | Upstash Redis → Firestore → in-memory fallback |
| `app/lib/rate-limit-upstash.ts` | Upstash Redis sliding window rate limiter |
| `app/lib/rate-limit-config.ts` | Centralized rate limit rules for all endpoints |
| `app/lib/security-log.ts` | Security event logging (console + Firestore + Sentry) |

## Rate Limiting Layers

1. **Upstash Redis** (when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set) — distributed, production
2. **Firestore** (`rateLimits` collection) — cross-instance fallback
3. **In-memory** (`Map`) — per-instance, dev/edge fallback

All sensitive endpoints have defined limits in `app/lib/rate-limit-config.ts`.

## Security Event Logging

All security-relevant events are logged to:
- Console (`[security:severity]` prefix)
- Firestore `securityEvents` collection (admin-reviewable)
- Sentry (critical events only)

Events tracked: failed admin access, rate limit violations, payment failures, webhook signature failures, dispute actions.

## Environment Variables (New)

```
UPSTASH_REDIS_REST_URL=     # For distributed rate limiting
UPSTASH_REDIS_REST_TOKEN=   # For distributed rate limiting
SUPER_ADMIN_EMAILS=          # Overrides first ADMIN_EMAILS entry
```

---

## Final Rule

Awhina should always make listing creation easier, never harder.

A user should be able to describe what they are selling in one message and be ready to publish within seconds.
