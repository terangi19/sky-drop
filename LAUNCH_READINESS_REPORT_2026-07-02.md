# Sky Drop Launch Readiness Report

**Date:** July 2, 2026  
**Reviewer:** Cascade (AI Code Review)  
**Scope:** Complete production readiness review of current codebase  
**Review Method:** Code inspection and verification testing from project root

---

## Executive Summary

Sky Drop has **6 🔴 Critical Blockers** and **1 🟠 High-Priority Issue** that must be addressed before production launch. The application demonstrates strong fundamentals with recent UX improvements, analytics instrumentation, and UI consistency work. However, critical security vulnerabilities pose unacceptable risk for production deployment.

**Overall Launch Score: 5/10**

The application is **NOT READY FOR PRODUCTION LAUNCH** without addressing the 🔴 Critical Blockers.

---

## 🔴 Critical Blockers (Must Fix Before Launch)

### Issue #1: Hardcoded Firebase API Key Fallback
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/lib/firebase.ts` (line 7)  
The Firebase configuration includes a hardcoded API key as a fallback when `NEXT_PUBLIC_FIREBASE_API_KEY` environment variable is not set.

```typescript
apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
```

**User Impact:**  
- API key is visible in client-side JavaScript bundle
- No validation that environment variables are properly configured
- Application may start with incorrect configuration

**Risk:**  
- API key exposure in production builds
- Potential for unauthorized Firebase usage
- Billing abuse if quota limits are circumvented
- Violates security best practices for secrets management

**Recommended Fix:**  
Remove hardcoded fallbacks and fail fast if environment variables are missing:

```typescript
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (() => {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required");
  })(),
  // ... other config with same pattern
};
```

**Implementation Time:** 30 minutes

---

### Issue #2: Firebase App Check Disabled
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/lib/firebase.ts` (lines 27-32)  
Firebase App Check is explicitly disabled, removing a critical security layer that protects against unauthorized API requests and abuse.

```typescript
// App Check disabled — not enforced in Firebase Console and causing reCAPTCHA errors
// Re-enable once you have a valid reCAPTCHA v3 site key configured for your domain
// import { initAppCheck } from "./app-check";
// if (typeof window !== "undefined") {
//   initAppCheck();
// }
```

**User Impact:**  
- Attackers can make direct API calls to Firebase from scripts
- No protection against unauthorized app instances
- Increased vulnerability to automated abuse and scraping

**Risk:**  
- Unauthorized API access from external scripts
- Increased abuse and spam
- Potential for automated listing creation or message spam
- Higher Firebase costs due to abuse

**Recommended Fix:**  
1. Configure reCAPTCHA v3 site key in Firebase Console
2. Add `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `FIREBASE_APP_CHECK_DEBUG_TOKEN` to environment variables
3. Uncomment and configure App Check initialization

**Implementation Time:** 2-4 hours

---

### Issue #3: CSRF Protection Disabled
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/lib/csrf.ts` (lines 79-84)  
The `requireCsrf` function is a no-op - CSRF validation is completely disabled despite a comprehensive CSRF protection library being implemented.

```typescript
export async function requireCsrf(request: Request): Promise<void> {
  // CSRF validation disabled - causing issues
  // if (!(await validateCsrfToken(request))) {
  //   throw new CsrfError();
  // }
}
```

**User Impact:**  
- Attackers can force users to perform unwanted actions via CSRF attacks
- No protection against cross-site request forgery

**Risk:**  
- Unauthorized purchases on behalf of authenticated users
- Account takeover via profile modification
- Message spam from user accounts
- Financial fraud potential

**Recommended Fix:**  
1. Investigate and fix the issues causing CSRF validation to fail
2. Re-enable CSRF validation in `requireCsrf` function
3. Ensure all state-changing API routes call `requireCsrf`
4. Add CSRF token to client-side requests

**Implementation Time:** 4-6 hours

---

### Issue #4: Turnstile Verification Bypassed
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/lib/turnstile.ts` (lines 23-26)  
Turnstile verification returns `true` when the secret key is not set, completely bypassing bot protection.

```typescript
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = getTurnstileSecretKey();
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification");
    return true;  // ⚠️ Bypasses verification
  }
```

**User Impact:**  
- No bot protection when Turnstile is not configured
- Abuse decision engine cannot verify human users
- Automated attacks can proceed without friction

**Risk:**  
- Automated account creation
- Bot-driven listing spam
- Message spam from automated accounts
- Higher abuse rates overwhelming rate limits

**Recommended Fix:**  
1. Configure Turnstile environment variables (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`)
2. Change verification to fail when secret not set:

```typescript
if (!secret) {
  console.error("[turnstile] TURNSTILE_SECRET_KEY not set — blocking request");
  return false;
}
```

**Implementation Time:** 1-2 hours (assuming Turnstile account setup)

---

### Issue #5: CSRF Not Enforced in create-listing Route
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/api/create-listing/route.ts` (line 66)  
The create-listing API route has the CSRF validation call commented out, allowing listing creation without CSRF protection.

```typescript
export async function POST(req: NextRequest) {
  try {
    // CSRF validation disabled - causing issues
    // await requireCsrf(req);
```

**User Impact:**  
- Attackers can create listings on behalf of users via CSRF attacks
- No CSRF protection for a critical state-changing operation

**Risk:**  
- Unauthorized listing creation
- Potential for listing spam attacks
- Financial impact from fraudulent listings

**Recommended Fix:**  
Uncomment the CSRF validation call once Issue #3 is resolved.

**Implementation Time:** 5 minutes (after Issue #3)

---

### Issue #6: save-profile Route Uses Disabled CSRF
**Confidence Level:** ✅ Verified  
**Blocks Launch:** Yes

**Description:**  
File: `app/api/save-profile/route.ts` (line 11)  
The save-profile route calls `requireCsrf`, but since `requireCsrf` is a no-op, this provides no actual CSRF protection.

```typescript
export async function POST(req: NextRequest) {
  try {
    await requireCsrf(req);  // ⚠️ No-op, provides no protection
```

**User Impact:**  
- False sense of security - CSRF appears enabled but is not
- Profile modifications can be performed via CSRF attacks

**Risk:**  
- Account takeover via profile modification
- Reputation system manipulation
- Bank details tampering

**Recommended Fix:**  
This will be resolved automatically when Issue #3 is fixed.

**Implementation Time:** 0 minutes (resolved by Issue #3)

---

## 🟠 High-Priority Issues (Should Fix Before Launch)

### Issue #7: Rate Limiting In-Memory Fallback Broken in Serverless
**Confidence Level:** ✅ Verified  
**Blocks Launch:** No (but should be fixed)

**Description:**  
File: `app/lib/rate-limit.ts` (lines 105-123)  
Rate limiting falls back to in-memory Map storage when Upstash Redis is unavailable. This doesn't work in serverless environments (Vercel) where each invocation is isolated.

```typescript
// Layer 4: In-memory fallback (used when Upstash + Firestore both unavailable)
const freshEntry = store.get(key);
if (!freshEntry || now > freshEntry.resetAt) {
  store.set(key, { count: 1, resetAt: now + windowMs });
  return { allowed: true, remaining: maxRequests - 1, limit: maxRequests };
}
```

**User Impact:**  
- Rate limits can be bypassed by distributing requests across serverless instances
- Inconsistent rate limiting behavior in production

**Risk:**  
- Rate limit bypass by distributing requests
- Reduced protection against abuse during Redis outages
- Potential for abuse when Firestore is also unavailable

**Recommended Fix:**  
Remove in-memory fallback or add warning logs. Ensure Firestore fallback is primary:

```typescript
if (process.env.NODE_ENV === "production" && !isUpstashEnabled()) {
  throw new Error("Upstash Redis is required in production");
}
```

**Implementation Time:** 2-3 hours

---

## 🟢 Positive Findings (Recently Improved)

### Improvement #1: Bank Details Validation Implemented
**Confidence Level:** ✅ Verified

**Description:**  
File: `app/api/save-profile/route.ts` (lines 163-179)  
Bank account details validation is properly implemented with format checking.

**Status:** This was a P1 issue in the previous audit (June 27, 2026) and has been fixed.

---

### Improvement #2: Analytics Instrumentation Enhanced
**Confidence Level:** ✅ Verified

**Description:**  
File: `app/lib/funnel-events.ts`  
Analytics tracking has been enhanced with additional event types:
- `listing_published`
- `message_started`
- `purchase_started`
- `offer_sent`, `offer_accepted`
- `auction_won`
- `search_used`, `search_abandoned`
- `signup_started`, `signup_verified**

**Status:** Analytics are properly instrumented for key user journey tracking.

---

### Improvement #3: UI Consistency Standardized
**Confidence Level:** ✅ Verified

**Description:**  
Login and signup pages have been standardized with consistent:
- Border radii (rounded-xl, rounded-3xl)
- Padding (py-3.5)
- Button styling
- Card styling
- Shadows and spacing

**Status:** Visual consistency has been improved across authentication flows.

---

### Improvement #4: Sentry Instrumentation Fixed
**Confidence Level:** ✅ Verified

**Description:**  
File: `src/instrumentation.ts`  
Sentry instrumentation error has been fixed by wrapping imports in try-catch blocks to prevent server startup failure.

**Status:** Application can now start successfully without Sentry blocking initialization.

---

### Improvement #5: Performance Optimizations in Place
**Confidence Level:** ✅ Verified

**Description:**  
File: `next.config.ts`  
Performance optimizations are configured:
- Image optimization (WebP, AVIF formats)
- Bundle optimization (modular imports for lucide-react)
- Compression enabled
- Cache headers configured

**Status:** Performance foundation is solid.

---

## ⚪ Unknown / Cannot Verify

### Environment Variables Status
**Confidence Level:** ⚪ Unknown

**Description:**  
Cannot verify if the following required environment variables are set in production:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY` (to confirm no hardcoded fallback is used)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Recommendation:**  
Verify these are configured in Vercel production environment variables before launch.

---

## User Journey Testing Status

**Browser Testing:** ⚪ Unknown  
The dev server was started successfully on localhost:3000, but automated browser interaction is not available through the available tools. User journey testing (signup, login, search, listing creation, purchase) could not be verified through actual UI interaction.

**Code Review:** ✅ Verified  
User journey code paths have been reviewed for:
- Signup flow with email verification
- Login flow
- Search functionality with analytics tracking
- Listing creation with abuse detection
- Purchase flow

---

## Launch Recommendation

### Current Status: NOT READY FOR PRODUCTION

**Reason:**  
- 6 🔴 Critical security blockers must be addressed
- 1 🟠 High-priority issue should be addressed
- Critical security vulnerabilities (CSRF, App Check, Turnstile) pose unacceptable risk

### After Critical Issues Fixed (8-12 hours): CONDITIONALLY READY

**Status:** Can launch with caution  
- Critical security issues resolved
- Remaining issue (rate limiting fallback) is high but not critical
- Monitor closely post-launch
- Ensure environment variables are properly configured

### After All Issues Fixed (10-15 hours): READY FOR PRODUCTION

**Status:** Ready for production launch  
- All critical and high-priority issues resolved
- Strong security posture
- Good operational readiness
- Recent UX improvements provide solid user experience

---

## Recommended Implementation Order

### Phase 1: Critical Security (Must Do Before Launch) - 8-12 hours
1. **Issue #4:** Configure Turnstile environment variables (1-2 hours)
2. **Issue #1:** Remove hardcoded Firebase API key fallback (30 minutes)
3. **Issue #3:** Fix and re-enable CSRF protection (4-6 hours)
4. **Issue #2:** Enable Firebase App Check (2-4 hours)
5. **Issue #5:** Uncomment CSRF in create-listing (5 minutes)
6. **Issue #6:** Automatically resolved by Issue #3

### Phase 2: High Priority (Should Do Before Launch) - 2-3 hours
7. **Issue #7:** Fix rate limiting fallback (2-3 hours)

### Phase 3: Verification - 1-2 hours
8. Verify all environment variables are configured
9. Test critical user journeys
10. Verify analytics tracking is working

**Total Estimated Time: 11-17 hours**

---

## Post-Launch Monitoring Recommendations

1. **Set up alerts for:**
   - Error rate > 1%
   - Rate limit breaches
   - Failed webhooks
   - Abuse detection rate spikes

2. **Monitor key metrics:**
   - Daily active users
   - Listing creation rate
   - Message volume
   - Payment success rate
   - Funnel event completion rates

3. **Weekly reviews:**
   - Sentry error reports
   - Firestore usage and costs
   - Rate limit effectiveness
   - Abuse decision engine accuracy

---

## Conclusion

Sky Drop demonstrates strong fundamentals with recent improvements in UX consistency, analytics instrumentation, and performance optimization. However, **6 🔴 Critical security vulnerabilities** must be addressed before production launch.

The security issues are fundamental (CSRF disabled, App Check disabled, Turnstile bypassed) and pose unacceptable risk for a production marketplace handling payments and user data.

**Minimum work before launch:** 8-12 hours (Phase 1 - Critical Security)  
**Recommended work before launch:** 11-17 hours (Phase 1 + Phase 2 + Verification)

Once the critical security issues are resolved, Sky Drop will have a **launch readiness score of 8/10** and be ready for production deployment with confidence.

---

**Report Completed:** July 2, 2026  
**Next Review:** After Phase 1 completion
