# Security Launch Gate — Emulator Execution Evidence

**Date:** 2026-08-15 (hard relaunch)  
**Branch tested:** `main` (harness commit after this evidence record)  
**Overall verdict:** **NOT GO** — emulator Java prerequisite missing; adversarial rules suites are committed and ready but unexecuted.  
**Scope:** launch gates 1–7 and 14. This record contains execution evidence only; it does not convert static rule review into an emulator result.

## Gate results

| Gate | Result | Actual evidence |
| --- | --- | --- |
| 1 — Java / Emulator prerequisite | **BLOCKED** | `java -version` failed: `java` is not recognized. Hard relaunch tried `winget install Microsoft.OpenJDK.17 --scope user --accept-package-agreements --accept-source-agreements`. Winget found the package, downloaded, and verified the installer hash, then stalled past the 2-minute anti-stall budget with no successful install (likely MSI elevation). Process killed; `java` still absent from PATH. |
| 2 — Firestore adversarial rules (Wheedle-class A-vs-B) | **BLOCKED** | `tests/firestore-rules.test.ts` includes Wheedle-class A-vs-B coverage (user A positive control, forged create as A, direct/merge/transaction/batch cross-account listing attacks, immutable ownership, message/conversation isolation, profile privacy, admin boundary). Could not execute: Firestore emulator requires Java. |
| 3 — Storage adversarial rules (Wheedle-class A-vs-B) | **BLOCKED** | `tests/storage-rules.test.ts` covers public assets, cross-account writes, KYC/proof privacy, MIME validation, and default-deny prefixes. Could not execute: Storage emulator requires Java. |
| 4 — Combined emulator execution | **BLOCKED** | Emulator suite not run this relaunch because Java remained unavailable. Prior attempt: `npm run test:rules:emulator` exited 1 with `Error: Could not spawn \`java -version\`. Please make sure Java is installed and on your system PATH.` |
| 5 — Repeatable/CI-ready suite | **PASS (harness only)** | `package.json` scripts `test:rules` and `test:rules:emulator` present; `.github/workflows/security-rules.yml` runs emulator suite on Ubuntu with Temurin 21. Tests typecheck (`npx tsc --noEmit` exit 0). This is **not** a local emulator pass. |
| 6 — Evidence record | **PASS** | This file records the exact blocker and observed command outcomes. |
| 7 — Commit and push | **PASS (harness + BLOCKED evidence)** | Tests + this gate doc + scripts committed and pushed while overall verdict remains NOT GO. |
| 14 — Rate-limit execution | **BLOCKED** | The Firebase emulator suite does not exercise deployed rate-limit backends, and no configured runtime/test environment was available for an execution result. No rate-limit pass is claimed. |

## Commands executed (hard relaunch)

```text
java -version
# PowerShell: java is not recognized as a command.

winget install Microsoft.OpenJDK.17 --scope user --accept-package-agreements --accept-source-agreements
# Found Microsoft.OpenJDK.17 17.0.10.7
# Downloaded + Successfully verified installer hash
# Stalled >2 minutes with no completed install (anti-stall: killed)
# java still not on PATH afterward

# Skipped (Java missing):
npm run test:rules:emulator

npx tsc --noEmit --pretty false
# Exit 0 (project typecheck; no errors in rules test files)
```

## Added executable coverage (committed; pending Java)

- Firestore Wheedle-class A-vs-B: user A own-listing update positive control; user B forged create as A; direct, merge-set, transaction, and batch cross-account listing attacks; immutable seller/owner fields; message and conversation participant isolation; full-profile privacy; narrow public-config allowlist; non-admin audit/config escalation attempts.
- Storage Wheedle-class A-vs-B: anonymous and cross-UID avatar/listing uploads; public image MIME rejection; verified-owner KYC and proof-of-address writes; unverified and invalid-document rejection; cross-user sensitive-document reads/writes; default-deny prefix checks.

## Required next action

Install a JDK that provides `java` on `PATH` **without** relying on cancelled elevation (portable Temurin zip under `tools/` + session `JAVA_HOME`/`PATH`, or admin-approved winget), then rerun:

```text
npm run test:rules:emulator
```

Only if that command exits 0 may gates 2–4 move from BLOCKED to PASS. Do **not** upgrade overall verdict to GO while Java/emulator evidence is missing.

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

**Status: FAIL — production Firebase services are not enforcing App Check.**

