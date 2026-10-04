/**
 * Client helper for POST /api/trade-offer.
 *
 * Success is reported ONLY when the server answered 2xx with `{ success: true }`.
 * Every other outcome (non-2xx, malformed body, network error) is a failure result that
 * carries a user-facing message. Deliberately dependency-free so it can be unit tested.
 */

export type TradeOfferClientResult =
  | { ok: true; offers: number | null; notified: boolean; message: string; kind: "success" | "info" }
  | { ok: false; code: string; message: string; retryable: boolean };

const GENERIC_ERROR = "Couldn't send your offer. Please try again.";

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

export function interpretTradeOfferResponse(status: number, body: unknown): TradeOfferClientResult {
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
      return {
        ok: false,
        code: "rate_limited",
        message: "You're sending offers too quickly. Please try again later.",
        retryable: false,
      };
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
    return interpretTradeOfferResponse(res.status, body);
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Couldn't reach the server. Check your connection and try again.",
      retryable: true,
    };
  }
}
