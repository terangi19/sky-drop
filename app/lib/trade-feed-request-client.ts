/**
 * Client helper for the trade-feed write routes that the page calls with `fetch`:
 *   shout  -> POST /api/create-trade-shout
 *   post   -> POST /api/create-trade-post
 *   delete / status / reply -> POST /api/manage-trade-post
 *
 * Same contract as `trade-offer-client.ts`: success is reported ONLY when the server answered
 * 2xx with `{ success: true }`. Every other outcome (non-2xx, malformed body, network error)
 * is a failure result carrying a user-facing message, so callers can keep the user's input,
 * roll back optimistic state and show an honest error toast. Deliberately dependency-free so it
 * can be unit tested.
 */

export type TradeFeedAction = "shout" | "post" | "delete" | "status" | "reply";

export type TradeFeedClientResult =
  | { ok: true; id: string | null; duplicate?: true }
  | { ok: false; code: string; message: string; retryable: boolean };

export const TRADE_FEED_ENDPOINTS: Record<TradeFeedAction, string> = {
  shout: "/api/create-trade-shout",
  post: "/api/create-trade-post",
  delete: "/api/manage-trade-post",
  status: "/api/manage-trade-post",
  reply: "/api/manage-trade-post",
};

const COPY: Record<TradeFeedAction, { generic: string; signIn: string }> = {
  shout: { generic: "Couldn't send your message. Please try again.", signIn: "Please sign in again to send messages." },
  post: { generic: "Couldn't create your post. Please try again.", signIn: "Please sign in again to create a post." },
  delete: { generic: "Couldn't delete the post. Please try again.", signIn: "Please sign in again to delete this post." },
  status: { generic: "Couldn't update the post status. Please try again.", signIn: "Please sign in again to update this post." },
  reply: { generic: "Couldn't send your reply. Please try again.", signIn: "Please sign in again to reply." },
};

const RATE_LIMITED = "You're doing that too quickly. Please wait a moment and try again.";
const CAPTCHA_REQUIRED = "A security check is required. Please reload the page and try again.";
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

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

export function interpretTradeFeedResponse(
  action: TradeFeedAction,
  status: number,
  body: unknown
): TradeFeedClientResult {
  const copy = COPY[action];
  if (status >= 200 && status < 300) {
    const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!obj || obj.success !== true) {
      return { ok: false, code: "bad_response", message: copy.generic, retryable: true };
    }
    return {
      ok: true,
      id: typeof obj.id === "string" && obj.id ? obj.id : null,
      ...(obj.duplicate === true ? { duplicate: true as const } : {}),
    };
  }
  switch (status) {
    case 401:
      return { ok: false, code: "unauthorized", message: copy.signIn, retryable: false };
    case 429:
      return { ok: false, code: "rate_limited", message: RATE_LIMITED, retryable: false };
    case 403:
      if (body && typeof body === "object" && (body as { captchaRequired?: unknown }).captchaRequired === true) {
        return { ok: false, code: "captcha_required", message: CAPTCHA_REQUIRED, retryable: false };
      }
      return { ok: false, code: serverCode(body, "http_403"), message: serverMessage(body) || copy.generic, retryable: false };
    case 400:
    case 404:
    case 409:
      return { ok: false, code: serverCode(body, `http_${status}`), message: serverMessage(body) || copy.generic, retryable: false };
    default:
      return { ok: false, code: `http_${status}`, message: copy.generic, retryable: status >= 500 };
  }
}

export async function submitTradeFeedRequest(deps: {
  action: TradeFeedAction;
  body: Record<string, unknown>;
  getIdToken: () => Promise<string | undefined | null>;
  fetchImpl?: typeof fetch;
}): Promise<TradeFeedClientResult> {
  const copy = COPY[deps.action];
  try {
    const token = await deps.getIdToken();
    if (!token) {
      return { ok: false, code: "unauthorized", message: copy.signIn, retryable: false };
    }
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch(TRADE_FEED_ENDPOINTS[deps.action], {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(deps.body),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return interpretTradeFeedResponse(deps.action, res.status, body);
  } catch {
    return { ok: false, code: "network", message: NETWORK_ERROR, retryable: true };
  }
}
