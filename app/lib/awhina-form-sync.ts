/**
 * Form ↔ canonical draft sync helpers for /post/ai.
 * One canonical value: if the draft has price/condition, the visible fields must too.
 */

import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type {
  ListingDraftFormSnapshot,
  ListingFieldProvenanceMap,
} from "./listing-draft-confirmed";
import { SEMANTIC_LISTING_FIELDS } from "./listing-draft-confirmed";
import { parseListingCondition } from "./awhina-listing-condition";

const FORM_SYNC_KEYS = [
  "title",
  "description",
  "category",
  "condition",
  "price",
  "location",
  "listingType",
  "paymentType",
  "vehicleMake",
  "vehicleModel",
  "vehicleGeneration",
  "vehicleYear",
  "vehicleOdometer",
  "vehicleColour",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "rentalSubType",
  "rentalPropertyType",
  "rentalPriceWeekly",
  "rentalPriceMonthly",
  "rentalDeposit",
  "rentalBedrooms",
  "rentalBathrooms",
  "rentalParkingSpaces",
  "rentalFurnishedStatus",
  "rentalPetsPolicy",
  "rentalAvailableDate",
  "rentalMinTenancy",
  "stockQuantity",
  "serviceDuration",
] as const satisfies ReadonlyArray<keyof ListingDraftFormSnapshot>;

export type FormSyncKey = (typeof FORM_SYNC_KEYS)[number];

/** Fields that must round-trip into visible Listing Details + publish payload. */
export const VISIBLE_FORM_SYNC_KEYS = [
  "title",
  "description",
  "category",
  "condition",
  "price",
  "location",
  "listingType",
  "vehicleMake",
  "vehicleModel",
  "vehicleGeneration",
  "vehicleYear",
  "vehicleOdometer",
  "vehicleColour",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "rentalPriceWeekly",
  "rentalPriceMonthly",
  "rentalDeposit",
  "rentalBedrooms",
  "rentalBathrooms",
] as const satisfies ReadonlyArray<keyof ListingDraftFormSnapshot>;

/**
 * USER locks must not block Āwhina from filling an empty field.
 * Only a non-empty USER value stays authoritative.
 */
export function shouldApplyFillToField(opts: {
  replaceDraft: boolean;
  userLocked: boolean;
  currentValue: unknown;
  incomingValue: unknown;
  allowDescriptionRewrite?: boolean;
  fieldKey?: keyof ListingDraftFormSnapshot;
}): boolean {
  if (opts.replaceDraft) return true;
  if (opts.allowDescriptionRewrite && opts.fieldKey === "description") {
    return true;
  }
  if (!opts.userLocked) return true;
  const current =
    typeof opts.currentValue === "string"
      ? opts.currentValue.trim()
      : opts.currentValue == null
        ? ""
        : String(opts.currentValue).trim();
  // Empty locked field: allow seller-stated / Āwhina facts to land.
  if (!current) return true;
  return false;
}

/** Do not let an empty USER-locked prior wipe a non-empty fill value. */
export function resolveLockedMergeValue(
  priorValue: unknown,
  incomingValue: unknown,
  userLocked: boolean
): unknown {
  if (!userLocked) return incomingValue;
  if (typeof priorValue === "string") {
    if (priorValue.trim()) return priorValue;
    return incomingValue;
  }
  return priorValue !== undefined ? priorValue : incomingValue;
}

