# Security Launch Gate 2026

**Execution date:** 2026-08-15  
**Executed branch:** `main`  
**Rules/CI commits:** `979bfb3`, `af37145`

## Executive verdict

**CONDITIONAL GO.** Gates 1–7 passed for the executable Firebase rules and public-profile boundaries in scope. Gate 14 now has a permanent PR/main workflow. Existing production/App Check/browser-E2E blockers later in this document still prevent an unconditional GO.

## Gate 1 — Firestore adversarial execution

**PASS.** A user-local Temurin JDK 21.0.12 was installed from the Adoptium portable ZIP at `%LOCALAPPDATA%\Programs\Temurin21`; no administrator elevation was required. Firestore and Storage emulators started and the final combined run completed successfully.

The suite executes anonymous, user A, user B, outsider user C, and admin-claim contexts against the repository rules.

## Gate 2 — Wheedle-class listing attack

**WHEEDLE_CLASS_LISTING_ATTACK = PASS (Firestore rules).**

Executed denials cover cross-account `update`, `set(..., { merge: true })`, transaction, batch, and delete attacks. Crafted changes include ordinary listing content and seller/owner substitution. Both existing cross-account tests and the added user-A/user-B fixtures ran against the Firestore emulator.

This proves the direct Firestore boundary. Genuine two-account browser/API ID-substitution remains Gate 13 and is still BLOCKED as documented below.

## Gate 3 — Ownership immutability

**PASS (Firestore rules).** The legitimate owner could not rewrite `sellerId`, `sellerEmail`, `sellerName`, `ownerId`, `userId`, or `createdBy` to user B. Existing profile/KYC privileged-field tests also executed in the same suite.

## Gate 4 — Message privacy

**PASS (Firestore rules).** An unrelated user could not read a guessed message or conversation document, inject conversation metadata, or use direct client message mutations. Existing forged-sender, participant-freezing, anonymous, and typing-isolation tests executed successfully.

## Gate 5 — Private/public profile privacy

**PASS.** Firestore denied user B access to user A's full profile containing email, phone, and KYC state. The executable public-profile regression passed a record with newly added private fields through `pickPublicProfileFields()` and proved only the explicit public allowlist was returned.

## Gate 6 — Admin escalation

**PASS (Firestore rules).** A normal user could not read/write `adminAuditLog`, read sensitive admin config, or add themselves to `config/adminEmails`. A separate authenticated `admin: true` claim context successfully exercised the intended admin path, proving the negative tests were not caused by a blanket deny.

This emulator result does not claim genuine browser/API admin-manipulation execution; that remains part of the still-BLOCKED Gate 13.

## Gate 7 — Storage adversarial suite

**PASS (Storage rules).** The emulator denied anonymous uploads, user-B writes into user-A avatar/listing/KYC/proof paths, cross-user KYC/proof reads, unverified KYC uploads, invalid MIME types, unsafe unallowlisted prefixes, and SVG/PDF content types on image-only paths. Intended public image reads and owner-only private reads succeeded.

Storage rules can validate request metadata and size, not file magic bytes, extension/content agreement, malformed image decoding, duplicate semantics, or server-generated filenames. Those controls require server upload-route tests and are not claimed by this result.

## Gate 14 — Security regression CI

**PASS.** `.github/workflows/security-rules.yml` runs on relevant pull requests, pushes to `main`, and manual dispatch. It installs Node 22 and Temurin 21, runs `npm ci`, then executes `npm run test:rules:emulator`. `firebase-tools` is a lockfile development dependency, so CI does not depend on a global CLI.

Protected regression coverage includes cross-account listing writes, ownership mutation, message participant isolation, private-profile access, public-profile leakage, admin escalation, and Storage cross-account writes.

## Exact execution evidence

```text
> npm run test:rules:emulator
> firebase emulators:exec --only firestore,storage "npm run test:rules"

> vitest run tests/firestore-rules.test.ts tests/storage-rules.test.ts tests/security-launch-gates.test.ts

Test Files  3 passed (3)
Tests       70 passed (70)
Script exited successfully (code 0)
```

```text
> npx tsc --noEmit --pretty false
Exit code: 0
```

The first elevated MSI attempt exited `1602`; it was superseded by the successful user-local portable JDK installation and is not a remaining blocker.

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

**Status: BLOCKED — production Upstash hostname is stale/deleted (DNS `ENOTFOUND`); agent cannot rotate secrets without interactive Upstash + Vercel console access.**

### How the code uses Upstash

