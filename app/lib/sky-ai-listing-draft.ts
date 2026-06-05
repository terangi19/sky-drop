/**
 * Structured listing draft — source of truth for in-progress listing sessions.
 * Merges form context, persisted session draft, and parsed chat history.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type {
  SkyAiDraftStatus,
  SkyAiFlow,
  SkyAiHistoryItem,
  SkyAiListingContext,
  SkyAiListingDraft,
  SkyAiStep,
} from "./sky-ai-types";

export type { SkyAiDraftStatus, SkyAiListingDraft };

export function parseListingTypeChoice(msg: string): string | null {
  const m = msg.match(/\b(vehicle|car|van|ute|suv|service|digital|rental|physical|item|product)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** Canonical flow names (auction_setup → auction_creation). */
export function normalizeFlow(flow: SkyAiFlow | null | undefined): SkyAiFlow | null {
  if (!flow) return null;
  if (flow === "auction_setup") return "auction_creation";
  if (flow === "service_quote") return "service_listing";
  return flow;
}

const DRAFT_STRING_KEYS: (keyof SkyAiListingDraft)[] = [
  "entityType",
  "entityName",
  "entityKey",
  "listingType",
  "saleType",
  "category",
  "title",
  "description",
  "condition",
  "price",
  "startingBid",
  "reservePrice",
  "durationDays",
  "location",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehicleOdometer",
  "vehicleColour",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "servicePricingType",
  "serviceDuration",
  "serviceDeliveryMethod",
];

function pickStr(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s || undefined;
}

function mergeDraftFields(
  base: SkyAiListingDraft,
  patch: Partial<SkyAiListingDraft> | SkyAiListingContext | null | undefined
): SkyAiListingDraft {
  if (!patch) return base;
  const out = { ...base };
  for (const key of DRAFT_STRING_KEYS) {
    const val = pickStr((patch as Record<string, unknown>)[key]);
    if (val) (out as Record<string, unknown>)[key] = val;
  }
  if (pickStr((patch as Record<string, unknown>).auctionDuration)) {
    const d = pickStr((patch as Record<string, unknown>).auctionDuration)!;
    out.durationDays = d;
  }
  if (out.startingBid && !out.saleType) out.saleType = "auction";
  if (out.durationDays && out.startingBid && out.status === "draft") {
    out.status = "ready";
  }
  return out;
}

/** Parse assistant confirmation blocks like "Starting Bid: $150". */
export function parseDraftFromAssistantText(text: string): Partial<SkyAiListingDraft> {
  const out: Partial<SkyAiListingDraft> = {};

  const bid = text.match(/Starting Bid:\s*\$?([\d,]+)/i);
  if (bid?.[1]) out.startingBid = bid[1].replace(/,/g, "");

  const duration = text.match(/Duration:\s*(\d+)\s*day/i);
  if (duration?.[1]) out.durationDays = duration[1];

  const reserve = text.match(/Reserve(?:\s+Price)?:\s*\$?([\d,]+)/i);
  if (reserve?.[1]) out.reservePrice = reserve[1].replace(/,/g, "");

  const title = text.match(/Title:\s*(.+)/i);
  if (title?.[1]) out.title = title[1].trim().slice(0, 120);

  if (out.startingBid) out.saleType = "auction";

  return out;
}

export function parseAuctionParamsFromMessage(message: string): Partial<SkyAiListingDraft> {
  const out: Partial<SkyAiListingDraft> = {};

  let m = message.match(
    /(?:starting\s+bid|start(?:ing)?\s+bid)\s*(?:is|of|:)?\s*\$?(\d[\d,]*)/i
  );
  if (m?.[1]) out.startingBid = m[1].replace(/,/g, "");
  else {
    m = message.match(/(\d[\d,]*)\s*(?:is\s+)?(?:the\s+)?(?:my\s+)?starting\s+bid/i);
    if (m?.[1]) out.startingBid = m[1].replace(/,/g, "");
  }

  m = message.match(/(?:reserve(?:\s+price)?)\s*(?:is|of|:)?\s*\$?(\d[\d,]*)/i);
  if (m?.[1]) out.reservePrice = m[1].replace(/,/g, "");
  else {
    m = message.match(/(\d[\d,]*)\s*(?:is\s+)?(?:the\s+)?(?:my\s+)?reserve(?:\s+price)?/i);
    if (m?.[1]) out.reservePrice = m[1].replace(/,/g, "");
  }

  m = message.match(/(\d+)\s*(?:day|days)\b/i);
  if (m?.[1]) out.durationDays = m[1];
  else {
    m = message.match(/duration\s*(?:is|of|:)?\s*(\d+)/i);
    if (m?.[1]) out.durationDays = m[1];
  }

  if (out.startingBid) out.saleType = "auction";
  return out;
}

