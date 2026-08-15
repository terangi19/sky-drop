# Security Launch Gate — Emulator Execution Evidence

**Date:** 2026-08-15  
**Branch tested:** `main` at `f70b00749ba8c0615bef07e217e219869575097f`  
**Scope:** launch gates 1–7 and 14. This record contains execution evidence only; it does not convert static rule review into an emulator result.

## Gate results

| Gate | Result | Actual evidence |
| --- | --- | --- |
| 1 — Java / Emulator prerequisite | **BLOCKED** | `java -version` failed: `java` is not recognized. `winget install --id Microsoft.OpenJDK.21 --exact --accept-package-agreements --accept-source-agreements` downloaded and verified the JDK installer, then required elevation and exited `1602` after the elevation prompt was cancelled. |
| 2 — Firestore adversarial rules | **BLOCKED** | Expanded `tests/firestore-rules.test.ts` covers anonymous, user A, user B, and admin-boundary attacks, but could not execute because the Firestore emulator could not start without Java. |
| 3 — Storage adversarial rules | **BLOCKED** | Added `tests/storage-rules.test.ts` for public assets, cross-account writes, KYC/proof privacy, and MIME validation, but could not execute because the Storage emulator could not start without Java. |
| 4 — Combined emulator execution | **BLOCKED** | `npm run test:rules:emulator` exited 1 before either emulator started: `Error: Could not spawn \`java -version\`. Please make sure Java is installed and on your system PATH.` |
| 5 — Repeatable/CI-ready suite | **PASS (harness only)** | Added `test:rules` and `test:rules:emulator`; `npx tsc --noEmit --pretty false` exited 0 after the test additions. This is not an emulator pass. |
| 6 — Evidence record | **PASS** | This file records the exact blocker and observed command outcomes. |
| 7 — Commit and push | **BLOCKED** | No commit or push was made because the emulator tests did not genuinely pass. |
| 14 — Rate-limit execution | **BLOCKED** | The Firebase emulator suite does not exercise deployed rate-limit backends, and no configured runtime/test environment was available for an execution result. No rate-limit pass is claimed. |

## Commands executed

```text
java -version
# PowerShell: java is not recognized as a command.

winget install --id Microsoft.OpenJDK.21 --exact --accept-package-agreements --accept-source-agreements
# Installer download/hash verification succeeded.
# Elevation was required; installation exited 1602 after the elevation prompt was cancelled.

npx firebase emulators:exec --only firestore,storage "npx vitest run tests/firestore-rules.test.ts"
# Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.

npm run test:rules:emulator
# Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.

npx tsc --noEmit --pretty false
# Exit 0
```

## Added executable coverage (pending Java)

- Firestore: direct, merge-set, transaction, and batch cross-account listing attacks; immutable seller/owner fields; message and conversation participant isolation; full-profile privacy; narrow public-config allowlist; non-admin audit/config escalation attempts.
- Storage: anonymous and cross-UID avatar/listing uploads; public image MIME rejection; verified-owner KYC and proof-of-address writes; unverified and invalid-document rejection; cross-user sensitive-document reads/writes; default-deny prefix checks.

## Required next action

Install a JDK that provides `java` on `PATH` (the attempted Microsoft OpenJDK installer requires local administrator approval), then rerun:

```text
npm run test:rules:emulator
```

Only if that command exits 0 should the test infrastructure and this evidence record be committed and pushed.
# Security Launch Gate 2026

## Gate 8 — Production dependency audit

**Audit date:** 2026-08-15  
**Command:** `npm audit --omit=dev --json`  
**Scope:** production dependency graph only. Audit JSON was written to the local temporary directory for inspection; no credentials or environment values were read or printed.

### Exact results

| Run | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before targeted remediation | 1 | 8 | 19 | 0 | 28 |
| After targeted remediation | 0 | 1 | 10 | 0 | 11 |

### Remediation applied

- Upgraded direct `next` from `16.2.9` (manifest range `^16.2.6`) to pinned `16.3.1`.
- Added narrow npm overrides, all non-breaking patched releases: `brace-expansion@5.0.9`, `fast-uri@3.1.5`, `undici@6.28.0`, and `websocket-driver@0.7.5`.
- Regenerated `package-lock.json` with `npm install --ignore-scripts`. No `npm audit fix --force` and no broad dependency upgrade was used.

### Critical/high classification

