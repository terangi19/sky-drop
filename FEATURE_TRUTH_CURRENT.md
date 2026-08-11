# FEATURE TRUTH — CURRENT MAIN

**Source of truth:** `main` @ audit time (post-fix commit below).  
**Historical audits** (`FUNCTIONAL_AUDIT_REPORT`, `FEATURE_VERIFICATION_AUDIT`, etc.) are clues only.

**Statuses:** `WORKING` requires UI → handler → backend/data → persisted/observable result → feedback → test or live E2E. Unit-only ≠ WORKING.

**Env (local `.env.local`):**
- `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=false` / `STRIPE_CHECKOUT_ENABLED=false`
- `NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED=true` / `AWHINA_VISION_LISTINGS_ENABLED=true`

---

## CORE V1 — WORKING (code-traced; E2E partial)

| Feature | Visible UI? | Route/component | Backend/API/data | Persistence? | E2E path? | Real test? | Prod-safe? | Status | Issue |
|---|---|---|---|---|---|---|---|---|---|
| Auth login/signup | Y | `/login`, `/signup` | Firebase Auth + `/api/auth/session` | Y | smoke/auth | PARTIAL | Y | WORKING* | *Env/auth credentials limit full E2E |
| Sell text → fill | Y | `/post/ai`, SkyAi | `/api/sky-ai` | draft/local + publish | awhina vitest | Y (597) | Y | WORKING | Live browser E2E UNVERIFIED this run |
| Sell types Physical/Vehicle/Service/Rental/Wanted | Y | type chips | create-listing | Y | unit + UI | Y | Y | WORKING | Canonical in `listing-type-config` |
| Vision photo sell | Y (flag) | post/ai + bubble | `/api/awhina-vision` | Y | awhina-vision tests | Y | Y if flags on | WORKING* | Requires both public+server vision flags |
| Browse/search | Y | `/`, `/search`, category pages | Firestore listings | Y | smoke | PARTIAL | Y | WORKING | Filters client-side on loaded listings |
| Listing detail Message Seller | Y | `/post/listing/[id]` | `/api/send-message` | Y | prior E2E scripts | PARTIAL | Y | WORKING | V1 primary CTA when Stripe off |
| Arrange Purchase API | hidden V1 | modal gated | `/api/arrange-purchase` | Y | unit | Y | Y | DORMANT_INTENTIONAL UI | Stripe-off → Message path; modal not opened |
| Watchlist | Y | `/watchlist`, cards | `users/{uid}/watchlist` + LS | Y | code path | PARTIAL | Y | WORKING | Dual local+Firestore |
| Messages | Y | `/messages` | send-message API | Y | unread APIs | PARTIAL | Y | WORKING | Nav single Messages entry |
| Profile + settings save | Y | `/profile`, `/profile/settings` | `/api/save-profile` | Y | prefs unit | Y | Y | WORKING | notif prefs enforced in create-notification |
| Notifications prefs | Y | settings toggles | profiles + create-notification | Y | notification-prefs.test | Y | Y | WORKING | Email route does not re-check prefs (callers) |
| Follow / Following | Y | profile tab | `/api/follow`, followers | Y | code | PARTIAL | Y | WORKING | |
| Āwhina suite (local) | — | lib + route | decision/canonical | — | `npm run test:awhina` | **597 pass** | Y | WORKING | Live prod E2E UNVERIFIED |

\*WORKING for code path; full multi-user live proof marked PARTIAL/UNVERIFIED where noted.

---

## BROKEN / PARTIAL (fixed or remaining)

| Feature | Visible UI? | Route/component | Backend | Status | Severity | Root cause | Action taken / recommend |
|---|---|---|---|---|---|---|---|
| `/digital` 404 | Linked | was missing page | digital listings still valid type | was BROKEN | P0 | Page deleted; links/sitemap/Āwhina kept | **Fixed:** `app/digital/page.tsx` + browse config |
| Promote / Boost visible with Stripe off | was Y | listing detail, home, my listings | `/api/create-bump-intent` Stripe | was UI_ONLY | P0 | Stripe bump UI not gated | **Fixed:** hide when checkout UI off; API 403 |
| Make Offer / Bid Now with Stripe off | was Y on some CTAs | listing detail | offers/auctions APIs | was UI_ONLY leak | P0 | acceptOffers/auction UI not fully gated | **Fixed:** secondary CTA grid + offers gated |
| Type guide claimed Digital | Y | post/ai modal | digital not in sell chips | was misleading | P1 | Stale guide copy | **Fixed:** Digital card removed |
| Navbar Property | was Y | Browse menu | `/property` legacy | was nav leak | P1 | Property not in CANONICAL types | **Fixed:** removed from Browse menu |
| Description composition | Y | post/ai | Āwhina fill | UNVERIFIED / concurrent | — | Another agent may be editing | Do not heavy-rewrite; note only |
| Smoke Playwright suite | — | tests/smoke | — | STALE→updated | — | Logo hidden variant; How It Works; menu aria | **Updated** smoke + `tests/v1/` |

