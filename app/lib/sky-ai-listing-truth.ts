import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import {
  buildServiceDescription,
  isGenericServiceDescription,
  sanitizeServiceDescription,
} from "./sky-ai-service-description";
import { polishSkyAiTitle } from "./sky-ai-title";
import {
  buildDescriptionTemplate,
  buildMissingInfoQuestions,
  hasEnoughForFullDescription,
  isLowInformationDescription,
  shouldUseDescriptionTemplate,
  SKY_AI_SPARSE_LISTING_RULES,
} from "./sky-ai-listing-description";
import {
  buildVehicleDescription,
  isGenericVehicleDescription,
  sanitizeVehicleDescription,
} from "./sky-ai-vehicle-description";

export type ListingConfidence = "low" | "medium" | "high";

export const SKY_AI_TRUTH_RULES = `
## ZERO HALLUCINATION (critical — never break this)

You must **never invent** listing facts the seller did not provide.

**Only use information from:**
1. What the user explicitly typed in chat
2. Fields already in LISTING DRAFT (sell form)
3. What is clearly visible in attached photos (describe only what you see)

**Never assume or invent:**
- Mileage / odometer (use **kilometres**, never miles unless user gave miles — then convert to km)
- WOF, registration, COF, service history, "recently serviced"
- Location, pickup city, shipping availability
- Modifications, rims, turbos, "supercharger", tune stage
- Condition, accessories, spare keys, number of owners
- "Arrange shipping", "pickup in Auckland", or any logistics not stated

**If important details are missing — ASK first.** Do not fill gaps with guesses.
Example reply when sparse:
"I need a bit more to write a strong listing:
- Condition?
- Mileage?
- Key features?
- Modifications?
- Location?"
(Or use a sectioned description template in LISTING_FILL for the seller to complete.)

**Descriptions — verified facts only (physical / vehicle / digital)**
- Bad: "Recently serviced with new WOF. Chrome rims. Pickup Auckland."
- Bad: "2007 BMW 335i Supercharged presented for sale. Contact seller for additional details."
- Bad (sparse): "2007 BMW 335i. Message me for mileage, WOF/registration…" — unfinished filler; **ask for details or use a section template** instead.
- Good (sparse): ask Condition / Mileage / Key features / Modifications / Location — OR LISTING_FILL with a sectioned template for the seller to complete.
- Good (enough detail): natural prose with verified facts only.
- Only mention mods using proper enthusiast terms **when the user stated them**: Twin Turbo, N54, 17T, Stage 2, Full Bolt-On, M Sport, Supercharged, Manual.
- Never combine unrelated terms (e.g. "Turbo Supercharger") unless both are explicitly provided.
- Never list selling-point bullets in your reply that are not verified.

**Service descriptions (listingType service) — different rules**
- Services are **not** "presented for sale". Write like a real freelancer or business owner.
- Explain: what the service is, who it's for, what the buyer receives, why to contact the seller.
- Request Quote: mention scope-based pricing; encourage buyers to send project details.
- Never use: "Service presented for sale", "Contact seller for additional details", "High quality service available".

**LISTING_FILL JSON**
- Omit any field you cannot verify. Empty is better than invented.
- Do not set \`location\`, \`vehicleOdometer\`, \`condition\` unless user/draft/photo confirmed.
- Title: Year + Make + Model + **one verified** selling point only — never concatenate random keywords.

**Listing Confidence**
- If information is sparse, say **Listing Confidence: Low** in your visible reply and ask follow-up questions.
- Do not output LISTING_FILL with a confident-sounding description when confidence is Low — use a **section template** or omit description; never low-information filler.

${SKY_AI_SPARSE_LISTING_RULES}
`.trim();

const NZ_LOCATIONS =
  /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston north|napier|nelson|rotorua|new plymouth|whangarei|invercargill|queenstown|gisborne|timaru|masterton)\b/i;

