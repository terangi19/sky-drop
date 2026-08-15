# Security Adversarial Audit 2026

## API authorization remediation — 2026-08-15

- **P0 — retired hard-coded maintenance mutation:** `POST /api/fix-misclassified-listing` accepted any authenticated user and updated a fixed listing ID. The endpoint now returns `410 Gone` without reading or mutating Firestore.
- **P0 — retired hard-coded listing disclosure:** `POST /api/audit-listing-types` returned titles and seller emails for fixed IDs to any authenticated user. The endpoint now returns `410 Gone` without querying Firestore.
- **P0 — prevented verification escalation:** `POST /api/save-profile` no longer accepts `phoneVerified` from the request. Existing server-controlled verification state is preserved only.
- **P0 — blocked demo mass assignment:** `POST /api/create-listing` no longer allowlists client-provided `isDemo` or `demoNotice`; it now applies its imported per-IP rate limit.
- **P0 — strengthened renewal controls:** `POST /api/renew-listing` requires token UID ownership, with case-insensitive legacy email fallback, renews only expired or near-expiry listings, and no longer returns raw internal errors.
- **P1 — reduced mutation and disclosure risk:** Listing deletion and review submission now return generic server errors; trade post states are allowlisted; message-created conversations and offers derive sensitive state server-side; and message participant checks now case-fold email addresses.

Remaining review targets: comprehensive authorization tests for all mutation routes, server-side listing metadata resolution when starting messages, and the remaining routes listed in `API_AUTHORIZATION_MATRIX.md`.

## Āwhina AI spend controls — 2026-08-15

- `/api/sky-ai` now uses an enforcing rate limit (120 authenticated or 20 guest requests per 15 minutes). Guests retain deterministic text help, but photo analysis and free-form OpenAI execution require a valid Firebase Bearer token.
- `/api/awhina-vision` now requires a valid Firebase Bearer token and hard-denies after 40 requests per user per 15 minutes.
- `/api/awhina-ai` now hard-denies after 80 authenticated or 15 guest requests per 15 minutes. Guests may receive deterministic local responses only; OpenAI and tool execution require authentication.
- `/api/awhina-intent` now requires authentication and hard-denies after 80 requests per user per 15 minutes.
- `/api/awhina-ai` and `/api/awhina-intent` ignore client-provided `isAdmin`; admin status is derived server-side from the verified token through `isAdminUser`.
- `frictionLimit` remains a soft-friction primitive that intentionally returns `allowed: true` after its underlying limit is exceeded. AI spend routes no longer use it.

## Listing image upload hardening — 2026-08-15

- `/api/upload-listing-image` accepts only JPEG, PNG, WebP, and GIF with exact MIME allowlisting and matching magic bytes.
- WebP validation checks both the RIFF container and `WEBP` subtype. Active HTML/SVG/script markers are rejected even when appended to an otherwise valid image.
- Upload and thumbnail limits are aligned at 10 MB, and server-generated storage names use only verified UID, timestamp, bounded numeric index, and MIME-derived extension.

## Remaining platform security status

- CSRF was not expanded blindly in this pass. Bearer-token API routes are not ambient-cookie authenticated; cookie-session mutating routes still require a separate route-by-route CSRF review.
- Firebase App Check is not enabled server-wide. Rollout remains open pending client coverage, monitoring, and a safe enforcement plan that will not break production clients.
- In-memory/Firestore rate limiting is weaker than distributed enforcement during multi-instance traffic. Production should keep Upstash configured and monitored.
