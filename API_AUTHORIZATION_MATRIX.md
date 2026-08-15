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
| `POST /api/send-message` | Authenticated participant | Conversation/listing participant checks | Messages, offers, participant identity | Sender and new-conversation participant metadata derive from token/resolved receiver; new offers always begin `pending`; existing conversations require sender participation. |
| `POST /api/delete-listing` | Authenticated owner or administrator | Token UID/email must match listing owner; admin override is explicit | Listing deletion | Ownership is checked server-side before deletion; internal errors are logged but not returned. |
| `POST /api/submit-review` | Authenticated verified purchaser | Purchase eligibility is evaluated server-side | Review creation | Purchase-derived role/recipient checks control writes; internal errors are logged but not returned. |
| `POST /api/manage-trade-post` | Authenticated post owner | Token email must match post owner | Post status and deletion | Status changes are restricted to `live`, `sold`, `completed`, or `closed`. |
| `POST /api/mark-messages-read` | Authenticated participant | Token email must appear in message participants | Read receipts | Participants, sender, and receiver comparisons are case-insensitive. |
| `POST /api/delete-messages` | Authenticated participant | Token email must appear in message participants | Per-user conversation hiding | Participant comparisons are case-insensitive; only the caller’s hidden-inbox state is written. |