const VERIFIED_MOD_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bstage\s*2\b/i, label: "Stage 2" },
  { pattern: /\bstage\s*1\b/i, label: "Stage 1" },
  { pattern: /\bfull bolt[\s-]?on\b|\bfbo\b/i, label: "Full Bolt-On" },
  { pattern: /\b17t\b/i, label: "17T Twin Turbo" },
  { pattern: /\btwin\s*turbo\b|\btwinturbo\b/i, label: "Twin Turbo" },
  { pattern: /\bn54\b/i, label: "N54" },
  { pattern: /\bn55\b/i, label: "N55" },
  { pattern: /\bm\s*sport\b/i, label: "M Sport" },
  { pattern: /\blow\s*km\b|\blow\s*k\b/i, label: "Low KM" },
  { pattern: /\bsupercharg(?:ed|er)\b/i, label: "Supercharged" },
];

type VerifiedFields = {
  location: boolean;
  condition: boolean;
  vehicleMake: boolean;
  vehicleModel: boolean;
  vehicleYear: boolean;
  vehicleOdometer: boolean;
  vehicleTransmission: boolean;
  vehicleFuelType: boolean;
  vehicleBodyType: boolean;
  vehicleColour: boolean;
  userDescription: boolean;
  mods: boolean;
  wof: boolean;
  registration: boolean;
  serviceHistory: boolean;
  shipping: boolean;
  pickup: boolean;
  price: boolean;
};

export type VerifiedListingFacts = {
  blob: string;
  fields: VerifiedFields;
  verifiedSellingPoint: string | null;
};

