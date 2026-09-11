# Shared `rateLimit()` / Upstash TTFB tax

Evidence notes for the ~5s tax on Āwhina API routes. **Docs only** — no application changes in this file.

Companion to [PERF_PASS_1_3_CHANGELOG.md](./PERF_PASS_1_3_CHANGELOG.md) (Pass 1–3 production curls) and PR [#49](https://github.com/terangi19/sky-drop/pull/49) @ `a83e322`.

**Do not force-merge** any follow-up to “prove” this. Re-measure production after the #49 deploy is live.

---

## Root cause (GET `/api/sky-ai/status` ~5.6s)

Production `GET /api/sky-ai/status` paid **~5.3–5.6s TTFB on every request** (`x-vercel-cache: MISS`). This was not an OpenAI ping.

1. The handler always called shared `rateLimit()` first.
2. Production had `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set (`isUpstashEnabled() === true`), but the hostname was **stale/deleted** (`getaddrinfo ENOTFOUND` — Gate 10 / PR #40 logging).
3. `@upstash/redis` defaulted to **~5 retries**. The first DNS miss was ~5s, which matched measured TTFB.

Contrast: unauth `GET /api/sky-ai/conversations` returns **401 before `rateLimit()`** (~350ms). Same origin, same day — the platform is fine; the slow paths were waiting on dead Redis.

### Fix (already on `main`)

PR [#49](https://github.com/terangi19/sky-drop/pull/49) @ **`a83e322`**:

- Upstash circuit breaker, `retry: { retries: 0 }`, 500ms deadline
- Status route `{ fallback: "memory" }` so a dead Upstash does not add Firestore GET+SET on the public probe
- Health cache first (skip spend I/O on warm status)

Local after (dead hostname): warm status **5–7ms**. Hung-promise unit test caps a stuck Redis call at **~500ms**, not ~5s.

### Ops / deploy

- Production **Upstash URL has been corrected** (ops). Not a code change.
- Vercel deploy is currently **rate-limited (~24h)**, so **after-curl of production is still pending**.
- Hypothesis below is unconfirmed in prod until that deploy ships. Do **not** force-merge anything to skip the wait.

---

## Same `rateLimit()` is called early on sibling routes

The status tax is not unique to `/api/sky-ai/status`. The same `rateLimit()` (`app/lib/rate-limit.ts` → `rateLimitUpstash()` when env vars are set) runs **before** body parse / auth-fail JSON on:

| Route | Entry | `rateLimit()` before cheap 4xx? |
| --- | --- | --- |
| `POST /api/sky-ai` | `checkRateLimit(req)` at the top of `POST` | Yes (IP or uid key). Empty body still waits, then 400. |
| `POST /api/awhina-ai` | `checkRateLimit(req)` at the top of `POST` | Yes. Empty body still waits, then 400. |
| `POST /api/awhina-intent` | `checkRateLimit(req)` **before** the uid 401 | Yes. Unauth still hits Upstash (IP key), then 401. |
| `POST /api/awhina-vision` | `checkRateLimit(req)` after the feature-flag check | **No on unauth:** returns `{ allowed: false }` **without** calling `rateLimit()` when there is no uid. Authenticated calls do hit it. |
| `GET /api/sky-ai/status` | `rateLimit()` first | Yes (the original ~5.6s path). |

`GET /api/sky-ai/conversations` is the control: **401 is returned before `rateLimit()`**.

---

## Pre-#49 production curls (2026-09-11)

Against `https://skydrop.co.nz`, unauthenticated / empty bodies. Same session as the Pass 1–3 changelog tables.

| Route | Method | Status | TTFB | Notes |
| --- | --- | --- | --- | --- |
| `/api/sky-ai` | POST | 400 | **~5231ms** | Empty POST; `checkRateLimit` first |
| `/api/awhina-ai` | POST | 400 | **~5214ms** | Empty POST; `checkRateLimit` first |
| `/api/awhina-intent` | POST | 401 | **~5151ms** | Unauth; `rateLimit` still runs (IP key) |
| `/api/sky-ai/conversations` | GET | 401 | **~350ms** | Auth fail **before** `rateLimit` |
| `/api/sky-ai/status` | GET | 200 | **~5.6s** | `rateLimit` first; all MISS |
| `/api/awhina-vision` | POST | 401 | **~1803ms** cold / **~1067ms** warm | Unauth **skips** `rateLimit`; no ~5s Redis wait |

Vision’s faster 401 is consistent with the shared-tax hypothesis: skipping Upstash avoids the ~5s DNS retry. Remaining ~1–1.8s is isolate / other work, not the dead-hostname retry loop.

Warm repeats of the three ~5.2s POSTs stayed ~5.1–5.2s (changelog). This is **not** a one-off cold start.

---

## Hypothesis (do not force-merge)

Once **#49 is deployed** and the **fixed Upstash URL** is on that deployment:

- `GET /api/sky-ai/status` should drop from ~5.6s to the #49 envelope (first isolate hit ≤500ms Upstash wait if Redis is slow; warm memory + health cache; possible CDN HIT from `s-maxage=15`).
- `POST /api/sky-ai`, `/api/awhina-ai`, and `/api/awhina-intent` should drop **similarly**, because they share the same `rateLimit()` / Upstash client (circuit breaker + retries: 0). They do **not** use `{ fallback: "memory" }` — if Upstash is healthy they pay one Redis RTT; if it is still dead they wait ≤500ms then Firestore fallback (unless a later PR changes that).
- Authenticated `POST /api/awhina-vision` should lose the ~5s tax as well; unauth vision already skipped it.

**Re-measure after prod deploy.** Until after-curl exists, treat sibling-route improvement as a hypothesis.

---

## Remaining (not this tax)

These were already called out in Pass 1–3 and are **still open** after #49:

- **`createSkyAiConversation` on the new-chat path** — still awaited on first-turn TTFB (intentional continuity lock; returning an ID before the write caused follow-up 404s / split conversations).
- **`Cache-Control: no-store`** on auth / geo HTML and most document routes — homepage `/` has 60s `s-maxage`; other shells remain uncacheable. Status now has `public, s-maxage=15, stale-while-revalidate=45` (#49).
- **`ListingImage`** — still raw `<img>` (Next image optimizer configured but unused).

#49 does not claim to fix those.
