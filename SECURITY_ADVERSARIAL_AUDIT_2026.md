# Security Adversarial Audit 2026 — Current `main`

**Audit date:** 2026-08-15
**Scope:** current `main` code/rules, the remediation commits listed below, local static analysis, TypeScript, production build, `npm audit --omit=dev`, and a non-disclosing tracked-file secret-pattern scan. This is not a penetration test or production configuration attestation.

## 1. Executive verdict

## CONDITIONAL GO

The reviewed P0 application authorization defects are remediated in current code and no remaining critical cross-account bypass was identified by this audit's code/rules analysis. A limited public launch is reasonable only with explicit operational acceptance of the conditions below:

1. Firestore and Storage rules tests were **not executed** because Java is unavailable locally, so their existing negative tests remain unverified against an emulator.
2. Firebase App Check is optional client initialization, not demonstrated as enforced for Firebase services or server APIs.
3. CSRF enforcement is present only on `/api/create-listing` and `/api/save-profile`; other bearer-token routes are not ambient-cookie authenticated, but cookie/session mutation coverage has not been completed route by route.
4. Upstash configuration is environment-dependent and was not verified. Fallback mode can be weaker during multi-instance traffic.
5. `npm audit --omit=dev` reports **1 critical, 8 high, and 19 moderate** production dependency findings. Upgrade/remediation work is required before a broad launch.

## 2. P0 vulnerabilities discovered

### Fixed

- **Hard-coded maintenance mutation:** `POST /api/fix-misclassified-listing` allowed an authenticated caller to mutate a fixed listing. It now returns `410 Gone` without a Firestore read/write (`c51995d`).
- **Hard-coded listing disclosure:** `POST /api/audit-listing-types` exposed titles and seller emails for fixed IDs to authenticated callers. It now returns `410 Gone` without a Firestore query (`c51995d`).
- **Profile verification escalation:** `POST /api/save-profile` accepted `phoneVerified` from the request. Server-controlled verification state is now preserved instead (`c51995d`).
- **Listing mass assignment:** `POST /api/create-listing` no longer accepts client-controlled `isDemo` or `demoNotice`, derives seller identity from the token, and applies its imported limit (`c51995d`).
- **Listing renewal authorization/state bypass:** `/api/renew-listing` now checks UID ownership (with a case-insensitive legacy email fallback) and only renews expired/near-expiry live listings (`c51995d`).
- **Firestore client privilege escalation:** profile, KYC, listing, conversation, message, purchase, and related rules were hardened against client-side privileged writes and identity transfer (`ec3788a`, `392ee91`).

### Remaining

- **None identified by code/rules analysis.** This conclusion is conditional on emulator execution; it is not an executed cross-account attack result.

## 3. P1 vulnerabilities discovered

### Fixed

- Listing deletion and review submission no longer expose raw internal failures.
- Trade-post state changes are allowlisted.
- New message conversations and offer state derive sensitive identity/status server-side; offers begin `pending`.
- Message-related participant comparisons were hardened in the reviewed mutation endpoints.
- Āwhina routes no longer trust a client `isAdmin` flag and use verified token/server role resolution.
- Image upload validation now checks exact MIME type, magic bytes, active-content markers, size, and server-derived object names (`3908446`, `f595a41`).

### Remaining

- Production dependency findings remain open: 1 critical, 8 high, and 19 moderate. The critical finding is transitive; this report does not claim exploitability in Sky Drop without a dependency-path/runtime review.
- Authorization coverage is a reviewed matrix rather than a complete executed test suite for every mutation route.
- Public-profile lookup accepts email as a lookup input but returns an allowlisted profile projection; privacy behavior needs production/API regression coverage.

## 4. Cross-account test matrix