const HALLUCINATION_LINE_PATTERNS: RegExp[] = [
  /\bwof\b/i,
  /\bregistration\b/i,
  /\brecently serviced\b/i,
  /\bnew wof\b/i,
  /\bchrome rims?\b/i,
  /\barrange shipping\b/i,
  /\bpickup in\b/i,
  /\bturbo supercharger\b/i,
  /\b\d{1,3}(?:,\d{3})*\s*miles?\b/i,
  /\bspare key\b/i,
  /\bone owner\b/i,
  /\bfull service history\b/i,
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasInBlob(blob: string, value?: string): boolean {
  if (!value?.trim()) return false;
  return blob.includes(norm(value));
}

function parseOdometerFromText(text: string): string | null {
  const km = text.match(/\b(\d{1,3}(?:,\d{3})*)\s*k(?:m|ms)?\b/i);
  if (km) return km[1]!.replace(/,/g, "");
  const miles = text.match(/\b(\d{1,3}(?:,\d{3})*)\s*miles?\b/i);
  if (miles) {
    const n = Number(miles[1]!.replace(/,/g, ""));
    if (Number.isFinite(n)) return String(Math.round(n * 1.60934));
  }
  return null;
}

export function buildVerifiedListingFacts(
  userMessage: string,
  listingContext?: SkyAiListingContext | null
): VerifiedListingFacts {
  const parts: string[] = [userMessage];
  if (listingContext) {
    for (const v of Object.values(listingContext)) {
      if (v != null && String(v).trim()) parts.push(String(v));
    }
  }
  const blob = norm(parts.join(" "));

  const ctx = listingContext || {};
  const userOdo = parseOdometerFromText(blob);
  const ctxOdo = ctx.vehicleOdometer?.replace(/[^\d]/g, "");

  const fields: VerifiedFields = {
    location: !!(ctx.location?.trim() || NZ_LOCATIONS.test(blob)),
    condition: !!ctx.condition?.trim() || /\b(new|like new|good condition|fair condition|used)\b/i.test(blob),
    vehicleMake: !!ctx.vehicleMake?.trim() || /\b(bmw|toyota|honda|ford|mazda|nissan|subaru|mercedes|audi|holden|hyundai|kia|lexus|porsche|tesla)\b/i.test(blob),
    vehicleModel: !!ctx.vehicleModel?.trim(),
    vehicleYear: !!ctx.vehicleYear?.trim() || /\b(19|20)\d{2}\b/.test(blob),
    vehicleOdometer: !!(ctxOdo || userOdo),
    vehicleTransmission:
      !!ctx.vehicleTransmission?.trim() || /\b(manual|automatic|auto|cvt|dct)\b/i.test(blob),
    vehicleFuelType:
      !!ctx.vehicleFuelType?.trim() || /\b(petrol|diesel|hybrid|electric|ev|plug-?in)\b/i.test(blob),
    vehicleBodyType:
      !!ctx.vehicleBodyType?.trim() || /\b(coupe|sedan|suv|ute|wagon|hatch|van|truck)\b/i.test(blob),
    vehicleColour: !!ctx.vehicleColour?.trim() || /\b(black|white|silver|grey|gray|red|blue|green|yellow|gold|bronze)\b/i.test(blob),
    userDescription: !!ctx.description?.trim(),
    mods:
      VERIFIED_MOD_PATTERNS.some((m) => m.pattern.test(blob)) ||
      /\b(downpipe|intercooler|jb4|tune|modified|modded)\b/i.test(blob),
    wof: /\bwof\b/i.test(blob),
    registration: /\b(reg|registration|rego)\b/i.test(blob),
    serviceHistory: /\b(service history|recently serviced|full service)\b/i.test(blob),
    shipping: /\b(shipping|ships|postage|courier)\b/i.test(blob),
    pickup: /\b(pickup|pick up|collection)\b/i.test(blob),
    price: !!ctx.price?.trim() || /\$\s*\d+|\b\d+\s*nzd\b/i.test(blob),
  };

  if (ctx.vehicleMake?.trim()) fields.vehicleMake = true;
  if (ctx.vehicleModel?.trim()) fields.vehicleModel = true;
  if (ctx.vehicleYear?.trim()) fields.vehicleYear = true;

  let verifiedSellingPoint: string | null = null;
  if (fields.mods) {
    for (const { pattern, label } of VERIFIED_MOD_PATTERNS) {
      if (pattern.test(blob)) {
        verifiedSellingPoint = label;
        break;
      }
    }
  }
  if (!verifiedSellingPoint && fields.vehicleTransmission && /\bmanual\b/i.test(blob)) {
    verifiedSellingPoint = "Manual";
  }
  if (!verifiedSellingPoint && fields.mods && /\bm\s*sport\b/i.test(blob)) {
    verifiedSellingPoint = "M Sport";
  }

  return { blob, fields, verifiedSellingPoint };
}

function countVerifiedVehicleFacts(fields: VerifiedFields): number {
  let n = 0;
  if (fields.vehicleYear) n += 1;
  if (fields.vehicleMake) n += 1;
  if (fields.vehicleModel) n += 1;
  if (fields.vehicleOdometer) n += 1;
  if (fields.condition) n += 1;
  if (fields.location) n += 1;
  if (fields.vehicleTransmission) n += 1;
  if (fields.vehicleColour) n += 1;
  return n;
}

export function assessListingConfidence(
  facts: VerifiedListingFacts,
  listingType?: string
): ListingConfidence {
  const isVehicle = listingType === "vehicle";
  const count = isVehicle
    ? countVerifiedVehicleFacts(facts.fields)
    : Object.values(facts.fields).filter(Boolean).length;

  if (isVehicle) {
    if (count <= 2) return "low";
    if (count <= 4) return "medium";
    return "high";
  }
  if (count <= 2) return "low";
  if (count <= 4) return "medium";
  return "high";
}

function stripUnverifiedFillField(
  fill: SkyAiListingFill,
  facts: VerifiedListingFacts
): SkyAiListingFill {
  const out = { ...fill };
  const f = facts.fields;

  if (!f.location) delete out.location;
  if (!f.condition) delete out.condition;
  if (!f.vehicleOdometer) delete out.vehicleOdometer;
  if (!f.vehicleTransmission) delete out.vehicleTransmission;
  if (!f.vehicleFuelType) delete out.vehicleFuelType;
  if (!f.vehicleBodyType) delete out.vehicleBodyType;
  if (!f.vehicleColour) delete out.vehicleColour;

  if (out.vehicleMake && !hasInBlob(facts.blob, out.vehicleMake)) delete out.vehicleMake;
  if (out.vehicleModel && !hasInBlob(facts.blob, out.vehicleModel)) delete out.vehicleModel;
  if (out.vehicleYear && !hasInBlob(facts.blob, out.vehicleYear)) delete out.vehicleYear;

  if (f.vehicleOdometer) {
    const fromBlob = parseOdometerFromText(facts.blob);
    if (fromBlob) out.vehicleOdometer = fromBlob;
  }

  return out;
}

function sanitizeDescription(description: string, facts: VerifiedListingFacts): string {
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const sentence of sentences) {
    const unverifiedHallucination = HALLUCINATION_LINE_PATTERNS.some((p) => p.test(sentence));
    if (unverifiedHallucination) {
      if (pMatchesVerified(sentence, facts)) kept.push(sentence);
      continue;
    }
    if (/\b\d{1,3}(?:,\d{3})*\s*km\b/i.test(sentence) && !facts.fields.vehicleOdometer) continue;
    kept.push(sentence);
  }

  return kept.join(" ").trim();
}

