/**
 * Generic semantic description facts — category-agnostic atom layer.
 * Writers consume cleaned, deduplicated facts; no product templates.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  getVariantExtra,
  composeVehicleIdentityTitle,
} from "./awhina-pending-slots";
import {
  groupedSellerEvidenceFromExtras,
  type GroupedSellerEvidence,
} from "./awhina-seller-evidence";
import {
  composeNaturalConditionProse,
  composeNaturalIncludedProse,
  composeNaturalModificationProse,
} from "./awhina-description-fact-compose";
import {
  parseSellerMessageToFactModel,
  semanticFactModelToPublicExtras,
  validateStructuredSellerFactModel,
} from "./awhina-semantic-parser";

export type SemanticFactKind =
  | "identity"
  | "condition"
  | "spec"
  | "feature"
  | "included"
  | "modification"
  | "maintenance"
  | "history"
  | "defect"
  | "mechanical"
  | "compliance"
  | "logistics"
  | "location"
  | "service_term"
  | "rental_term"
  | "wanted_term"
  | "note";

export type SemanticFactSource =
  | "title"
  | "field"
  | "extra"
  | "evidence"
  | "lifted";

export type SemanticDescriptionFact = {
  kind: SemanticFactKind;
  text: string;
  source: SemanticFactSource;
  /** Stable key for dedupe (normalized). */
  key: string;
};

const STOP_TOKENS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "for",
  "in",
  "on",
  "of",
  "to",
  "is",
  "are",
  "has",
  "have",
  "used",
  "condition",
  "comes",
  "includes",
  "fitted",
  "modified",
  "upgraded",
]);

/** Normalize buyer-facing fact text for semantic comparison. */
export function normalizeSemanticFactText(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/variant:\s*/gi, "")
    .replace(/colour:\s*|color:\s*/gi, "")
    .replace(/storage:\s*/gi, "")
    .replace(/included:\s*|modification:\s*|maintenance:\s*|conditiondetail:\s*|mechanical:\s*|compliance:\s*|note:\s*/gi, "")
    .replace(/\b(\d{1,3}),(\d{3})(?=\D|$)/g, "$1$2")
    .replace(/[,.;:!?()/\\]+/g, " ")
    .replace(/\b(\d{1,3})\s+(\d{3})(?=\D|$)/g, "$1$2")
    .replace(/\b(\d+)\s*k(?:m|ms)?\b/gi, "$1 km")
    .replace(/\blike[\s-]+new\b/g, "like-new")
    .replace(/\bbrand[\s-]+new\b/g, "brand-new")
    .replace(/\bgood\s+used\s+condition\b/g, "good-condition")
    .replace(/\bgood\s+condition\b/g, "good-condition")
    .replace(/\bfair\s+used\s+condition\b/g, "fair-condition")
    .replace(/\bfair\s+condition\b/g, "fair-condition")
    .replace(/\bbattery\s+health\s*(?:is\s*|at\s*)?/g, "battery ")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticFactKey(kind: SemanticFactKind, text: string): string {
  const norm = normalizeSemanticFactText(text);
  const tokens = norm
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
  const core = (tokens.length ? tokens : norm.split(/\s+/)).join(" ");
  // Specs that are primarily numeric share a typed key
  if (kind === "spec") {
    const odo = core.match(/\b(\d{3,7})\s*km\b/);
    if (odo) return `spec:odo:${odo[1]}`;
    const batt = core.match(/\b(\d{1,3})\s*%/);
    if (batt) return `spec:battery:${batt[1]}`;
    const storage = core.match(/\b(\d+)\s*(gb|tb)\b/);
    if (storage) return `spec:storage:${storage[1]}${storage[2]}`;
  }
  if (kind === "condition") return `condition:${core.replace(/\s+/g, "-")}`;
  if (kind === "location") return `location:${core}`;
  return `${kind}:${core}`;
}