| Boundary | Evidence | Status | Result |
| --- | --- | --- | --- |
| Listing create / seller identity | `firestore.rules` requires authenticated seller identity; `/api/create-listing` overwrites seller identity from token | ANALYSIS_ONLY | No client-selected seller identity path identified |
| Listing update/delete/renew | Rules seller checks; `/api/delete-listing` and `/api/renew-listing` server ownership checks | ANALYSIS_ONLY | No reviewed cross-account mutation path identified |
| Profile / KYC privilege fields | Rules constrain profile creation/updates and pending KYC state; `/api/save-profile` preserves `phoneVerified` | ANALYSIS_ONLY | Privilege escalation blocked by reviewed controls |
| Messages / conversations | Rules restrict reads to participants and disable direct client writes; `/api/send-message` derives sender/receiver | ANALYSIS_ONLY | Participant boundary enforced by reviewed controls |
| Purchases / reviews | Rules deny direct purchase/review creation and constrain reads/updates | ANALYSIS_ONLY | Server-mediated integrity boundary present |
| Admin operations | `/api/admin/*` uses bearer verification plus `requireAdminFromRequest()` | ANALYSIS_ONLY | Non-admin role denied by reviewed helper |
| Storage owner paths | `storage.rules` binds avatar/banner/listing/KYC/proof/resume writes to `request.auth.uid == userId` | ANALYSIS_ONLY | Cross-user path write is denied by rule logic |

`tests/firestore-rules.test.ts` contains relevant negative cases, including listing deletion, message/conversation privacy, profile/KYC escalation, and ownership transfer. They were not run because the Firestore emulator requires Java and Java is unavailable on this machine.

## 5. API authorization matrix

See [API_AUTHORIZATION_MATRIX.md](API_AUTHORIZATION_MATRIX.md). It records the reviewed high-risk mutation/admin routes, actors, authorization boundaries, and server-side enforcement. It is evidence for the routes listed there, not a claim that every API route has an executed authorization test.

## 6. Firestore rules test results

**ANALYSIS_ONLY / NOT EXECUTED.** The repository has `tests/firestore-rules.test.ts` using `@firebase/rules-unit-testing`. Local execution was blocked because `java` is not installed. Static review found default deny, participant-scoped message/conversation reads, server-only message/purchase/review writes, owner-scoped profile data, and an explicit final deny.

## 7. Storage rules test results

**ANALYSIS_ONLY / NOT EXECUTED.** No Storage emulator test file currently exists. Static review found default deny; public reads only for intended public image paths; UID-bound writes for avatar, banner, listing, KYC, proof-of-address, and resume objects; and metadata-based access for digital assets. Add emulator negative tests for cross-UID writes and cross-user sensitive-document reads before broad launch.

## 8. Messaging privacy result

**CONDITIONAL PASS (analysis).** Firestore direct message writes are server-only, and reads require the authenticated email to be in `participants`. Conversation reads are participant-scoped and direct writes/deletes are denied. `/api/send-message` verifies a bearer token, derives sender identity, resolves the receiver server-side, and rejects existing-conversation access by non-participants. Emulator and route-level cross-account tests remain unexecuted.

## 9. Public-profile privacy result

**CONDITIONAL PASS (analysis).** Direct Firestore profile reads are owner-only. Public APIs use `pickPublicProfileFields()` to return an allowlist rather than the complete profile document. The allowlist intentionally includes public trust/verification indicators; it excludes email, phone, address, bank, KYC documents, and risk fields. Add API regression tests for omitted private fields.

## 10. Listing integrity result

**CONDITIONAL PASS (analysis).** Listing client rules bind seller identity and prevent ownership-field transfer. The listing API derives seller identity from the verified token and blocks demo-field mass assignment. Delete and renewal routes perform server-side ownership checks. The listed controls need emulator/API execution before a full launch claim.

## 11. Admin authorization result

**CONDITIONAL PASS (analysis).** Reviewed `/api/admin/*` routes use `requireAdminFromRequest()`: bearer token validation, `isAdminUser(email, uid)`, IP rate limiting, and security logging. The helper provides server-side enforcement; client `isAdminEmail()` checks are presentation-only and must not be treated as authorization. Non-`/api/admin` privileged endpoints remain a continuing inventory/review obligation.

