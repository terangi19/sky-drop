# Sky Drop — Fraud Prevention System Plan

## Bot Prevention (signup layer)
- reCAPTCHA v3 on signup + first listing (invisible)
- Honeypot field on signup form
- Timing check — reject if submitted < 3s
- Registration velocity — max 1 account per IP per 90 days
- Device fingerprint check — flag if recently banned
- IP geo check — flag if not NZ

## Signup
- Temp email domain check → block
- Phone blacklist check → block if found
- SMS code → phone verified
- Account created — IP + fingerprint stored

## Profile (required before listing)
- Bio ≥ 100 chars
- Profile photo uploaded (hash stored for ban tracking)
- Accept seller rules

## KYC (optional accelerator — manual review)
- Upload government ID + selfie holding it
- Stored in Firebase Storage `kyc/{userId}/` — admin-only access
- Email + admin badge notifies you
- You review:
  - ID + selfie look **real** → **Approve** (badge, caps, trust boost, police-ready)
  - ID or selfie looks **fake / AI-generated** → **Ban** (full forfeiture, can never KYC again)

## Progression Tiers

### Two paths
| | No KYC | KYC |
|---|---|---|
| First listing | Wait 30 days | Post immediately |
| Price cap | $100 | $500 |
| Listing cap | 1 | 5 |
| 24h delay | Yes | No |
| Messages | 5/day | 50/day |
| Trust boost | — | +20 |
| Badge | None | "ID Verified" |
| Police evidence | No | Yes — ID on file |

### Earned unlocks
| Milestone | Price cap | Listings | Msgs/day |
|---|---|---|---|
| Start (no KYC) | $100 | 1 | 5 |
| KYC approved | $500 | 5 | 50 |
| 1st sale | $300 | 3 | 15 |
| 5 sales + 60 days | $1,000 | 15 | 50 |
| 15 sales + 90 days | $5,000 | 50 | 100 |
| 30 sales + 180 days | $10,000 | 100 | unlimited |
| 50 sales + 365 days | unlimited | 100 | unlimited |