function normalizeComparable(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Strip currency noise so controlled number inputs accept the value. */
export function normalizeFormPrice(raw: unknown): string {
  if (raw == null) return "";
  const cleaned = String(raw).replace(/[$,\s]/g, "").trim();
  if (!cleaned) return "";
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return "";
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

/** Map free-text / API condition onto chip values (Used - Like New, …). */
export function normalizeFormCondition(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return parseListingCondition(s) || s;
}

/**
 * Persistence proof for form sync — only visible semantic fields.
 * Booleans / extras / authority stamps must not fail the whole mutation.
 */
export function semanticDraftFieldsPersisted(
  expected: SkyAiListingFill,
  confirmed: SkyAiListingContext | null
): boolean {
  if (!confirmed) return false;
  for (const key of VISIBLE_FORM_SYNC_KEYS) {
    const next = expected[key as keyof SkyAiListingFill];
    if (typeof next !== "string" || !next.trim()) continue;
    if (
      normalizeComparable((confirmed as Record<string, unknown>)[key]) !==
      normalizeComparable(next)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Seller-stated price/condition/location must count as applied even when an
 * unrelated visible field (title lock, colour, etc.) fails round-trip.
 */
export function sellerFactsPersisted(
  fill: SkyAiListingFill,
  confirmed: SkyAiListingContext | null
): boolean {
  if (!confirmed) return false;
  const checks: Array<{ expected: string; actual: string }> = [];
  const price = normalizeFormPrice(fill.price);
  if (price) checks.push({ expected: price, actual: normalizeFormPrice(confirmed.price) });
  const condition = normalizeFormCondition(fill.condition);
  if (condition) {
    checks.push({
      expected: condition,
      actual: normalizeFormCondition(confirmed.condition),
    });
  }
  const location = String(fill.location || "").trim();
  if (location) {
    checks.push({
      expected: normalizeComparable(location),
      actual: normalizeComparable(confirmed.location),
    });
  }
  if (!checks.length) return false;
  return checks.every((c) => c.expected === c.actual);
}

/**
 * Continuous form→storage sync must not erase a just-applied fill before React
 * state catches up.
 */
export function reconcileListingDraftForSync(opts: {
  formConfirmed: SkyAiListingContext;
  prior: SkyAiListingContext | null;
  pendingFill: SkyAiListingFill | null;
  fieldProvenance: ListingFieldProvenanceMap;
  draftId: string;
}): SkyAiListingContext {
  const { formConfirmed, prior, pendingFill, fieldProvenance, draftId } = opts;
  const out: SkyAiListingContext = {
    ...formConfirmed,
    draftId,
    fieldProvenance,
  };

  const pick = (key: FormSyncKey) => {
    const formVal = formConfirmed[key as keyof SkyAiListingContext];
    if (typeof formVal === "string" && formVal.trim()) return;
    const pendingVal = pendingFill?.[key as keyof SkyAiListingFill];
    if (typeof pendingVal === "string" && pendingVal.trim()) {
      (out as Record<string, unknown>)[key] = pendingVal.trim();
      return;
    }
    const priorVal = prior?.[key as keyof SkyAiListingContext];
    if (typeof priorVal === "string" && priorVal.trim()) {
      (out as Record<string, unknown>)[key] = priorVal.trim();
    }
  };

  for (const key of FORM_SYNC_KEYS) pick(key);

  if (!out.extras?.length) {
    if (pendingFill?.extras?.length) out.extras = [...pendingFill.extras];
    else if (prior?.extras?.length) out.extras = [...prior.extras];
  }

  return out;
}

/** True when form React state has caught up with the last applied fill. */
export function formCaughtUpWithFill(
  form: Partial<
    Pick<
      ListingDraftFormSnapshot,
      "price" | "condition" | "location" | "title" | "description" | "category"
    >
  >,
  fill: SkyAiListingFill | null
): boolean {
  if (!fill) return true;
  const match = (a: unknown, b: unknown) =>
    String(a || "").trim() === String(b || "").trim();
  if (fill.price && !match(form.price, fill.price)) return false;
  if (fill.condition && !match(form.condition, fill.condition)) return false;
  if (fill.location && !match(form.location, fill.location)) return false;
  if (fill.title && !match(form.title, fill.title)) return false;
  return true;
}

/** Promote colour: extras onto vehicleColour for physical goods (one canonical colour). */
export function promoteColourFromExtras(fill: SkyAiListingFill): SkyAiListingFill {
  if (fill.vehicleColour?.trim()) return fill;
  const extras = Array.isArray(fill.extras) ? fill.extras : [];
  for (const extra of extras) {
    const m = String(extra || "").match(/^colou?r\s*:\s*(.+)$/i);
    if (m?.[1]?.trim()) {
      return { ...fill, vehicleColour: m[1].trim() };
    }
  }
  return fill;
}

export function isSemanticListingField(key: string): boolean {
  return (SEMANTIC_LISTING_FIELDS as readonly string[]).includes(key);
}
