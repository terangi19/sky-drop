# API Authorization Matrix

Last reviewed: 2026-08-15

| Route | Actor | Authorization boundary | Sensitive fields/actions | Enforcement |
| --- | --- | --- | --- | --- |
| `POST /api/create-listing` | Authenticated, verified user | Firebase token UID is the seller identity | Listing ownership, payment type, demo flags | `sellerId` and `sellerEmail` are overwritten from the token; client `isDemo`/`demoNotice` are rejected; IP rate limit, abuse decision, and verification checks apply. |
| `POST /api/save-profile` | Authenticated user | Firebase token UID selects the profile | Phone and email verification | Profile document is addressed by token UID; `phoneVerified` is retained only from existing server state and cannot be set in the request body. |
| `POST /api/renew-listing` | Authenticated listing owner | `sellerId === token.uid`, or case-insensitive legacy `sellerEmail === token.email` | Expiry and publication status | Only expired or ≤3-day-to-expiry `live` listings are renewable. Renewal restores `live` only after this state check. |
| `POST /api/fix-misclassified-listing` | None | Retired | Former hard-coded listing mutation | Always returns `410 Gone`; no listing read or write occurs. |
| `POST /api/audit-listing-types` | None | Retired | Former hard-coded cross-seller listing reads | Always returns `410 Gone`; no listing data is disclosed. |
| `POST /api/admin/*` | Administrator | `requireAdminFromRequest()` | Administrative reads and mutations | Bearer token, server-side admin role check, security logging, and admin IP rate limit are required. |
| `POST /api/send-message` | Authenticated participant | Conversation/listing participant checks | Messages, offers, participant identity | Must use token-derived identity and verify conversation/listing participation before writes. |
| `POST /api/delete-listing` | Authenticated owner or administrator | Token UID/email must match listing owner; admin override is explicit | Listing deletion | Ownership must be checked server-side before deletion; errors must not expose internals. |