| Package | Before | Classification | Evidence |
| --- | --- | --- | --- |
| `websocket-driver` | Critical | FIXED | The production lockfile path was `firebase -> @firebase/database -> faye-websocket -> websocket-driver@0.7.4`; an override now resolves `0.7.5`. |
| `next` | High | FIXED | Direct production dependency upgraded from `16.2.9` to `16.3.1`, outside the audited affected range. Its affected nested `postcss`, `nanoid`, and optional `sharp` findings also cleared. |
| `postcss` | High | FIXED | It was nested under Next (`next@16.2.9 -> postcss@8.4.31`); upgrading Next removed the affected nested version. |
| `nanoid` | High | FIXED | It was nested under Next's affected PostCSS path; upgrading Next removed the affected `3.3.12`. |
| `sharp` | High | FIXED | It was Next's optional production image dependency; upgrading Next resolved it to a non-affected release. |
| `undici` | High | FIXED | Firebase Auth/Firestore/Functions/Storage resolved `undici@6.19.7`; the lockfile now uses override `6.28.0`. Those Firebase modules are imported by the application, so this was treated as production-reachable. |
| `brace-expansion` | High | FIXED | The audited path was `@sentry/nextjs -> @sentry/bundler-plugin-core -> glob -> minimatch -> brace-expansion@5.0.6`; override resolves `5.0.9`. The path is build-plugin tooling, not request-runtime code, but was still remediated because it is installed in the production graph. |
| `fast-uri` | High | FIXED | The audited path was Sentry's webpack build-plugin chain (`webpack -> schema-utils -> ajv -> fast-uri@3.1.2`); override resolves `3.1.5`. It is build-only, but was remediated as installed production-graph tooling. |
| `nodemailer` | High | ACCEPTED TEMPORARY RISK | Direct server dependency remains at `8.0.11`. `npm audit` identifies its remediation only as `nodemailer@9.0.5` (semver-major). Upgrade requires mail transport/API compatibility testing and is not included in this minimal dependency-only change. |

### Remaining accepted risk

- `nodemailer@8.0.11`: one high finding remains. It is server-reachable through the application's email routes, so it is not classified as dev-only or not reachable. The Gate 8 owner must schedule and compatibility-test the major `9.0.5` migration before broad launch.

### Verification

- `npm audit --omit=dev --json` after remediation: 0 critical, 1 high, 10 moderate, 0 low, 11 total.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed, including the project's drift check. The build reported only pre-existing optional Turnstile environment-variable warnings.

## Gate 9 — Firebase App Check production enforcement

**Status: BLOCKED — enforcement cannot be attested with the available access.**

### Evidence collected (2026-08-15)

- `vercel whoami` authenticated as the linked project owner and `vercel env ls production` confirmed that `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is configured for Production.
- `https://skydrop.co.nz/` serves a CSP that permits the Firebase App Check endpoints used by the client (`firebaseappcheck.googleapis.com` and `content-firebaseappcheck.googleapis.com`).
- Current client implementation initializes App Check only when the public reCAPTCHA key is present (`app/lib/app-check.ts`); it does not itself prove Firebase service enforcement.
- The local Firebase CLI is authenticated for project `sky-drop-de459`, but does not expose App Check inspection commands. Google Cloud CLI/OAuth credentials required to inspect the App Check Admin API are not installed. An unauthenticated direct App Check API query was not a valid enforcement check and returned `404`.

### Exact blocker and required evidence

Firebase Console (or an account with Firebase App Check Admin/API read permission plus a valid project-number query) must confirm, per registered web app:

1. Provider registration and matching production reCAPTCHA key.
2. Enforcement state for Firestore, Storage, and any protected Firebase services.
3. App Check metrics showing valid production token traffic before enforcement.
4. A rollback owner and procedure.

No enforcement was enabled or changed. A direct-versus-legitimate Firebase request test was not run: attempting it without the console state and a dedicated test identity could alter service behavior or create misleading failures.

## Gate 10 — Rate limiting and Āwhina abuse controls

**Status: PARTIAL / BLOCKED for distributed-production attestation.**

### Production configuration evidence