## Listing Checks (server-side, not bypassable)
- Session + CSRF token
- Action rate limit (10 actions/min)
- Prerequisites: email ✓, phone ✓, profile ✓, rules ✓, account age ✓
- Price cap check
- Listing cap check
- 2+ photos if price > $50
- Photo hash blacklist check
- Bio similarity check against banned accounts
- Scam keyword check
- Suspicious price check
- Duplicate title check
- Geo IP → trust penalty
- Cumulative $500 max across first 3 sales
- Edit price cap check (can't edit above current tier)

## Buyer Actions (server-side checks)
- Buy Now: seller email ≠ buyer email (already exists)
- Make Offer: seller email ≠ buyer email (new server-side) + IP/fingerprint stored
- Place Bid: seller email ≠ buyer email (new server-side) + requires phone + 30-day account age + IP/fingerprint stored
- "New bidder" flag if no purchase history
- 5-minute auto-extension on late auction bids

## Automated Enforcement (no human needed)
- Trust score (reports don't affect it) → < 40 = deprioritized, no new listings, messages capped
- 2 reports on listing in 24h → auto-removed (relistable)
- 3+ reports on account in 30 days → auto-restricted (you review to lift or ban)
- Scam DMs to 3+ users in 1h → messages restricted
- Renewal cooldown → +24h each re-list

## Manual Ban (only you trigger)
Click "Ban Account" → instant forfeiture:
1. Phone → blacklisted
2. Photo hash → blacklisted
3. Bio → stored for similarity check
4. Email domain → flagged
5. All listings, reviews, XP, badges, followers → wiped
6. IP + device fingerprint → 30-day cooldown
7. KYC docs (if any) → flagged for police evidence

## Shill Bidding Detection
- Report reason: "Seller bidding on own item"
- Admin "Check bids" button per listing shows all bid IPs/fingerprints vs seller's
- You review manually → ban if confirmed

## Storage Security — storage.rules updates

| Path | Current | Fixed |
|---|---|---|
| `proof_of_address/{userId}/{file}` | any auth user can read | **owner or admin only** |
| `resumes/{userId}/{file}` | any auth user can read | **owner or admin only** |
| `kyc/{userId}/{file}` (new) | doesn't exist | **admin only** |

One-time setup: set `admin: true` custom claim on your Firebase Auth account.

## Firestore Security — firestore.rules additions

| Collection | Access |
|---|---|
| `usedIps/` | Admin-only read/write |
| `banStore/` | Admin-only read/write |

## Terms of Service — Sections to Add
- Identity Verification (KYC) — document storage, police handover, fake ID = ban
- Account Progression — caps, limits, 30-day wait
- Prohibited Conduct — self-bidding, self-offering
- Enforcement — auto-removal, restriction, ban forfeiture

## Privacy Policy — Sections to Update
- Information We Collect — add device fingerprint, IP, photo hash, KYC docs
- Data Sharing — add NZ Police for fraud, reCAPTCHA (Google)
- Your Rights — add KYC document retention (30 days after account closed)
- How We Use It — add AI-powered scam analysis (OpenAI)

## Āwhina Knowledge — Add to sky-ai-knowledge.ts
New section: `## ACCOUNT PROGRESSION & TRUST SYSTEM`
Cover: starting limits, KYC, progression tiers, bidding rules, ban forfeiture, trust score, enforcement.

## Files to Create (5)
- `app/lib/ban-store.ts` — phone blacklist, photo hash, bio similarity
- `app/lib/fingerprint.ts` — device fingerprinting
- `app/lib/geo-check.ts` — IP vs listing location
- `app/lib/temp-email.ts` — disposable email blocklist
- `app/lib/kyc.ts` — KYC types + helpers

## Files to Modify (26)
- `app/api/create-listing/route.ts` — price caps, 24h delay, 2+ photos, cumulative earnings, account age
- `app/lib/seller-eligibility.ts` — add account age + cap checks
- `app/lib/trustscore.ts` — add KYC bonus only (remove report penalty)
- `app/lib/scamdetection.ts` — expand keyword list
- `app/api/delete-listing/route.ts` — trigger ban forfeiture
- `app/lib/phone-auth.ts` — blacklist check on signup
- `app/messages/page.tsx` — message cap + spam detection
- `app/login/page.tsx` — honeypot, timing, reCAPTCHA, temp email check
- `app/post/ai/page.tsx` — show price cap, delay, remaining earnings, self-offer check
- `app/admin/verification/page.tsx` — add "kyc" tab with approve/reject + "Check bids" view
- `app/profile/page.tsx` — KYC upload section
- `app/post/listing/[id]/page.tsx` — KYC badge, self-bid/offer server check, store bid IP/fingerprint
- `app/seller/[username]/page.tsx` — KYC badge
- `app/lib/admin-alerts.ts` — add "kyc_submitted" alert type
- `app/page.tsx` — homepage offer modal self-offer check
- `app/trade-feed/page.tsx` — trade feed offer self-offer check
- `app/firestore.rules` — add `usedIps`, `banStore` collections (admin-only)
- `storage.rules` — fix proof_of_address + resumes read access, add kyc path
- `app/lib/sky-ai-knowledge.ts` — add ACCOUNT PROGRESSION & TRUST SYSTEM section
- `app/terms/page.tsx` — add KYC, progression, enforcement sections
- `app/privacy/page.tsx` — add KYC docs, fingerprint, police sharing, OpenAI, reCAPTCHA
- `app/components/ReportModal.tsx` — add "Seller bidding on own item" reason
- `app/api/create-payment-intent/route.ts` — verify buyer email ≠ seller email (verify existing)
- `app/api/arrange-purchase/route.ts` — verify buyer email ≠ seller email (verify existing)
- `app/components/OfferPaymentModal.tsx` — verify buyer email ≠ seller email (verify existing)