function distinctiveTokens(text: string): string[] {
  return normalizeSemanticFactText(text)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

/** True when `candidate` is already covered by `cover` (token overlap). */
export function semanticFactCoveredBy(candidate: string, cover: string): boolean {
  const a = distinctiveTokens(candidate);
  const b = new Set(distinctiveTokens(cover));
  if (!a.length) return true;
  if (!b.size) return false;
  const hit = a.filter((t) => b.has(t)).length;
  return hit >= Math.max(1, Math.ceil(a.length * 0.7));
}

const SOURCE_RANK: Record<SemanticFactSource, number> = {
  field: 4,
  evidence: 3,
  extra: 2,
  lifted: 1,
  title: 0,
};

/**
 * Prefer structured fields over freeform duplicates of the same fact.
 */
export function dedupeSemanticFacts(
  facts: SemanticDescriptionFact[]
): SemanticDescriptionFact[] {
  const byKey = new Map<string, SemanticDescriptionFact>();
  for (const fact of facts) {
    if (!fact.text?.trim()) continue;
    const existing = byKey.get(fact.key);
    if (!existing) {
      byKey.set(fact.key, fact);
      continue;
    }
    if (SOURCE_RANK[fact.source] > SOURCE_RANK[existing.source]) {
      byKey.set(fact.key, fact);
    } else if (
      SOURCE_RANK[fact.source] === SOURCE_RANK[existing.source] &&
      fact.text.length > existing.text.length
    ) {
      byKey.set(fact.key, fact);
    }
  }

  const list = [...byKey.values()];
  const identity = list
    .filter((f) => f.kind === "identity")
    .map((f) => f.text)
    .join(" ");

  return list.filter((fact) => {
    if (fact.kind === "identity") return true;
    // Drop extras that only restate identity (e.g. SR5 already in title)
    if (
      (fact.kind === "spec" || fact.kind === "feature" || fact.kind === "note") &&
      identity &&
      semanticFactCoveredBy(fact.text, identity) &&
      distinctiveTokens(fact.text).length <= 3
    ) {
      // Keep colour/storage/battery even if partially in title wording
      if (
        /\b(?:gb|tb|km|%|black|white|silver|grey|gray|blue|red|titanium|natural)\b/i.test(
          fact.text
        )
      ) {
        return true;
      }
      return false;
    }
    return true;
  });
}

function pushFact(
  out: SemanticDescriptionFact[],
  kind: SemanticFactKind,
  text: string | undefined | null,
  source: SemanticFactSource
): void {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return;
  if (/^(domain|objecttype|listingtype|categoryid|fieldsource|visionconfidence):/i.test(cleaned)) {
    return;
  }
  out.push({
    kind,
    text: cleaned.replace(/^(variant|colour|color|storage|size):\s*/i, "").trim() || cleaned,
    source,
    key: semanticFactKey(kind, cleaned),
  });
}

/** Build semantic facts from a canonical listing fill. */
export function buildSemanticDescriptionFacts(
  fill: SkyAiListingFill
): SemanticDescriptionFact[] {
  const domain = String(fill.listingType || "physical").toLowerCase();
  const raw: SemanticDescriptionFact[] = [];

  const identity =
    domain === "vehicle"
      ? composeVehicleIdentityTitle(fill) || fill.title
      : fill.title;
  pushFact(raw, "identity", identity, "title");

  pushFact(raw, "condition", fill.condition, "field");
  pushFact(raw, "location", fill.location || fill.pickupArea, "field");

  if (domain === "vehicle") {
    pushFact(raw, "spec", fill.vehicleColour, "field");
    pushFact(
      raw,
      "spec",
      fill.vehicleOdometer ? `${fill.vehicleOdometer} km` : undefined,
      "field"
    );
    pushFact(raw, "spec", fill.vehicleTransmission, "field");
    pushFact(raw, "spec", fill.vehicleFuelType, "field");
    pushFact(raw, "spec", fill.vehicleBodyType, "field");
    const variant = getVariantExtra(fill);
    if (variant) pushFact(raw, "spec", variant, "field");
  }

  for (const extra of fill.extras || []) {
    const e = String(extra || "").trim();
    if (!e) continue;
    const keyed = e.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (!keyed) {
      pushFact(raw, "note", e, "extra");
      continue;
    }
    const key = keyed[1].toLowerCase().replace(/_/g, "");
    const value = keyed[2].trim();
    if (key === "variant") pushFact(raw, "spec", value, "extra");
    else if (key === "storage" || key === "size" || key === "colour" || key === "color") {
      pushFact(raw, "spec", key === "storage" ? value : value, "extra");
    } else if (key === "modification" || key === "modifications") {
      pushFact(raw, "modification", value, "evidence");
    } else if (key === "maintenance") pushFact(raw, "maintenance", value, "evidence");
    else if (key === "included") pushFact(raw, "included", value, "evidence");
    else if (key === "conditiondetail") pushFact(raw, "defect", value, "evidence");
    else if (key === "mechanical") pushFact(raw, "mechanical", value, "evidence");
    else if (key === "compliance") pushFact(raw, "compliance", value, "evidence");
    else if (key === "logistics") pushFact(raw, "logistics", value, "evidence");
    else if (key === "note" || key === "sellernotes" || key === "sellernote") {
      pushFact(raw, "note", value, "evidence");
    } else if (
      key === "domain" ||
      key === "objecttype" ||
      key === "listingtype" ||
      key === "categoryid"
    ) {
      continue;
    } else if (key === "numbered" || key === "serial" || key === "grade" || key === "grader") {
      pushFact(raw, "spec", `${key === "numbered" ? "numbered " : ""}${value}`.trim(), "extra");
    } else {
      pushFact(raw, "note", value, "extra");
    }
  }

  return dedupeSemanticFacts(raw);
}

/**
 * Drop extras that only restate identity already present on the fill
 * (prevents "SR5." / "Natural Titanium" double-emission from extras prose).
 */
export function scrubExtrasAgainstIdentity(
  fill: SkyAiListingFill
): string[] {
  const identity = [
    fill.title,
    fill.vehicleMake,
    fill.vehicleModel,
    fill.vehicleYear,
    fill.vehicleGeneration,
    getVariantExtra(fill),
    fill.vehicleColour,
    fill.condition,
    fill.location,
  ]
    .filter(Boolean)
    .join(" ");

  const out: string[] = [];
  for (const raw of fill.extras || []) {
    const extra = String(raw || "").trim();
    if (!extra) continue;
    const keyed = extra.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (!keyed) {
      if (!semanticFactCoveredBy(extra, identity)) out.push(extra);
      continue;
    }
    const key = keyed[1].toLowerCase().replace(/_/g, "");
    const value = keyed[2].trim();
    // Always keep buyer evidence kinds (except included items that only restate identity)
    if (
      /^(modification|maintenance|conditiondetail|mechanical|compliance|logistics|note|sellernotes)$/i.test(
        key
      )
    ) {
      out.push(extra);
      continue;
    }
    if (key === "included") {
      // Drop "box" when identity is already "box trailer", etc.
      if (
        identity &&
        semanticFactCoveredBy(value, identity) &&
        distinctiveTokens(value).length <= 2
      ) {
        continue;
      }
      // Single generic packaging nouns that only restate identity (box trailer).
      // Keep them when they are accessories of a kit/set ("comes with case").
      if (
        distinctiveTokens(value).length === 1 &&
        /^(?:box|case|pack|kit|set)$/i.test(value.trim()) &&
        identity &&
        semanticFactCoveredBy(value, identity)
      ) {
        continue;
      }
      out.push(extra);
      continue;
    }
    // Variant must stay — writers compose identity from extras, not title text alone.
    if (key === "variant") {
      out.push(extra);
      continue;
    }
    // Keep storage even if title already has it — writers may need the atom.
    if (key === "storage" || key === "size") {
      out.push(extra);
      continue;
    }
    // Colour: keep on non-vehicle fills (physical uses colour: extras; vehicle uses field).
    if (key === "colour" || key === "color") {
      const isVehicle = String(fill.listingType || "").toLowerCase() === "vehicle";
      if (!isVehicle) {
        out.push(extra);
        continue;
      }
      if (fill.vehicleColour?.trim() && semanticFactCoveredBy(value, fill.vehicleColour)) {
        continue;
      }
      out.push(extra);
      continue;
    }
    out.push(extra);
  }
  return out;
}

/** Apply identity scrub + return fill ready for description composition. */
export function prepareFillForDescription(
  fill: SkyAiListingFill
): SkyAiListingFill {
  const semanticFactModel = validateStructuredSellerFactModel(fill.semanticFactModel)
    ? fill.semanticFactModel
    : parseSellerMessageToFactModel(undefined, fill);
  return {
    ...fill,
    semanticFactModel,
    extras: semanticFactModelToPublicExtras(semanticFactModel),
  };
}

/**
 * Domain-aware evidence grouping language.
 * Services/rentals/wanted avoid product accessory phrasing.
 * Condition/included/mods go through natural composition — never raw dumps.
 */
export function composeDomainAwareEvidenceProse(
  grouped: GroupedSellerEvidence,
  listingType?: string | null
): string {
  const domain = String(listingType || "physical").toLowerCase();
  const sentences: string[] = [];

  const joinAnd = (items: string[]): string => {
    const cleaned = items.map((i) => i.replace(/\.+$/, "").trim()).filter(Boolean);
    if (cleaned.length <= 1) return cleaned[0] || "";
    const lower = (t: string) =>
      /^[A-Z]{2,}/.test(t) || /^\d/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
    const tail = cleaned.slice(1).map(lower);
    if (cleaned.length === 2) return `${cleaned[0]} and ${tail[0]}`;
    return `${[cleaned[0], ...tail.slice(0, -1)].join(", ")} and ${tail[tail.length - 1]}`;
  };

  const ensure = (text: string): string => {
    const trimmed = text.replace(/\.+$/, "").trim();
    if (!trimmed) return "";
    const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(capped) ? capped : `${capped}.`;
  };

  if (grouped.modifications.length) {
    if (domain === "vehicle" || domain === "physical") {
      sentences.push(composeNaturalModificationProse(grouped.modifications));
    } else {
      sentences.push(
        composeNaturalIncludedProse(grouped.modifications, "Includes")
      );
    }
  }

  // Group maintenance / history into one sentence when multiple
  if (grouped.maintenance.length === 1) {
    sentences.push(ensure(grouped.maintenance[0]));
  } else if (grouped.maintenance.length > 1) {
    sentences.push(ensure(joinAnd(grouped.maintenance)));
  }

  // Defects / wear: expand jammed blobs → natural clauses (never raw dump)
  if (grouped.conditionDetails.length) {
    sentences.push(composeNaturalConditionProse(grouped.conditionDetails));
  }

  if (grouped.mechanical.length) {
    grouped.mechanical = grouped.mechanical.map((item) =>
      /^works?\s+(?:well|fine|great)$/i.test(item.trim())
        ? "In working order"
        : item
    );
    // Preserve denial + battery grouping from caller via single join when simple
    if (grouped.mechanical.length === 1) {
      sentences.push(ensure(grouped.mechanical[0]));
    } else {
      const battery = grouped.mechanical.find((i) => /\d{1,3}\s*%|battery/i.test(i));
      const denial = grouped.mechanical.find((i) => /\bno\b/i.test(i));
      const rest = grouped.mechanical.filter((i) => i !== battery && i !== denial);
      if (battery && denial) {
        sentences.push(
          ensure(`${battery.replace(/\.+$/, "")}, with ${denial.charAt(0).toLowerCase()}${denial.slice(1)}`)
        );
        if (rest.length) sentences.push(ensure(joinAnd(rest)));
      } else {
        sentences.push(ensure(joinAnd(grouped.mechanical)));
      }
    }
  }

  if (grouped.compliance.length) {
    const blob = grouped.compliance.join(" ").toLowerCase();
    if (/\bwof\b/.test(blob) && /\b(rego|registration)\b/.test(blob)) {
      sentences.push("WOF and registration are current.");
    } else {
      sentences.push(ensure(joinAnd(grouped.compliance)));
    }
  }

  if (grouped.included.length) {
    const phrased: string[] = [];
    const bare: string[] = [];
    for (const item of grouped.included) {
      if (/^(comes|includes|with|always)\b/i.test(item) || /\bused with\b/i.test(item)) {
        phrased.push(item);
      } else {
        bare.push(item);
      }
    }
    for (const item of phrased) sentences.push(ensure(item));
    if (bare.length) {
      const lead: "Comes with" | "Includes" | "Fitted with" =
        domain === "service" || domain === "rental" || domain === "wanted"
          ? "Includes"
          : domain === "vehicle"
            ? "Fitted with"
            : "Comes with";
      sentences.push(composeNaturalIncludedProse(bare, lead));
    }
  }

  for (const item of grouped.logistics) sentences.push(ensure(item));
  for (const item of grouped.notes) sentences.push(ensure(item));

  if (grouped.location) {
    const loc = grouped.location;
    const locPattern = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      !sentences.some((s) =>
        new RegExp(`\\b(?:in|located in)\\s+${locPattern}\\b`, "i").test(s)
      )
    ) {
      sentences.push(`Located in ${loc}.`);
    }
  }

  return sentences.filter(Boolean).join(" ");
}