## 12. Secret scan result

**PASS WITH SCOPE LIMIT.** A tracked-file pattern scan for common live cloud/payment/webhook keys and private-key headers found no match outside excluded generated/temporary artifacts; values were not printed. A git-history filename skim found environment template/audit/documentation references, not a value scan of every historical blob. This is not a replacement for Gitleaks/GitHub secret scanning and cannot establish that production secrets were never exposed.

## 13. Āwhina abuse result

**CONDITIONAL PASS (analysis).** `/api/sky-ai` applies 120 authenticated / 20 guest requests per 15 minutes. `/api/awhina-ai` uses 80 authenticated / 15 guest; `/api/awhina-intent` requires authentication and limits 80 per user; `/api/awhina-vision` requires authentication and limits 40 per user. Guest deterministic assistance remains allowed where designed, while OpenAI/tool/photo execution requires authentication. Admin identity is server-derived. No load, cost, or bypass test was executed.

## 14. Rate-limit result

**CONDITIONAL PASS (analysis).** Reviewed sensitive routes call the enforcing `rateLimit()` primitive. It uses Upstash when configured, then Firestore, then in-memory fallback. Configuration was not verified; the fallback can be weaker under concurrent multi-instance load. `frictionLimit()` intentionally returns `allowed: true` after a limit breach and must not be used where a hard denial is required; the reviewed Āwhina spend routes use hard limits instead.

## 15. App Check current status

**NOT ENFORCED/UNVERIFIED.** Client code initializes Firebase App Check only when `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is configured and can disable it by environment. This audit did not verify Firebase Console registration, service enforcement, token validation on APIs, or production coverage. Treat App Check as a rollout item, not a present security guarantee.

## 16. CSRF current status

**PARTIAL.** Double-submit token validation exists and is required by `/api/create-listing` and `/api/save-profile`. The CSRF cookie is `Secure` in production and `SameSite=Lax`, but is JavaScript-readable by design. Most API mutations use explicit bearer tokens rather than ambient cookie authentication; nevertheless, cookie/session-mutating routes need a complete inventory and enforcement decision before broad launch.

## 17. Security headers

**PRESENT (configuration analysis).** `next.config.ts` sets HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a CSP. The CSP retains `'unsafe-inline'` and conditionally permits `'unsafe-eval'`; it is mitigation, not a strict XSS guarantee. Production header capture was not performed.

## 18. Dependency findings

**OPEN RELEASE CONDITION.** `npm audit --omit=dev` completed with:

- Critical: 1
- High: 8
- Moderate: 19
- Low: 0
- Total: 28

Findings include direct `dompurify` and multiple transitive packages (including Firebase/Admin dependency paths). The audit output indicates fixes are available for some paths, with some requiring a major `firebase-admin` update. Do not use `npm audit fix --force` without compatibility testing; create a dependency remediation branch and retest the application.

## 19. Fixes made

- `c51995d` — Harden critical listing API authorization.
- `3908446` — Harden remaining mutation API authorization.
- `ec3788a` — Harden Firestore client write rules.
- `392ee91` — Correct Firestore profile escalation regression.
- `f595a41` — Harden Āwhina AI spend and image uploads.

This audit report itself records verification evidence only; it does not claim an additional application security fix.

## 20. Remaining risks and launch gates

1. Install Java and run Firestore plus new Storage emulator negative tests against deployed-equivalent rules.
2. Resolve or formally risk-accept the 1 critical / 8 high production dependency findings; prioritize direct and runtime-reachable paths.
3. Verify Upstash credentials, Redis reachability, alerting, and fail behavior in the production deployment.
4. Complete an App Check rollout: provider registration, client token coverage, Firebase service enforcement, API validation where required, dashboards, and rollback plan.
5. Finish CSRF route inventory for cookie/session mutation paths.
6. Execute two-account API tests for all high-risk mutations, especially payment, purchase, dispute, listing, messaging, notification, and admin-adjacent routes.
7. Add production API regression tests confirming public-profile responses never include private account data.