- `app/lib/rate-limit-upstash.ts` reads `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, constructs `@upstash/redis` `Redis({ url, token })`, and runs `@upstash/ratelimit` sliding windows with prefix `sd`.
- If either env var is missing, limiters degrade immediately (`degraded: true`) and callers fall through to Firestore / in-memory (`app/lib/rate-limit.ts`).
- If env vars are present but Redis is unreachable, `rateLimitUpstash()` catches the error, logs `[rate-limit] Upstash error, falling back to Firestore:`, and returns `degraded: true` (fail-open to fallback — not distributed limiting).
- Note: startup log `[rate-limit] Upstash Redis ACTIVE` only means both env vars are set; it does **not** prove DNS/connectivity. `GET /api/security-health` (public) similarly reports overall integrity only; Upstash “active” in metrics is env-presence, not a live `PING`.

### Production configuration evidence (revalidated 2026-08-15)

- `vercel env ls` shows both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as Encrypted Production vars (age ~60d).
- `vercel env pull --environment=production` redacts both values to empty in this CLI session — secrets cannot be read or `PING`ed from the agent.
- `vercel integration ls` reports **no** linked Upstash/Redis resources on the project.
- No `UPSTASH_EMAIL` / `UPSTASH_API_KEY` in the agent environment; `@upstash/cli` requires interactive login.
- Hostname diagnosis (from runtime logs only; value never printed or committed): pattern `<db>***.upstash.io` — correct `*.upstash.io` shape, but DNS `getaddrinfo ENOTFOUND`. This is consistent with a **deleted or rotated Upstash database**, not a missing env var or the older `evalsha` client bug.

### Prior client fix (still valid)

- Commit `9528743` removed the `(rl as any).redis` / `evalsha` implementation error. Distributed limiting still fails afterward solely because the configured REST hostname does not resolve.

### Controlled production probes (2026-08-15, non-abusive)

No bearer token; no listing/message/payment mutations; no threshold exhaustion.

| Probe | Result | Runtime log (redacted) |
| --- | --- | --- |
| `GET /api/security-health` | `200 {"ok":true,"status":"DEGRADED"}` | (public payload does not include Upstash detail) |
| `POST /api/create-listing` with CSRF cookie + `x-csrf-token`, body `{}` | `401 Unauthorized` | `Upstash Redis ACTIVE` then `Upstash error, falling back to Firestore` / `ENOTFOUND <db>***.upstash.io` |
| `POST /api/send-message` body `{}` | `401 Unauthorized` | same `ENOTFOUND` fallback |

Sensitive routes still enforce via `rateLimit()` (Firestore/in-memory fallback active), not soft `frictionLimit()`:

- `/api/sky-ai`: authenticated 120 / guest 20 per 15 minutes
- `/api/awhina-vision`: authenticated 40 per user per 15 minutes
- `/api/send-message`: 25 per IP per minute
- `/api/create-listing`: 10 per IP per minute

### What was not done (and why)

- Did **not** create/link a new Upstash Redis DB: no Upstash API credentials and no Vercel Upstash integration resource.
- Did **not** overwrite Production env vars: cannot obtain a valid REST URL/token without the Upstash console (or Integration Marketplace link flow).
- Did **not** enable App Check enforcement.
- Did **not** load-test or exhaust rate-limit thresholds in production.
- Firebase CLI: session was previously revoked after accidental OAuth exposure — do **not** reuse old Firebase login tokens; re-auth only if a human explicitly needs Firebase for a separate task (not required for Gate 10).

### Human steps to unblock Gate 10 → PASS

1. Open [Upstash Console](https://console.upstash.com/) → create a **new Redis** database (or restore the intended one) in a region close to Vercel production.
2. Copy **REST URL** and **REST TOKEN** from the Upstash dashboard (do not paste into chat, git, or screenshots committed to the repo).
3. In [Vercel → sky-drop → Settings → Environment Variables](https://vercel.com/), for **Production** (and Preview if desired):
   - Update `UPSTASH_REDIS_REST_URL` to the new REST URL
   - Update `UPSTASH_REDIS_REST_TOKEN` to the new REST TOKEN
   - Optional cleaner path: Vercel Marketplace → add **Upstash** integration and let it set these vars, then remove any stale manual duplicates.
4. **Redeploy** production (env changes do not apply to already-running serverless isolates until a new deployment).
5. Verify with **one** bounded request each (no threshold test), e.g. CSRF + `POST /api/create-listing` `{}` expecting `401`, and `POST /api/send-message` `{}` expecting `401`.
6. In `vercel logs skydrop.co.nz --expand --query "rate-limit"` confirm:
   - Present: `[rate-limit] Upstash Redis ACTIVE`
   - **Absent**: `falling back to Firestore`, `ENOTFOUND`, `fetch failed`
7. Optional: admin `GET /api/security-health` with a valid admin bearer — overall should move off Upstash-related degradation once connectivity is real (today’s public `DEGRADED` may also reflect other subsystems).
8. Re-mark this gate **PASS** only after step 6 evidence is captured (redact hostnames; never commit secrets).

Until steps 1–6 complete, production rate limiting remains **Firestore + in-memory fallback**, not distributed Upstash.

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