/** Semantic merge of evidence extras — same meaning → keep one. */
export function mergeEvidenceExtrasSemantically(
  prior: string[] | undefined,
  incoming: string[] | undefined,
  opts?: { replaceAll?: boolean }
): string[] {
  if (opts?.replaceAll) return [...(incoming || [])];
  const a = prior || [];
  const b = incoming || [];
  if (!a.length) return [...b];
  if (!b.length) return [...a];

  const out = [...b];
  const keys = new Set(
    b.map((item) => {
      const m = item.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
      if (!m) return normalizeSemanticFactText(item);
      return semanticFactKey(
        mapExtraKeyToKind(m[1]),
        m[2]
      );
    })
  );

  for (const item of a) {
    const m = item.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    const key = m
      ? semanticFactKey(mapExtraKeyToKind(m[1]), m[2])
      : normalizeSemanticFactText(item);
    if (keys.has(key)) continue;
    // Also skip if any incoming covers this fact
    const value = m ? m[2] : item;
    if (b.some((inc) => semanticFactCoveredBy(value, inc))) continue;
    out.push(item);
    keys.add(key);
  }
  return out;
}

function mapExtraKeyToKind(rawKey: string): SemanticFactKind {
  const key = rawKey.toLowerCase().replace(/_/g, "");
  if (key === "modification" || key === "modifications") return "modification";
  if (key === "maintenance") return "maintenance";
  if (key === "included") return "included";
  if (key === "conditiondetail") return "defect";
  if (key === "mechanical") return "mechanical";
  if (key === "compliance") return "compliance";
  if (key === "logistics") return "logistics";
  if (key === "variant" || key === "storage" || key === "colour" || key === "color" || key === "size") {
    return "spec";
  }
  return "note";
}

/** Re-export helper for tests — grouped evidence from a prepared fill. */
export function evidenceGroupsFromFill(fill: SkyAiListingFill): GroupedSellerEvidence {
  return groupedSellerEvidenceFromExtras(fill.extras, fill.location || undefined);
}
