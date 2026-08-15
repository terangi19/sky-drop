# Security Adversarial Audit 2026

## API authorization remediation — 2026-08-15

- **P0 — retired hard-coded maintenance mutation:** `POST /api/fix-misclassified-listing` accepted any authenticated user and updated a fixed listing ID. The endpoint now returns `410 Gone` without reading or mutating Firestore.
- **P0 — retired hard-coded listing disclosure:** `POST /api/audit-listing-types` returned titles and seller emails for fixed IDs to any authenticated user. The endpoint now returns `410 Gone` without querying Firestore.
- **P0 — prevented verification escalation:** `POST /api/save-profile` no longer accepts `phoneVerified` from the request. Existing server-controlled verification state is preserved only.
- **P0 — blocked demo mass assignment:** `POST /api/create-listing` no longer allowlists client-provided `isDemo` or `demoNotice`; it now applies its imported per-IP rate limit.
- **P0 — strengthened renewal controls:** `POST /api/renew-listing` requires token UID ownership, with case-insensitive legacy email fallback, renews only expired or near-expiry listings, and no longer returns raw internal errors.

Remaining review targets: message participant identity, listing deletion/review error sanitization, and mutation allowlists listed in `API_AUTHORIZATION_MATRIX.md`.
