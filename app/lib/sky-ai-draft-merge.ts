import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const MERGE_STRING_FIELDS = [
  "title",
  "description",
  "category",
  "condition",
  "price",
  "listingType",
  "location",
  "paymentType",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehicleOdometer",
  "vehicleColour",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "rentalPriceWeekly",
  "rentalPriceMonthly",
  "rentalDeposit",
  "stockQuantity",
  "serviceDuration",
] as const;

/** True when the sell form or session has an in-progress listing draft */
export function hasActiveListingDraft(draft: SkyAiListingContext | null | undefined): boolean {
  if (!draft) return false;
  if (draft.extras?.length) return true;
  return MERGE_STRING_FIELDS.some((k) => {
    const v = draft[k as keyof SkyAiListingContext];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function normalizeExtras(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeExtras(existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
  const a = normalizeExtras(existing);
  const b = normalizeExtras(incoming);
  if (!a.length && !b.length) return undefined;
  if (!b.length) return a.length ? a : undefined;
  return [...new Set(b)];
}

/** Merge AI LISTING_FILL onto the active draft — one source of truth, never drop prior fields */
export function mergeListingFillWithDraft(
  draft: SkyAiListingContext | null | undefined,
  incoming: SkyAiListingFill
): SkyAiListingFill {
  if (!draft || !hasActiveListingDraft(draft)) return { ...incoming };

  const merged: SkyAiListingFill = { ...incoming };

  for (const key of MERGE_STRING_FIELDS) {
    const inc = merged[key as keyof SkyAiListingFill];
    const prev = draft[key as keyof SkyAiListingContext];
    if ((!inc || !String(inc).trim()) && typeof prev === "string" && prev.trim()) {
      (merged as Record<string, string>)[key] = prev.trim();
    }
  }

  merged.extras = mergeExtras(draft.extras, incoming.extras);

  if (!merged.listingType && draft.listingType) {
    merged.listingType = draft.listingType;
  }

  return merged;
}

/** Human-readable draft summary for prompts and chat replies */
export function formatDraftPreview(draft: SkyAiListingContext): string {
  const lines: string[] = [];

  const type = draft.listingType || (draft.vehicleMake ? "vehicle" : "physical");

  if (type === "vehicle" || draft.vehicleMake || draft.vehicleModel) {
    const vehicle = [draft.vehicleYear, draft.vehicleMake, draft.vehicleModel]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (vehicle) lines.push(`Vehicle: ${vehicle}`);
    if (draft.vehicleOdometer) {
      const km = Number(String(draft.vehicleOdometer).replace(/[^\d]/g, ""));
      lines.push(`Mileage: ${km > 0 ? km.toLocaleString() : draft.vehicleOdometer} km`);
    }
    if (draft.vehicleColour) lines.push(`Colour: ${draft.vehicleColour}`);
    if (draft.vehicleTransmission) lines.push(`Transmission: ${draft.vehicleTransmission}`);
    if (draft.vehicleFuelType) lines.push(`Fuel: ${draft.vehicleFuelType}`);
    if (draft.vehicleBodyType) lines.push(`Body: ${draft.vehicleBodyType}`);
  } else if (type === "service") {
    if (draft.title) lines.push(`Service: ${draft.title}`);
    if (draft.serviceDuration) lines.push(`Turnaround: ${draft.serviceDuration}`);
  } else if (type === "rental") {
    if (draft.title) lines.push(`Rental: ${draft.title}`);
    if (draft.price) lines.push(`Daily rate: $${draft.price} NZD`);
  } else if (type === "digital") {
    if (draft.title) lines.push(`Digital product: ${draft.title}`);
  } else {
    if (draft.title) lines.push(`Item: ${draft.title}`);
    if (draft.condition) lines.push(`Condition: ${draft.condition}`);
  }

  if (draft.category) lines.push(`Category: ${draft.category}`);
  if (draft.price && type !== "rental") lines.push(`Price: $${draft.price} NZD`);
  if (draft.location) lines.push(`Location: ${draft.location}`);

  const extras = normalizeExtras(draft.extras);
  if (extras.length) {
    lines.push("Extras:");
    for (const e of extras) lines.push(`• ${e}`);
  }

  if (!lines.length && draft.description) {
    lines.push(`Description draft: ${draft.description.slice(0, 200)}${draft.description.length > 200 ? "…" : ""}`);
  }

  return lines.length ? lines.join("\n") : "(empty draft)";
}

export const AWHINA_DRAFT_UPDATE_MODE = `DRAFT UPDATE MODE (critical when ACTIVE LISTING DRAFT is present):

The user is editing ONE listing over multiple messages. Never start a fresh unrelated listing unless they clearly switch items (e.g. "actually I'm selling a PS5 instead").

1. **Treat new messages as updates** — add details, fix fields, answer follow-ups. Do NOT ignore new information.

2. **Incremental updates** — merge every new fact into the same draft:
   - User adds "recently serviced" → add to extras and weave into description
   - User adds "has paperwork and receipts" → extras include "Receipts included" / "Paperwork available"
   - User says "change mileage to 180k" → update vehicleOdometer to 180000
   - User says "remove recently serviced" → drop from extras and description
   - User says "add new tyres" → add to extras and description

3. **Support commands**: Add / Remove / Change / Replace — apply to fields and extras array.

4. **extras field** — maintain a string array in LISTING_FILL JSON with bullet-worthy add-ons (servicing, tyres, receipts, mods, included items). Send the FULL merged extras list every time, not just new items.

5. **Regenerate after every update**:
   - Start reply with **Updated listing draft:**
   - Show **Current Draft:** preview (use the same structure as formatDraftPreview)
   - Regenerate **title** and **description** using ALL known fields + extras + conversation context (LISTING DESCRIPTION VOICE)
   - Output LISTING_FILL with the COMPLETE merged draft (all vehicle fields, extras, title, description, price) — not a partial patch

6. **One source of truth** — never create a second draft. Same vehicle/item until user explicitly changes it.

LISTING_FILL must include "extras": ["Recently serviced", "New tyres"] when relevant (can be [] or omitted if none).`;