function pMatchesVerified(sentence: string, facts: VerifiedListingFacts): boolean {
  if (/\bwof\b/i.test(sentence)) return facts.fields.wof;
  if (/\bregistration\b/i.test(sentence)) return facts.fields.registration;
  if (/\bchrome rims?\b/i.test(sentence)) return /\bchrome|rim/i.test(facts.blob);
  if (/\barrange shipping\b/i.test(sentence)) return facts.fields.shipping;
  if (/\bpickup in\b/i.test(sentence)) return facts.fields.pickup && facts.fields.location;
  if (/\brecently serviced\b/i.test(sentence)) return facts.fields.serviceHistory;
  if (/\bturbo supercharger\b/i.test(sentence)) {
    return /\bsupercharger\b/i.test(facts.blob) && /\bturbo\b/i.test(facts.blob);
  }
  return false;
}

export function buildVerifiedDescription(
  fill: SkyAiListingFill,
  facts: VerifiedListingFacts,
  listingType?: string
): string {
  if (!hasEnoughForFullDescription(listingType, facts)) {
    return buildDescriptionTemplate(listingType, fill, facts);
  }

  const identity = fill.title?.trim() || "Item";
  const details: string[] = [];

  if (facts.fields.condition && fill.condition) {
    details.push(fill.condition.replace(/^used\s*-\s*/i, "").toLowerCase());
  }
  if (facts.fields.location && fill.location) {
    details.push(`based in ${fill.location}`);
  }

  if (details.length >= 2) {
    return `${identity} — ${details.join(", ")}.`;
  }
  if (details.length === 1) {
    return `${identity} — ${details[0]}.`;
  }

  return buildDescriptionTemplate(listingType, fill, facts);
}

function buildVerifiedTitle(fill: SkyAiListingFill, facts: VerifiedListingFacts): string {
  const base = [fill.vehicleYear, fill.vehicleMake, fill.vehicleModel]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!base) {
    return polishSkyAiTitle(fill.title || "", fill, facts);
  }

  if (facts.verifiedSellingPoint) {
    return polishSkyAiTitle(`${base} ${facts.verifiedSellingPoint}`, fill, facts);
  }

  if (facts.fields.vehicleTransmission && fill.vehicleTransmission) {
    const t = fill.vehicleTransmission.toLowerCase();
    if (t.includes("manual")) return polishSkyAiTitle(`${base} Manual`, fill, facts);
  }

  return polishSkyAiTitle(base, fill, facts);
}

function sanitizeVisibleReply(text: string, facts: VerifiedListingFacts): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    const isBullet = /^[-*•]\s/.test(trimmed);
    if (isBullet) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      const bad = HALLUCINATION_LINE_PATTERNS.some((p) => p.test(content));
      if (bad && !pMatchesVerified(content, facts)) continue;
      if (/\b(turbo supercharger|chrome rims?|new wof|heavily modified)\b/i.test(content) &&
          !facts.fields.mods && !facts.fields.wof) {
        continue;
      }
    }
    out.push(line);
  }

  return out.join("\n").trim();
}

export type ListingFillGuardResult = {
  fill: SkyAiListingFill;
  listingConfidence: ListingConfidence;
  confidenceBanner: string;
  missingQuestions: string | null;
  needsMoreInfo: boolean;
  facts: VerifiedListingFacts;
};

