import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type FunnelEventName =
  | "listing_form_started"
  | "listing_form_completed"
  | "listing_detail_viewed"
  | "message_sent"
  | "purchase_completed";

export interface FunnelEventPayload {
  event: FunnelEventName;
  userId: string;
  listingId?: string;
  listingType?: string;
  /** Current route path e.g. "/post/ai" or "/post/listing/abc123" */
  page?: string;
  /** Entry point e.g. "homepage", "search", "wanted", "messages" */
  source?: string;
}

/** Stable random ID for this browser session — groups events into a single journey */
function getSessionId(): string {
  const KEY = "sky_funnel_session_id";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

/**
 * Write a single funnel event to Firestore.
 * Fire-and-forget — never throws, never blocks UI.
 * Session-scoped dedup for high-frequency events (viewed, form_started).
 */
export function trackFunnelEvent(payload: FunnelEventPayload): void {
  if (!payload.userId) return;

  const dedupEvents: FunnelEventName[] = ["listing_form_started", "listing_detail_viewed"];
  if (dedupEvents.includes(payload.event)) {
    const key = `funnel_${payload.event}_${payload.listingId ?? "none"}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — proceed without dedup
    }
  }

  const page = payload.page ?? (typeof window !== "undefined" ? window.location.pathname : undefined);

  addDoc(collection(db, "funnelEvents"), {
    event: payload.event,
    userId: payload.userId,
    sessionId: getSessionId(),
    listingId: payload.listingId ?? null,
    listingType: payload.listingType ?? null,
    page: page ?? null,
    source: payload.source ?? null,
    timestamp: serverTimestamp(),
  }).catch(() => {
    // Silently ignore — analytics must never break the user journey
  });
}
