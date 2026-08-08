/**
 * Āwhina UI surface routing — which chat shell to open for the current route.
 * Keep identity consistent; never open a second assistant over an inline workspace.
 *
 * Surfaces: `global` (sheet) | `listing_workspace` (/post/ai).
 * Changing surface must not change conversation identity — see awhina-conversation-store.
 */

import type { AwhinaUiSurface } from "./awhina-conversation-store";

export const AWHINA_INLINE_ASSISTANT_PATHS = ["/post/ai"] as const;

export function hasInlineAwhinaAssistant(pathname: string): boolean {
  return AWHINA_INLINE_ASSISTANT_PATHS.some((p) => pathname.startsWith(p));
}

/** Product surface for listing FLOW (not profile tips). */
export function resolveAwhinaUiSurface(pathname: string): AwhinaUiSurface {
  return pathname.startsWith("/post/ai") ? "listing_workspace" : "global";
}

export type AwhinaRouteContext =
  | "home"
  | "search"
  | "listing"
  | "post_ai"
  | "services"
  | "rentals"
  | "messages"
  | "profile"
  | "vehicles"
  | "general";

export function resolveAwhinaRouteContext(pathname: string): AwhinaRouteContext {
  const p = pathname || "/";
  if (p === "/" || p.startsWith("/home")) return "home";
  if (p.startsWith("/search")) return "search";
  if (p.startsWith("/post/ai")) return "post_ai";
  if (p.startsWith("/post/listing") || p.startsWith("/listing")) return "listing";
  if (p.startsWith("/services")) return "services";
  if (p.startsWith("/rentals")) return "rentals";
  if (p.startsWith("/messages") || p.startsWith("/inbox")) return "messages";
  if (p.startsWith("/profile")) return "profile";
  if (p.startsWith("/vehicles")) return "vehicles";
  return "general";
}

export type AwhinaQuickPrompt = { label: string; query: string };

const GENERIC: AwhinaQuickPrompt[] = [
  { label: "Find something", query: "Help me find something on Sky Drop" },
  { label: "Sell something", query: "I want to sell something" },
  { label: "Price an item", query: "Help me price an item" },
  { label: "Help me navigate", query: "Help me navigate Sky Drop" },
];

const SELL: AwhinaQuickPrompt[] = [
  { label: "Describe my item", query: "Help me write a listing from a short description" },
  { label: "Use a photo", query: "I'll send a photo of what I'm selling" },
  { label: "Help with price", query: "Help me set a fair asking price" },
  { label: "What details matter?", query: "What details should I include in my listing?" },
];

const SEARCH: AwhinaQuickPrompt[] = [
  { label: "Refine search", query: "Help me refine this search" },
  { label: "Set a budget", query: "Help me set a budget for what I'm looking for" },
  { label: "Nearby only", query: "Show me listings near me" },
  { label: "Sell instead", query: "I want to sell something instead" },
];

const LISTING: AwhinaQuickPrompt[] = [
  { label: "Is this a fair price?", query: "Is this a fair price?" },
  { label: "What should I ask?", query: "What should I ask the seller?" },
  { label: "Safety tips", query: "Any safety tips for this meetup?" },
  { label: "Find similar", query: "Find similar listings" },
];

const SERVICES: AwhinaQuickPrompt[] = [
  { label: "Find a service", query: "Help me find a local service" },
  { label: "Post a service", query: "I want to offer a service" },
  { label: "Price a job", query: "Help me price a service job" },
  { label: "Help me navigate", query: "Help me navigate Sky Drop" },
];

const RENTALS: AwhinaQuickPrompt[] = [
  { label: "Find a rental", query: "Help me find a rental" },
  { label: "List a rental", query: "I want to list something for rent" },
  { label: "What to include", query: "What details matter for a rental listing?" },
  { label: "Help me navigate", query: "Help me navigate Sky Drop" },
];

const MESSAGES: AwhinaQuickPrompt[] = [
  { label: "Reply tip", query: "Help me write a clear reply" },
  { label: "Negotiate politely", query: "Help me negotiate politely" },
  { label: "Safety tips", query: "Any messaging safety tips?" },
  { label: "Find something", query: "Help me find something on Sky Drop" },
];

const PROFILE: AwhinaQuickPrompt[] = [
  { label: "Update bio", query: "Update my bio" },
  { label: "Change region", query: "Change my region" },
  { label: "Improve profile", query: "Make my profile look more professional" },
  { label: "Fill everything", query: "Fill out my profile based on what you know" },
];

const HOME: AwhinaQuickPrompt[] = [
  { label: "Find something", query: "Help me find something on Sky Drop" },
  { label: "Sell something", query: "I want to sell something" },
  { label: "Browse vehicles", query: "Show me vehicles for sale" },
  { label: "Help me navigate", query: "Help me navigate Sky Drop" },
];

/** Contextual quick actions — generic chips only (no brand/product examples). */
export function getContextualAwhinaQuickPrompts(pathname: string): AwhinaQuickPrompt[] {
  switch (resolveAwhinaRouteContext(pathname)) {
    case "post_ai":
      return SELL;
    case "search":
    case "vehicles":
      return SEARCH;
    case "listing":
      return LISTING;
    case "services":
      return SERVICES;
    case "rentals":
      return RENTALS;
    case "messages":
      return MESSAGES;
    case "profile":
      return PROFILE;
    case "home":
      return HOME;
    default:
      return GENERIC;
  }
}

/** Human labels for pending listing slots (progress "Next: Year"). */
export function formatListingSlotLabel(slot: string | null | undefined): string {
  if (!slot) return "";
  const map: Record<string, string> = {
    year: "Year",
    price: "Price",
    odometer: "Mileage",
    mileage: "Mileage",
    condition: "Condition",
    location: "Location",
    title: "Title",
    transmission: "Transmission",
    fuel: "Fuel",
    colour: "Colour",
    color: "Colour",
    storage: "Storage",
    size: "Size",
    generation: "Generation",
    variant: "Variant",
    card_set: "Card set",
    card_subject: "Card subject",
    grade: "Grade",
    rental_rate: "Rental rate",
    service_rate: "Service rate",
    photos: "Photos",
  };
  const key = String(slot).trim().toLowerCase();
  if (map[key]) return map[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * During an active sell flow, never show Find/Sell/Price/Navigate.
 * Prefer a short contextual set, or none when nothing useful.
 */
export function getActiveSellWorkspacePrompts(opts: {
  pendingSlot?: string | null;
  hasPhotos?: boolean;
  hasDescription?: boolean;
  hasPrice?: boolean;
  hasTitle?: boolean;
}): AwhinaQuickPrompt[] {
  const chips: AwhinaQuickPrompt[] = [];
  const slot = (opts.pendingSlot || "").toLowerCase();

  if (!opts.hasPhotos) {
    chips.push({ label: "Add photos", query: "I'll add photos of what I'm selling" });
  }
  if (slot === "price" || (!opts.hasPrice && opts.hasTitle)) {
    chips.push({ label: "Edit price", query: "Help me set a fair asking price" });
  }
  if (opts.hasDescription) {
    chips.push({ label: "Improve description", query: "Improve the listing description" });
  }
  if (opts.hasTitle || opts.hasPrice) {
    chips.push({ label: "Preview listing", query: "Summarise my listing draft so far" });
  }

  // Cap — keep composer clean
  return chips.slice(0, 3);
}

/** Human-readable open target for a11y / captions. */
export function awhinaOpenTargetLabel(pathname: string): "chat" | "inline" {
  return hasInlineAwhinaAssistant(pathname) ? "inline" : "chat";
}