export function parseDraftFromHistory(history: SkyAiHistoryItem[]): Partial<SkyAiListingDraft> {
  let merged: Partial<SkyAiListingDraft> = {};
  for (const msg of history) {
    if (msg.role !== "assistant") continue;
    merged = { ...merged, ...parseDraftFromAssistantText(msg.content) };
  }
  return merged;
}

export type BuildListingDraftOptions = {
  /** When true, do not merge assistant history (subject changed). */
  skipHistoryMerge?: boolean;
  /** When true, ignore Quick Post form context (chat-only new subject). */
  skipFormContext?: boolean;
};

export function buildListingDraft(
  listingContext: SkyAiListingContext | null,
  history: SkyAiHistoryItem[],
  sessionDraft?: Partial<SkyAiListingDraft> | null,
  message?: string,
  options?: BuildListingDraftOptions
): SkyAiListingDraft {
  let draft: SkyAiListingDraft = {
    status: "draft",
    flow: sessionDraft?.flow ?? null,
    step: sessionDraft?.step ?? null,
    entityType: sessionDraft?.entityType,
    entityName: sessionDraft?.entityName,
    entityKey: sessionDraft?.entityKey,
  };

  if (!options?.skipFormContext) {
    draft = mergeDraftFields(draft, listingContext);
  }
  if (!options?.skipHistoryMerge) {
    draft = mergeDraftFields(draft, parseDraftFromHistory(history));
  }
  draft = mergeDraftFields(draft, sessionDraft);
  if (message?.trim()) {
    draft = mergeDraftFields(draft, parseAuctionParamsFromMessage(message));
  }

  if (draft.startingBid && draft.durationDays) {
    draft.status = draft.title && draft.description ? "complete" : "ready";
  }

  if (sessionDraft?.status) draft.status = sessionDraft.status;
  if (sessionDraft?.flow) draft.flow = sessionDraft.flow;
  if (sessionDraft?.step) draft.step = sessionDraft.step;

  return draft;
}

export function draftToListingFill(draft: SkyAiListingDraft): SkyAiListingFill {
  const fill: SkyAiListingFill = {};
  if (draft.title) fill.title = draft.title;
  if (draft.description) fill.description = draft.description;
  if (draft.category) fill.category = draft.category;
  if (draft.condition) fill.condition = draft.condition;
  if (draft.price) fill.price = draft.price;
  if (draft.listingType) fill.listingType = draft.listingType;
  if (draft.location) fill.location = draft.location;
  if (draft.saleType) fill.saleType = draft.saleType;
  if (draft.startingBid) fill.startingBid = draft.startingBid;
  if (draft.reservePrice) fill.reservePrice = draft.reservePrice;
  if (draft.durationDays) fill.auctionDuration = draft.durationDays;
  if (draft.vehicleMake) fill.vehicleMake = draft.vehicleMake;
  if (draft.vehicleModel) fill.vehicleModel = draft.vehicleModel;
  if (draft.vehicleYear) fill.vehicleYear = draft.vehicleYear;
  if (draft.vehicleOdometer) fill.vehicleOdometer = draft.vehicleOdometer;
  if (draft.vehicleColour) fill.vehicleColour = draft.vehicleColour;
  if (draft.vehicleBodyType) fill.vehicleBodyType = draft.vehicleBodyType;
  if (draft.vehicleFuelType) fill.vehicleFuelType = draft.vehicleFuelType;
  if (draft.vehicleTransmission) fill.vehicleTransmission = draft.vehicleTransmission;
  if (draft.servicePricingType) fill.servicePricingType = draft.servicePricingType;
  if (draft.serviceDuration) fill.serviceDuration = draft.serviceDuration;
  if (draft.serviceDeliveryMethod) fill.serviceDeliveryMethod = draft.serviceDeliveryMethod;
  return fill;
}

