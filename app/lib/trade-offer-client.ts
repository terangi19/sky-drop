/**
 * Client helper for POST /api/trade-offer.
 *
 * Success is reported ONLY when the server answered 2xx with `{ success: true }`.
 * Every other outcome (non-2xx, malformed body, network error) is a failure result that
 * carries a user-facing message. Deliberately dependency-free so it can be unit tested.
 */

export type TradeOfferClientResult =
  | { ok: true; offers: number | null; notified: boolean; message: string; kind: "success" | "info" }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
      /** Set on 429 from the route limiters: "post" = per-user-per-post, "user" = per-user. */
      scope?: "post" | "user";
      /** Retry-After in seconds when the server sent one (an upper bound, not the exact reset). */
      retryAfterSec?: number;
    };

const GENERIC_ERROR = "Couldn't send your offer. Please try again.";
export const RATE_LIMIT_POST_MESSAGE = "You've already sent offers on this post — the seller has been notified.";
const RATE_LIMIT_GENERIC_MESSAGE = "You're sending offers too quickly. Please try again later.";

/** Parse a Retry-After header given in seconds. HTTP-date form and junk are ignored. */
export function parseRetryAfterSeconds(value: string | null | undefined): number | undefined {
  if (typeof value !== "string" || !/^\s*\d{1,6}\s*$/.test(value)) return undefined;
  const sec = Number(value.trim());
  return Number.isFinite(sec) && sec > 0 ? sec : undefined;
}

/** "in up to N minutes" style wording; Retry-After is an upper bound. */
export function formatRetryAfter(sec: number | undefined): string {
  if (!sec) return "later";
  if (sec <= 60) return "in up to a minute";
  if (sec < 2 * 60 * 60) return `in up to ${Math.ceil(sec / 60)} minutes`;
  return `in up to ${Math.ceil(sec / 3600)} hours`;
}

function rateLimitedResult(body: unknown, retryAfterSec: number | undefined): TradeOfferClientResult {
  const scope =
    body && typeof body === "object" ? (body as { scope?: unknown }).scope : undefined;
  if (scope === "post") {
    return { ok: false, code: "rate_limited", message: RATE_LIMIT_POST_MESSAGE, retryable: false, scope, retryAfterSec };
  }
  if (scope === "user") {
    return {
      ok: false,
      code: "rate_limited",
      message: `You've sent a lot of offers recently. Please try again ${formatRetryAfter(retryAfterSec)}.`,
      retryable: false,
      scope,
      retryAfterSec,
    };
  }
  // Edge / per-IP limiters: no scope.
  return { ok: false, code: "rate_limited", message: RATE_LIMIT_GENERIC_MESSAGE, retryable: false, retryAfterSec };
}

function serverMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err.trim().slice(0, 200);
  }
  return "";
}

function serverCode(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const code = (body as { code?: unknown }).code;
    if (typeof code === "string" && code) return code.slice(0, 64);
  }
  return fallback;
}

export function interpretTradeOfferResponse(
  status: number,
  body: unknown,
  retryAfter?: string | null
): TradeOfferClientResult {
  if (status >= 200 && status < 300) {
    const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!obj || obj.success !== true) {
      return { ok: false, code: "bad_response", message: GENERIC_ERROR, retryable: true };
    }
    const offers = typeof obj.offers === "number" && Number.isFinite(obj.offers) ? obj.offers : null;
    const notified = obj.notified !== false;
    return notified
      ? { ok: true, offers, notified: true, message: "Offer sent!", kind: "success" }
      : {
          ok: true,
          offers,
          notified: false,
          message: "Offer recorded, but we couldn't notify the seller yet.",
          kind: "info",
        };
  }
  switch (status) {
    case 401:
      return { ok: false, code: "unauthorized", message: "Please sign in again to send an offer.", retryable: false };
    case 429:
      return rateLimitedResult(body, parseRetryAfterSeconds(retryAfter));
    case 400:
    case 403:
    case 404:
    case 409:
      return {
        ok: false,
        code: serverCode(body, `http_${status}`),
        message: serverMessage(body) || GENERIC_ERROR,
        retryable: false,
      };
    default:
      return { ok: false, code: `http_${status}`, message: GENERIC_ERROR, retryable: status >= 500 };
  }
}

export async function submitTradeOffer(deps: {
  getIdToken: () => Promise<string | undefined | null>;
  postId: string;
  requestId?: string;
  fetchImpl?: typeof fetch;
}): Promise<TradeOfferClientResult> {
  try {
    const token = await deps.getIdToken();
    if (!token) {
      return { ok: false, code: "unauthorized", message: "Please sign in again to send an offer.", retryable: false };
    }
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch("/api/trade-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ postId: deps.postId, requestId: deps.requestId }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return interpretTradeOfferResponse(res.status, body, res.headers?.get?.("Retry-After") ?? null);
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Couldn't reach the server. Check your connection and try again.",
      retryable: true,
    };
  }
}