export function applyListingTruthGuard(
  fill: SkyAiListingFill,
  options: {
    userMessage: string;
    listingContext?: SkyAiListingContext | null;
  }
): ListingFillGuardResult {
  const facts = buildVerifiedListingFacts(options.userMessage, options.listingContext);
  const listingType = fill.listingType || options.listingContext?.listingType;
  const confidence = assessListingConfidence(facts, listingType);

  let guarded = stripUnverifiedFillField(fill, facts);
  const isService = listingType === "service";
  const needsMoreInfo = shouldUseDescriptionTemplate(
    listingType,
    facts,
    guarded,
    options.listingContext
  );

  if (isService) {
    if (guarded.description) {
      const cleaned = sanitizeServiceDescription(
        sanitizeDescription(guarded.description, facts)
      );
      guarded.description =
        confidence === "low" || isGenericServiceDescription(cleaned)
          ? buildServiceDescription(guarded, facts)
          : cleaned || buildServiceDescription(guarded, facts);
    } else {
      guarded.description = buildServiceDescription(guarded, facts);
    }
  } else if (needsMoreInfo) {
    guarded.description = buildDescriptionTemplate(listingType, guarded, facts);
  } else if (listingType === "vehicle") {
    if (guarded.description) {
      const cleaned = sanitizeVehicleDescription(
        sanitizeDescription(guarded.description, facts)
      );
      const useTemplate =
        isLowInformationDescription(cleaned) ||
        isGenericVehicleDescription(cleaned) ||
        isGenericVehicleDescription(guarded.description);
      guarded.description = useTemplate
        ? buildVehicleDescription(guarded, facts)
        : cleaned || buildVehicleDescription(guarded, facts);
    } else {
      guarded.description = buildVehicleDescription(guarded, facts);
    }
  } else if (guarded.description) {
    const cleaned = sanitizeDescription(guarded.description, facts);
    const hallucinationHeavy =
      cleaned.length < guarded.description.length * 0.55 ||
      HALLUCINATION_LINE_PATTERNS.some((p) => p.test(guarded.description || ""));
    const useTemplate =
      isLowInformationDescription(cleaned) ||
      isGenericVehicleDescription(cleaned) ||
      isGenericVehicleDescription(guarded.description);
    guarded.description =
      hallucinationHeavy || useTemplate
        ? buildVerifiedDescription(guarded, facts, listingType)
        : cleaned || buildVerifiedDescription(guarded, facts, listingType);
  } else {
    guarded.description = buildVerifiedDescription(guarded, facts, listingType);
  }

  guarded.title = buildVerifiedTitle(guarded, facts);

  const missingQuestions = buildMissingInfoQuestions(listingType, facts);
  const confidenceBanner = needsMoreInfo
    ? "**Listing Confidence: Low** — I've added a description template for you to complete. Share more details for a finished listing."
    : confidence === "low"
      ? "**Listing Confidence: Low** — only verified details were used. Share more info for a stronger listing."
      : confidence === "medium"
        ? "**Listing Confidence: Medium** — based on limited verified details."
        : "**Listing Confidence: High** — based on solid verified information.";

  return {
    fill: guarded,
    listingConfidence: needsMoreInfo ? "low" : confidence,
    confidenceBanner,
    missingQuestions,
    needsMoreInfo,
    facts,
  };
}

export function enrichReplyWithListingTruth(
  replyText: string,
  guard: ListingFillGuardResult
): string {
  let text = sanitizeVisibleReply(replyText, guard.facts);
  const parts: string[] = [text];

  if (!text.includes("Listing Confidence")) {
    parts.push("", guard.confidenceBanner);
  }

  if (guard.missingQuestions) {
    const alreadyAsking =
      text.toLowerCase().includes("do you know") ||
      text.toLowerCase().includes("i need a bit more") ||
      text.toLowerCase().includes("condition?");
    if (!alreadyAsking) {
      parts.push("", guard.missingQuestions);
    }
  }

  return parts.join("\n").trim();
}