### Evidence collected (2026-08-15)

- `vercel whoami` authenticated as the linked project owner and `vercel env ls production` confirmed that `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is configured for Production.
- `https://skydrop.co.nz/` serves a CSP that permits the Firebase App Check endpoints used by the client (`firebaseappcheck.googleapis.com` and `content-firebaseappcheck.googleapis.com`).
- Current client implementation initializes App Check only when the public reCAPTCHA key is present (`app/lib/app-check.ts`); it does not itself prove Firebase service enforcement.
- An authenticated, read-only Firebase App Check Admin API query for project number `564551137643` returned:
  - Firestore: `enforcementMode=UNENFORCED`
  - Authentication (`identitytoolkit.googleapis.com`): `enforcementMode=UNENFORCED`
  - Cloud Storage (`firebasestorage.googleapis.com`): `enforcementMode=UNENFORCED`
  - Realtime Database (`firebasedatabase.googleapis.com`): `enforcementMode=UNENFORCED`
- The registered production web app exists, but its App Check configuration endpoint returned `404`. Combined with the service results, the Vercel reCAPTCHA key is configuration presence only and must not be treated as an active protection.

### Exact blocker and required evidence

Firebase Console must register/verify the provider for the production web app, then use metrics to stage enforcement:

1. Provider registration and matching production reCAPTCHA key.
2. Enforcement state for Firestore, Storage, and any protected Firebase services.
3. App Check metrics showing valid production token traffic before enforcement.
4. A rollback owner and procedure.

No enforcement was enabled or changed. A legitimate-versus-direct request test is not meaningful while every queried service reports `UNENFORCED`; both are expected to be accepted subject to their normal credentials/rules. Enable only after valid-token metrics and rollback planning.

## Gate 10 — Rate limiting and Āwhina abuse controls

**Status: FAIL — production Upstash calls are configured but broken at runtime.**

### Production configuration evidence

- `vercel env ls production` listed both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as Production variables.
- Vercel's environment download redacts those values in this session, so a direct Redis `PING` could not be authenticated without an approved secret-access path.
- Production runtime logs from controlled requests provide stronger evidence: `/api/sky-ai`, `/api/send-message`, `/api/create-listing`, and `/api/save-profile` all logged `Upstash error, falling back to Firestore` with `TypeError: Cannot read properties of undefined (reading 'evalsha')`.
- Root cause: `rateLimitUpstash()` constructed a new limiter from the private `(rl as any).redis` field, which is undefined in the installed Upstash library version. Current `main` now retains the actual `Redis` client and supplies it directly to each route-specific limiter.
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

Do not perform a threshold-exhaustion test against production. The code fix must deploy first; then repeat one bounded request per route and verify the `evalsha` fallback warning is absent. To fully close this gate, use a non-production Upstash database and dedicated UID/IP to prove each `429` boundary and capture counter evidence without printing credentials.

## Gate 11 — CSRF classification and validation

**Status: PASS for bearer-token API architecture and deployed rejection behavior.**

### Route classification

- `/api/create-listing` and `/api/save-profile` require double-submit CSRF (`csrf_token` cookie plus `x-csrf-token`) before bearer-token verification. The cookie is `Secure`, `SameSite=Lax`, and intentionally readable by the same-origin client.
- All reviewed sensitive mutations that do not call `requireCsrf()` authenticate with an explicit Firebase `Authorization: Bearer <ID_TOKEN>` header. These are not ambient-cookie-authenticated requests, so cross-site form submission cannot supply their credential.
- `/api/auth/session` creates an `admin-session` cookie only after a verified bearer token and server-side admin authorization; no route outside its creator reads `admin-session`. It is not an ambient-cookie mutation authorization mechanism.

### Production probes

1. `GET /api/csrf` returned a 64-character token and a same value in `csrf_token`.
2. `POST /api/create-listing` and `POST /api/save-profile` with the managed cookie and matching `x-csrf-token`, but no bearer token, both returned `401 Unauthorized`. This proves CSRF passes before bearer authentication.
3. After deployment `dpl_8Z8CyzM2BEGoJaHzjVKgT4ZREhP2`, missing-token probes returned `403 {"error":"CSRF token validation failed"}` on both routes.

### Tiny corrective change

Current production maps `CsrfError` to `403` in both routes. It changes no authorization behavior and is now verified on `skydrop.co.nz`.

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
