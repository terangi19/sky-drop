# Performance Passes 1–3 — Changelog and production TTFB

Docs-only record of the three performance passes landed on `main`, plus production curl measurements against [https://skydrop.co.nz](https://skydrop.co.nz) on **2026-09-11 UTC**.

No application, API, or UI changes are described here as *proposed* work. This file is a snapshot of what shipped and what is still slow.

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

---

## Remaining risks

These were called out across Pass 1–3 and are still true in production measurements below:

| Risk | Notes |
| --- | --- |
| `Cache-Control: no-store` | Still on auth / geo HTML and most document routes. Homepage `/` got a 60s CDN `s-maxage` in Pass 3; other shells remain uncacheable. |
| `ListingImage` | Still raw `<img>` (Next image optimizer configured but unused). |
| `createSkyAiConversation` on path | Still awaited on first-turn TTFB (intentional — returning an ID before the write caused follow-up 404s / split conversations). |
| Upstash ops | Rate-limit fallback is Firestore when `UPSTASH_REDIS_REST_*` is unset. Enable in Vercel; not a code change. |
| Status ~5.6s | Production `GET /api/sky-ai/status` stays ~5.6s cold **and** warm, `x-vercel-cache: MISS`. |
| Heavy route ~5s empty POST | `POST /api/sky-ai` (and sibling Āwhina POST routes) ~5.1–5.2s even on empty/invalid bodies (400). |

---

## Production curl TTFB — https://skydrop.co.nz

Measured **2026-09-11 UTC**. Times are wall-clock to first complete HTTP response (curl). Status codes are expected for unauthenticated / empty bodies.

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

This is **not a one-off cold start**.

- Status stays ~5.6s on every hit, including five back-to-back requests, all cache MISS. Warm is not faster than cold.
- Heavy Āwhina POST routes (`sky-ai`, `awhina-ai`, `awhina-intent`) stay ~5.1–5.2s on empty/unauthorized bodies — the cost is on the route graph / isolate, not on a successful model call.
- **`/api/sky-ai/conversations` at ~350–380ms (401) proves a fast path exists** on the same origin, same day, same unauthenticated curl. Auth-fail JSON can return in well under a second; status and the heavy POST modules cannot.

Pass 1–3 removed token thrash, live listeners, client OpenAI, blocking persist, fake SSE delay, unused cold imports, duplicate status probes, homepage poll waste, and sequential history reads. Production TTFB for status / empty Āwhina POST is still dominated by something those passes did not move.