- `vercel env ls production` listed both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as Production variables.
- Vercel's environment download redacts those values in this session, so a Redis `PING` cannot be authenticated without exposing/retrieving a secret through an approved secret-access path. Therefore, this gate does not claim Upstash reachability or runtime use.
- Current code selects Upstash first when configured, then Firestore, then in-memory fallback (`app/lib/rate-limit.ts`). The sensitive routes below use the enforcing `rateLimit()` primitive, not the soft `frictionLimit()` primitive:
  - `/api/sky-ai`: authenticated 120 / guest 20 per 15 minutes.
  - `/api/awhina-vision`: authenticated 40 per user per 15 minutes.
  - `/api/send-message`: 25 per IP per minute.
  - `/api/create-listing`: 10 per IP per minute.

### Controlled production probes

All requests below used no bearer token and `{}` or a bounded navigation-only text payload; no listing, message, image analysis, or payment mutation was attempted.

| Command form | Result |
| --- | --- |
| `POST /api/awhina-vision` without authorization | `401 {"code":"auth_required"}` |
| `POST /api/send-message` without authorization | `401 {"error":"Unauthorized"}` |
| `POST /api/create-listing` with valid CSRF token but no bearer token | `401 {"error":"Unauthorized"}` |
| Two `POST /api/sky-ai` guest navigation probes | Both `401`, `source:"rules"`, `awhina.routing:"guest_auth_gate"`, `avoidedAi:true` |

### Remaining blocker

Do not perform a threshold-exhaustion test against production. To close this gate, run a dedicated staging/production-equivalent test using a non-production Upstash database and a dedicated test UID/IP, prove the `429` boundary for every listed namespace, and capture the Upstash `PING` plus counter evidence without printing credentials.

## Gate 11 — CSRF classification and validation

**Status: PASS for bearer-token API architecture; production response-code fix pending deployment.**

### Route classification

- `/api/create-listing` and `/api/save-profile` require double-submit CSRF (`csrf_token` cookie plus `x-csrf-token`) before bearer-token verification. The cookie is `Secure`, `SameSite=Lax`, and intentionally readable by the same-origin client.
- All reviewed sensitive mutations that do not call `requireCsrf()` authenticate with an explicit Firebase `Authorization: Bearer <ID_TOKEN>` header. These are not ambient-cookie-authenticated requests, so cross-site form submission cannot supply their credential.
- `/api/auth/session` creates an `admin-session` cookie only after a verified bearer token and server-side admin authorization; no route outside its creator reads `admin-session`. It is not an ambient-cookie mutation authorization mechanism.

### Production probes

1. `GET /api/csrf` returned a 64-character token and a same value in `csrf_token`.
2. `POST /api/create-listing` and `POST /api/save-profile` with the managed cookie and matching `x-csrf-token`, but no bearer token, both returned `401 Unauthorized`. This proves CSRF passes before bearer authentication.
3. Missing-token probes were rejected before a mutation. Current deployed revision returned `500` for that expected rejection, which is a response-semantics bug rather than a CSRF bypass.

### Tiny corrective change

Current `main` now maps `CsrfError` to `403` in both routes. It changes no authorization behavior; deployment is still required before the production probe can show `403`.

## Gate 12 — Deployed response headers

**Status: PASS WITH COMPATIBILITY CONSTRAINTS.**

**Command:** `Invoke-WebRequest -Uri https://skydrop.co.nz/ -Method Head -MaximumRedirection 5`

| Header | Deployed value / result |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=(), payment=(self "https://*.stripe.com")` |
| `Content-Security-Policy` | Present; restricts defaults to self and permits explicit Stripe/Firebase/reCAPTCHA/Turnstile/analytics origins |

Compatibility constraints: deployed CSP retains `'unsafe-inline'` for scripts/styles, required by the current Next/third-party integration surface. It did **not** include `'unsafe-eval'` in production. `X-Frame-Options: SAMEORIGIN` permits same-origin embedding; migrate to CSP `frame-ancestors` if a stricter embedding policy is required.

## Gate 13 — Two-account genuine browser E2E

**Status: BLOCKED — no safe pair of distinct test credentials is available to this session.**

`vercel env ls production` shows a single test credential pair (`NEXT_PUBLIC_TEST_EMAIL`, `NEXT_PUBLIC_TEST_PASSWORD`). The values are redacted when downloaded through the available CLI, and no `*_2`/second-account credential variables exist. No login, mocked-auth test, account provisioning, or cross-account operation was performed.

To close this gate, provide two dedicated non-admin Firebase test accounts through an approved secret-injection path, then run browser E2E for: user A creates a disposable listing; user B attempts unauthorized update/delete, sends an authorized message, and attempts forbidden access to A's protected data; finally clean up the listing and conversation through authorized APIs.
