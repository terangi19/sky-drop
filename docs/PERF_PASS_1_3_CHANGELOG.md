# Performance Passes 1–3 — Changelog and production TTFB

Docs-only record of the three performance passes landed on `main`, plus production curl measurements against [https://skydrop.co.nz](https://skydrop.co.nz) on **2026-09-11 UTC**.

No application, API, or UI changes are described here as *proposed* work. This file is a snapshot of what shipped and what is still slow.

**Follow-on (code already on `main`, prod after-curl pending):** the ~5.6s status TTFB was a shared `rateLimit()` / dead-Upstash DNS tax, not OpenAI. See [PERF_RATELIMIT_UPSTASH_TTFB.md](./PERF_RATELIMIT_UPSTASH_TTFB.md) and PR [#49](https://github.com/terangi19/sky-drop/pull/49) @ `a83e322`. Do **not** force-merge a follow-up to skip the Vercel deploy wait.

---

## Passes landed

### Pass 1 — PR [#19](https://github.com/terangi19/sky-drop/pull/19) @ `24fe08c`

**Theme:** token refresh, Firestore listeners, OpenAI SDK off the client.

- Stopped forcing a Firebase ID-token refresh on every API call (`getIdToken(true)` → cached token, force only on 401 retry).
- Replaced hot-path realtime listeners (Navbar unread, search `useListings`) with bounded polls / one-shot `getDocs`.
- Capped previously unbounded marketplace queries.
- Moved create-listing saved-search / matchmaking off the JSON response path via `after()`.
- Reused vision-cache descriptions when identity matches (no duplicate OpenAI writer on cache hit).
- Aliased `openai` to a browser stub so the Node SDK stays out of client chunks.

Landed as: `perf: cut marketplace latency and keep OpenAI SDK off the client`.

### Pass 2 — PR [#36](https://github.com/terangi19/sky-drop/pull/36) @ `abc4821`

**Theme:** Āwhina TTFB — `after()` persist, SSE, cold imports, status TTL.

- Conversation persist uses `after()` so SSE/JSON is not blocked on Firestore.
- Artificial SSE sleeps (`setTimeout` between already-computed progress/delta events) removed.
- Vision / freeform / compare / async composer arms load on demand (`import()`), not on every cold `/api/sky-ai` invoke.
- Chat status probes share a 30s TTL cache + in-flight promise (`/api/sky-ai/status`).

Landed as: `perf: unblock Āwhina TTFB by deferring persist and unused imports`.

### Pass 3 — PR [#38](https://github.com/terangi19/sky-drop/pull/38) @ `ba89b91`

**Theme:** homepage SWR + Āwhina history `Promise.all`.

- Homepage / browse listings fetch immediately (no wait on Firebase auth), with shared in-flight SWR and skip of tab-focus refetch when data is still fresh.
- Āwhina conversation history loads owner + messages in one Firestore round-trip (`Promise.all`); ownership checks unchanged.
- Homepage HTML may CDN-cache 60s; auth / geo document routes stay `no-store`.
- `createSkyAiConversation` remains awaited (continuity lock).

Landed as: `perf: dedupe homepage/browse polls and cut Āwhina history RTT`.

### Status / Upstash — PR [#49](https://github.com/terangi19/sky-drop/pull/49) @ `a83e322`

**Theme:** skip dead-Upstash waits on `GET /api/sky-ai/status`.

- Root cause of the ~5.6s status TTFB: stale Upstash hostname + `@upstash/redis` retries (~5s DNS). Not an OpenAI call.
- Circuit breaker, 500ms deadline, `retries: 0`; status uses `{ fallback: "memory" }`; health cache first.
- Production Upstash URL corrected in ops; **Vercel deploy currently rate-limited (~24h)** so production after-curl is pending.
- Same early `rateLimit()` sits on `POST /api/sky-ai`, `/api/awhina-ai`, `/api/awhina-intent`, and authenticated `/api/awhina-vision`. Hypothesis: those ~5.2s empty POSTs drop similarly once #49 + the URL fix are live. **Do not force-merge.** Evidence: [PERF_RATELIMIT_UPSTASH_TTFB.md](./PERF_RATELIMIT_UPSTASH_TTFB.md).

Landed as: `perf: cut /api/sky-ai/status TTFB by skipping dead Upstash waits (#49)`.

---

## Remaining risks

Pass 1–3 leftovers plus the shared rate-limit tax. Curl tables below are the **pre-#49** production baseline (2026-09-11).

| Risk | Notes |
| --- | --- |
| `Cache-Control: no-store` | Still on auth / geo HTML and most document routes. Homepage `/` got a 60s CDN `s-maxage` in Pass 3; other shells remain uncacheable. Status now has `s-maxage=15` in #49 (unverified in prod until deploy). |
| `ListingImage` | Still raw `<img>` (Next image optimizer configured but unused). |
| `createSkyAiConversation` on path | Still awaited on first-turn / new-chat TTFB (intentional — returning an ID before the write caused follow-up 404s / split conversations). |
| Status ~5.6s | **Code-fixed in #49** (circuit breaker, memory fallback, health cache first). Prod after-curl **pending** (Vercel deploy rate-limited ~24h). Upstash URL corrected in ops. |
| Shared `rateLimit()` tax on Āwhina POSTs | Pre-#49 empty `POST /api/sky-ai` ~5231ms, `awhina-ai` ~5214ms, `awhina-intent` ~5151ms vs conversations 401 ~350ms. Same Upstash client as status. Hypothesis only until after-curl — **do not force-merge**. |
| Upstash ops | URL fix is ops, not code. Until the corrected URL is on a live deployment, other routes may still pay Redis-or-fallback. |

---

## Production curl TTFB — https://skydrop.co.nz

**Pre-#49 baseline.** Measured **2026-09-11 UTC** before `a83e322` was on a production deployment. Times are wall-clock to first complete HTTP response (curl). Status codes are expected for unauthenticated / empty bodies. After-curl (post #49 + corrected Upstash URL) is pending — Vercel deploy rate-limited ~24h.

### Cold

| Route | Method | Status | TTFB | Cache |
| --- | --- | --- | --- | --- |
| `/api/sky-ai/status` | GET | 200 | **5612ms** | MISS |
| `/api/sky-ai` | POST | 400 | **5231ms** | — |
| `/api/sky-ai/conversations` | GET | 401 | **350ms** | — |
| `/api/awhina-ai` | POST | 400 | **5214ms** | — |
| `/api/awhina-intent` | POST | 401 | **5151ms** | — |
| `/api/awhina-vision` | POST | 401 | **1803ms** | — |

### Warm

| Route | Method | TTFB |
| --- | --- | --- |
| `/api/sky-ai/status` | GET | 5641ms |
| `/api/sky-ai` | POST | 5104ms |
| `/api/sky-ai/conversations` | GET | 380ms |
| `/api/awhina-ai` | POST | 5142ms |
| `/api/awhina-intent` | POST | 5170ms |
| `/api/awhina-vision` | POST | 1067ms |

### Status × 5

Repeated `GET /api/sky-ai/status`: **5570–5673ms**, median **~5603ms**, all **MISS**.

---

## Interpretation

This was **not a one-off cold start**.

- Pre-#49, status stayed ~5.6s on every hit, including five back-to-back requests, all cache MISS. Warm was not faster than cold.
- Heavy Āwhina POST routes (`sky-ai`, `awhina-ai`, `awhina-intent`) stayed ~5.1–5.2s on empty/unauthorized bodies — that cost is paid before a successful model call (shared `rateLimit()` / dead Upstash).
- Unauth `POST /api/awhina-vision` was faster (~1.8s / ~1.1s) because it **skips** `rateLimit()` when there is no uid.
- **`/api/sky-ai/conversations` at ~350–380ms (401) proves a fast path exists** on the same origin, same day, same unauthenticated curl: it returns 401 **before** `rateLimit()`.

Pass 1–3 removed token thrash, live listeners, client OpenAI, blocking persist, fake SSE delay, unused cold imports, duplicate status probes, homepage poll waste, and sequential history reads. They did **not** move the shared `rateLimit()` / dead-Upstash DNS wait.

That wait is the current explanation for status **and** the ~5.2s empty Āwhina POSTs. #49 is on `main`; production confirmation is blocked on the Vercel deploy window. See [PERF_RATELIMIT_UPSTASH_TTFB.md](./PERF_RATELIMIT_UPSTASH_TTFB.md).