---

## VISIBLE BUT NOT WORKING (before fix → after)

| Item | Before | After |
|---|---|---|
| Promote / Boost | Visible, payment fails | Hidden when Stripe UI off |
| Make Offer (legacy acceptOffers) | Could show | Hidden when Stripe UI off |
| Bid Now (legacy auction listings) | Could show | Hidden when Stripe UI off |
| `/digital` | 404 | Browse page loads |

---

## BACKEND ONLY

| Feature | Decision | Notes |
|---|---|---|
| Auto-matching (`sky-ai-matchmaking`, `/api/matchmaking-events`) | **B dormant** | `MatchmakingActivity` exists but **not mounted** in layout |
| Saved searches | **A wire (local)** | Homepage bookmark → localStorage + optional Firestore; no auto-alert product UI |
| Radar matches API | **B dormant** | No primary nav CTA |
| Seller insights API | Admin/dashboard niche | Keep |

---

## INTENTIONALLY DORMANT (keep code; UI hidden / soft-blocked)

| System | UI | API |
|---|---|---|
| Stripe Checkout / Buy Now | Hidden (`NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED`) | Server `STRIPE_CHECKOUT_ENABLED` fail-closed |
| Offers product | Hidden on sell form; gated on detail | accept-offer / pay-offer remain |
| Auctions / bids | Not in V1 sell; gated on detail | place-bid, cron expire |
| Jobs / Events / Property-for-sale | Browse routes exist; not in sell chips / Browse menu | create-listing still accepts legacy types |
| Digital sell flow | Not in sell chips; browse-only | create-listing digital rules remain |
| KYC / disputes / sponsorship / bump | Admin or flag-gated | submit-kyc, open-dispute, sponsor-drop, create-bump-intent |
| Trade feed / opportunities | Not in primary nav | Pages remain |

---

## LEGACY / DEAD

| Item | Notes |
|---|---|
| `FEATURE_FLAGS.OPTIMIZED_NAVBAR` | Rollout helper; not product feature |
| Client `dev-auth` mock | Dev only |
| Historical audit MD files | Not truth |

---

## UNVERIFIED (this run)

| Item | Why |
|---|---|
| Full buyer↔seller Arrange Purchase live | Stripe off; message path preferred — multi-user not executed here |
| Prod vision flag state | Local true; prod may differ |
| Playwright full suite | Dev server page crashes / env flakiness; smoke updated; classify many failures ENV/STALE |
| Reviews eligibility end-to-end | Code present; not live-proved |
| Hard-refresh draft persistence on /post/ai | Concurrent description work — not re-audited deeply |

---

## Feature flags inventory

| Flag | Role |
|---|---|
| `STRIPE_CHECKOUT_ENABLED` | Server authority for charges |
| `NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED` | UI visibility only |
| `AWHINA_VISION_LISTINGS_ENABLED` | Server vision authority |
| `NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED` | Vision UI |
| `NEXT_PUBLIC_DEMO_LISTINGS_ENABLED` | Demo listings |

---

## Route inventory (summary)

| Class | Examples |
|---|---|
| PUBLIC | `/`, `/search`, `/vehicles`, `/services`, `/rentals`, `/wanted`, `/digital`, listing detail, FAQs, terms |
| AUTH | `/login`, `/signup`, `/post/ai`, `/messages`, `/profile`, `/watchlist`, `/list-list` |
| ADMIN | `/manage/*`, `/admin/*` |
| DORMANT browse | `/jobs`, `/events`, `/property`, `/payments` (soft-block), `/checkout` |
| LEGACY | `/trade-feed`, `/opportunities`, `/disputes` (user), `/purchases` |

---

## Tests / build (this audit)

- `npm run test:awhina` → **33 files, 597 passed**
- `npx tsc --noEmit` → **pass**
- `npm run build` → **pass** (includes `/digital`)
- Playwright `tests/v1/messaging-first.spec.ts` → 2 passed, 1 skipped (auth), 1 failed **ENV/FLAKY** (Chromium `page.goto` crash mid-loop)
- Playwright smoke → assertions updated for current V1; local runs still hit **ENV/FLAKY** page crashes — not treated as product regressions
- Related unit (`notification-prefs`, `buy-listing-route`, `listing-type-matrix`) → **40 passed**

---

## Fixes shipped in this audit

1. Restore `/digital` browse page  
2. Hide Promote/Boost/Make Offer/Bid secondary CTAs when Stripe UI off  
3. Fail-close `/api/create-bump-intent` when Stripe server flag off  
4. Remove Property from Browse nav; remove Digital from sell type guide  
5. Add `tests/v1/messaging-first.spec.ts`; refresh `tests/smoke.spec.ts`
