import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type FunnelEventName =
  | "listing_form_started"
  | "listing_form_completed"
  | "listing_published"
  | "listing_detail_viewed"
  | "message_sent"
  | "message_started"
  | "purchase_started"
  | "purchase_completed"
  | "offer_sent"
  | "offer_accepted"
  | "auction_won"
  | "search_used"
  | "search_abandoned"
  | "signup_started"
  | "signup_verified";

export interface FunnelEventPayload {
  event: FunnelEventName;
  userId: string;
  listingId?: string;
  listingType?: string;
  /** Current route path e.g. "/post/ai" or "/post/listing/abc123" */
  page?: string;
  /** Entry point e.g. "homepage", "search", "wanted", "messages" */
  source?: string;
  /** Value for offers/purchases (price, bid amount, etc.) */
  value?: number;
  /** Search query for search events */
  searchQuery?: string;
  /** Category filter for search events */
  searchCategory?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
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
    value: payload.value ?? null,
    searchQuery: payload.searchQuery ?? null,
    searchCategory: payload.searchCategory ?? null,
    metadata: payload.metadata ?? null,
    timestamp: serverTimestamp(),
  }).catch(() => {
    // Silently ignore — analytics must never break the user journey
  });
}

// Convenience functions for common events
export const funnel = {
  listingStarted: (userId: string, listingId?: string, listingType?: string) =>
    trackFunnelEvent({ event: "listing_form_started", userId, listingId, listingType }),
  
  listingCompleted: (userId: string, listingId?: string, listingType?: string) =>
    trackFunnelEvent({ event: "listing_form_completed", userId, listingId, listingType }),
  
  listingPublished: (userId: string, listingId?: string, listingType?: string) =>
    trackFunnelEvent({ event: "listing_published", userId, listingId, listingType }),
  
  listingViewed: (userId: string, listingId?: string, listingType?: string, source?: string) =>
    trackFunnelEvent({ event: "listing_detail_viewed", userId, listingId, listingType, source }),
  
  messageStarted: (userId: string, listingId?: string) =>
    trackFunnelEvent({ event: "message_started", userId, listingId }),
  
  messageSent: (userId: string, listingId?: string) =>
    trackFunnelEvent({ event: "message_sent", userId, listingId }),
  
  purchaseStarted: (userId: string, listingId?: string, value?: number) =>
    trackFunnelEvent({ event: "purchase_started", userId, listingId, value }),
  
  purchaseCompleted: (userId: string, listingId?: string, value?: number) =>
    trackFunnelEvent({ event: "purchase_completed", userId, listingId, value }),
  
  offerSent: (userId: string, listingId?: string, value?: number) =>
    trackFunnelEvent({ event: "offer_sent", userId, listingId, value }),
  
  offerAccepted: (userId: string, listingId?: string, value?: number) =>
    trackFunnelEvent({ event: "offer_accepted", userId, listingId, value }),
  
  auctionWon: (userId: string, listingId?: string, value?: number) =>
    trackFunnelEvent({ event: "auction_won", userId, listingId, value }),
  
  searchUsed: (userId: string, searchQuery?: string, searchCategory?: string) =>
    trackFunnelEvent({ event: "search_used", userId, searchQuery, searchCategory, metadata: { page: typeof window !== "undefined" ? window.location.pathname : undefined } }),
  
  searchAbandoned: (userId: string) =>
    trackFunnelEvent({ event: "search_abandoned", userId }),
  
  signupStarted: (userId: string) =>
    trackFunnelEvent({ event: "signup_started", userId }),
  
  signupVerified: (userId: string) =>
    trackFunnelEvent({ event: "signup_verified", userId }),
};
