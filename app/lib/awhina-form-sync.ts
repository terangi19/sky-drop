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
  if (
    opts.allowDescriptionRewrite &&
    opts.fieldKey === "description"
  ) {
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
    // Empty prior lock must not clobber incoming seller facts.
    return incomingValue;
  }
  return priorValue !== undefined ? priorValue : incomingValue;
}

/**
 * Continuous form→storage sync must not erase a just-applied fill before React
 * state catches up. Prefer non-empty form values; otherwise keep pending fill /
 * prior draft values for the same keys.
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