export function getMissingListingFields(draft: SkyAiListingDraft): string[] {
  const missing: string[] = [];
  if (!draft.title) missing.push("title");
  if (!draft.category) missing.push("category");
  if (!draft.price && !draft.servicePricingType) missing.push("price");
  if (!draft.condition) missing.push("condition");
  if (!draft.location) missing.push("location");
  return missing;
}

export function getMissingVehicleFields(draft: SkyAiListingDraft): string[] {
  const missing: string[] = [];
  if (!draft.vehicleMake) missing.push("make");
  if (!draft.vehicleModel) missing.push("model");
  if (!draft.vehicleYear) missing.push("year");
  if (!draft.vehicleOdometer) missing.push("odometer");
  if (!draft.vehicleColour) missing.push("colour");
  if (!draft.vehicleTransmission) missing.push("transmission");
  if (!draft.vehicleFuelType) missing.push("fuel type");
  return missing;
}

export function getMissingServiceFields(draft: SkyAiListingDraft): string[] {
  const missing: string[] = [];
  if (!draft.servicePricingType) missing.push("pricing type (fixed/quote)");
  if (!draft.serviceDuration) missing.push("duration");
  if (!draft.serviceDeliveryMethod) missing.push("delivery method");
  return missing;
}

export function getMissingAuctionFields(draft: SkyAiListingDraft): string[] {
  const missing: string[] = [];
  if (!draft.startingBid) missing.push("starting bid");
  if (!draft.durationDays) missing.push("duration (days)");
  return missing;
}

export function formatAuctionSummary(draft: SkyAiListingDraft): string {
  const lines = [
    draft.title ? `**${draft.title}** — auction settings:` : `Here's your auction setup so far:`,
    "",
  ];
  if (draft.startingBid) {
    lines.push(`Starting Bid: $${Number(draft.startingBid).toLocaleString()}`);
  }
  if (draft.reservePrice) {
    lines.push(`Reserve Price: $${Number(draft.reservePrice).toLocaleString()}`);
  }
  if (draft.durationDays) {
    const days = Number(draft.durationDays);
    lines.push(`Duration: ${days} day${days === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

export function formatDraftSummaryForPrompt(draft: SkyAiListingDraft): string {
  const snapshot: Record<string, unknown> = { status: draft.status };
  for (const key of DRAFT_STRING_KEYS) {
    const v = draft[key];
    if (v) snapshot[key] = v;
  }
  if (draft.flow) snapshot.currentFlow = draft.flow;
  if (draft.step) snapshot.currentStep = draft.step;
  if (draft.entityType) snapshot.entityType = draft.entityType;
  if (draft.entityName) snapshot.entityName = draft.entityName;
  if (draft.entityKey) snapshot.entityKey = draft.entityKey;
  return JSON.stringify(snapshot, null, 2);
}

export function userConfirmation(message: string): boolean {
  const q = message.trim().toLowerCase();
  return (
    /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|sounds good|create it|publish it|let's do it|lets do it)\b/.test(
      q
    ) ||
    /\b(create it|publish it|create the listing|create this listing|go ahead and create)\b/.test(q)
  );
}

export function userDeclined(message: string): boolean {
  return /^(no|nah|not yet|later|wait)\b/i.test(message.trim());
}

export function isAwaitingAuctionCreate(text: string): boolean {
  return (
    /create (?:this )?(?:auction )?listing(?: now)?/i.test(text) ||
    /would you like me to create/i.test(text) ||
    /shall i create (?:this )?listing/i.test(text) ||
    /ready to (?:create|publish)/i.test(text)
  );
}

export function isAwaitingTitleGeneration(text: string): boolean {
  return /generate the title|title and description|draft (?:the )?title|write (?:the )?title/i.test(
    text
  );
}

export function isAuctionDraftReady(draft: SkyAiListingDraft): boolean {
  return !!(draft.startingBid && draft.durationDays);
}

export function applyFlowToDraft(
  draft: SkyAiListingDraft,
  flow: SkyAiFlow | null,
  step: SkyAiStep | null
): SkyAiListingDraft {
  return { ...draft, flow, step };
}

export function mergeDraftUpdates(
  draft: SkyAiListingDraft,
  patch: Partial<SkyAiListingDraft> | null | undefined
): SkyAiListingDraft {
  return mergeDraftFields(draft, patch);
}
