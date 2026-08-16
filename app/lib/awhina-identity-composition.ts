/**
 * Generic attribute-vs-identity composition.
 *
 * Brand + grade / size / storage / transmission alone ≠ item identity.
 * Trading cards need subject (player/character) unless the photo is a sealed
 * product format (booster box, pack, tin, etc.); phones need model; cars need make+model.
 * No product-name hardcodes — rules are role-based.
 */

import type { AwhinaFactDomain } from "./awhina-domain-facts";
import { resolveFactDomain } from "./awhina-domain-facts";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type IdentityPartRole = "core" | "attribute" | "category" | "unknown";

export type IdentityPartKind =
  | "subject"
  | "product"
  | "brand"
  | "model"
  | "variant"
  | "year"
  | "set"
  | "parallel"
  | "grader"
  | "grade"
  | "serial"
  | "size"
  | "storage"
  | "colour"
  | "transmission"
  | "condition"
  | "category_noun"
  | "other";

export type SemanticIdentityPart = {
  value: string;
  role: IdentityPartRole;
  kind: IdentityPartKind;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
};

export type IdentityCompositionResult = {
  domain: AwhinaFactDomain;
  parts: SemanticIdentityPart[];
  /** True when noun phrase actually identifies an object */
  isComplete: boolean;
  /** Attribute-only or brand+attrs pretending to be identity */
  isMalformedIdentity: boolean;
  /** Safe short label when complete; empty when incomplete */
  displayIdentity: string;
  /** What we know (attrs + soft category) — never overclaims player/model */
  knownSummary: string;
  /** High-value missing core ask, e.g. player name */
  missingCoreQuestion: string | null;
  missingCoreHint: string | null;
  notes: string[];
};

const GRADER_RE = /\b(psa|bgs|cgc|sgc)\b/i;
const GRADE_PAIR_RE = /\b(psa|bgs|cgc|sgc)\s*([0-9]{1,2}(?:\.\d)?)\b/i;
const SERIAL_RE = /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/;
const STORAGE_RE = /\b\d+\s?(gb|tb)\b/i;
const SIZE_RE = /\b(?:size\s*)?(\d{1,2}(?:\.\d)?|xs|s|m|l|xl|xxl)\b/i;
const TRANSMISSION_RE = /\b(automatic|manual|auto|cvt|dsg)\b/i;
const CARD_CATEGORY_RE =
  /\b(trading\s*card|sports?\s*card|football\s*card|soccer\s*card|basketball\s*card|baseball\s*card|hockey\s*card|pokemon\s*card|tcg|rookie\s*card)\b/i;
const PRODUCT_LINE_BRANDISH =
  /\b(panini|topps|fleer|upper\s*deck|bowman|donruss|prizm|select|optic|chrome|mosaic|pokemon|yugioh|yu-gi-oh)\b/i;
const SEALED_CARD_PRODUCT_FORMAT_RE =
  /\b(?:booster\s*box|hobby\s*box|blaster\s*box|mega\s*box|booster\s*pack|multi\s*pack|starter\s*pack|sealed\s*set|\btin\b|\bpack\b|\bbox\b)\b/i;

function sealedTradingCardFormatFromFill(
  fill: Partial<SkyAiListingFill>
): string | undefined {
  const format = hasExtra(fill, "productFormat:") || hasExtra(fill, "format:");
  return format && SEALED_CARD_PRODUCT_FORMAT_RE.test(format) ? format : undefined;
}

/**
 * Tokens that are attributes alone — NOT product model digits (PlayStation 5, iPhone 15).
 * Bare 1–2 digit numbers stay in the core phrase; grade pairs are stripped earlier.
 */
const ATTRIBUTE_ONLY_TOKENS =
  /^(psa|bgs|cgc|sgc|gem|mint|auto|automatic|manual|cvt|new|used|sealed|graded)$/i;

function norm(s: string): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function articleFor(phrase: string): string {
  const t = phrase.trim();
  if (!t) return "a";
  return /^[aeiou]/i.test(t) ? "an" : "a";
}

function hasExtra(
  fill: Partial<SkyAiListingFill>,
  prefix: string
): string | undefined {
  const hit = (fill.extras || []).find((e) =>
    e.toLowerCase().startsWith(prefix.toLowerCase())
  );
  return hit ? hit.slice(prefix.length).trim() : undefined;
}

function classifyTokenRole(
  kind: IdentityPartKind,
  domain: AwhinaFactDomain
): IdentityPartRole {
  switch (kind) {
    case "subject":
    case "product":
    case "model":
      return "core";
    case "brand":
      // Brand alone is weak; with model/subject it supports core
      return domain === "TRADING_CARD" ? "attribute" : "core";
    case "variant":
    case "year":
    case "set":
    case "parallel":
    case "grader":
    case "grade":
    case "serial":
    case "size":
    case "storage":
    case "colour":
    case "transmission":
    case "condition":
      return "attribute";
    case "category_noun":
      return "category";
    default:
      return "unknown";
  }
}

/**
 * Split a freeform display/title into parts using domain-aware attribute detection.
 * Generic — does not hardcode player or set names.
 */
export function decomposeIdentityPhrase(
  raw: string,
  domain: AwhinaFactDomain
): SemanticIdentityPart[] {
  let rest = norm(raw);
  if (!rest) return [];
  const parts: SemanticIdentityPart[] = [];

  const grade = rest.match(GRADE_PAIR_RE);
  if (grade) {
    parts.push({
      value: grade[1].toUpperCase(),
      role: "attribute",
      kind: "grader",
    });
    parts.push({
      value: grade[2],
      role: "attribute",
      kind: "grade",
    });
    rest = rest.replace(grade[0], " ").replace(/\s+/g, " ").trim();
  }

  const serial = rest.match(SERIAL_RE);
  if (serial) {
    parts.push({
      value: `${serial[1]}/${serial[2]}`,
      role: "attribute",
      kind: "serial",
    });
    rest = rest.replace(serial[0], " ").replace(/\s+/g, " ").trim();
  }

  const storage = rest.match(STORAGE_RE);
  if (storage) {
    parts.push({
      value: storage[0].replace(/\s+/g, "").toUpperCase(),
      role: "attribute",
      kind: "storage",
    });
    rest = rest.replace(storage[0], " ").replace(/\s+/g, " ").trim();
  }

  const transmission = rest.match(TRANSMISSION_RE);
  if (transmission && (domain === "VEHICLE" || domain === "GENERIC")) {
    parts.push({
      value: transmission[1],
      role: "attribute",
      kind: "transmission",
    });
    rest = rest.replace(transmission[0], " ").replace(/\s+/g, " ").trim();
  }

  const size =
    domain === "GENERIC" || domain === "PHONE"
      ? null
      : rest.match(/\bsize\s+(\d{1,2}(?:\.\d)?|XS|S|M|L|XL|XXL)\b/i);
  if (size) {
    parts.push({
      value: size[1].toUpperCase(),
      role: "attribute",
      kind: "size",
    });
    rest = rest.replace(size[0], " ").replace(/\s+/g, " ").trim();
  }

  const cat = rest.match(CARD_CATEGORY_RE);
  if (cat) {
    parts.push({
      value: cat[1].toLowerCase(),
      role: "category",
      kind: "category_noun",
    });
    rest = rest.replace(cat[0], " ").replace(/\s+/g, " ").trim();
  }

  // Product-line / publisher brands on cards are attributes, not identity
  if (domain === "TRADING_CARD") {
    const line = rest.match(PRODUCT_LINE_BRANDISH);
    if (line) {
      parts.push({
        value: line[1].replace(/\s+/g, " "),
        role: "attribute",
        kind: "brand",
      });
      rest = rest.replace(line[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  rest = rest
    .replace(/\b(graded|gem\s*mint|for\s*sale|looking\s*like|looks\s*like)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (rest) {
    const tokens = rest.split(/\s+/).filter((t) => !ATTRIBUTE_ONLY_TOKENS.test(t));
    const core = tokens.join(" ").trim();
    if (core) {
      const kind: IdentityPartKind =
        domain === "TRADING_CARD"
          ? "subject"
          : domain === "VEHICLE" || domain === "PHONE"
            ? "product"
            : "product";
      parts.unshift({
        value: core,
        role: "core",
        kind,
        confidence: "MEDIUM",
      });
    }
  }

  return parts;
}

function partsFromFill(fill: Partial<SkyAiListingFill>): SemanticIdentityPart[] {
  const domain = resolveFactDomain(fill);
  const parts: SemanticIdentityPart[] = [];

  const subject = hasExtra(fill, "subject:");
  if (subject) {
    parts.push({ value: subject, role: "core", kind: "subject", confidence: "HIGH" });
  }
  const productFormat = hasExtra(fill, "productFormat:") || hasExtra(fill, "format:");
  if (productFormat) {
    const sealed = SEALED_CARD_PRODUCT_FORMAT_RE.test(productFormat);
    parts.push({
      value: productFormat,
      role: sealed ? "core" : "attribute",
      kind: "product",
      confidence: "HIGH",
    });
  }
  const league = hasExtra(fill, "league:") || hasExtra(fill, "franchise:");
  if (league) {
    parts.push({ value: league, role: "attribute", kind: "set" });
  }
  const season = hasExtra(fill, "season:");
  if (season) {
    parts.push({ value: season, role: "attribute", kind: "year" });
  }
  const set = hasExtra(fill, "set:");
  if (set) {
    parts.push({ value: set, role: "attribute", kind: "set" });
  }
  const grade = hasExtra(fill, "grade:");
  if (grade) {
    const gm = grade.match(GRADE_PAIR_RE) || grade.match(/^([A-Z]+)\s+(.+)$/i);
    if (gm) {
      parts.push({ value: gm[1].toUpperCase(), role: "attribute", kind: "grader" });
      parts.push({ value: gm[2], role: "attribute", kind: "grade" });
    } else {
      parts.push({ value: grade, role: "attribute", kind: "grade" });
    }
  }
  const serial = hasExtra(fill, "serial:") || hasExtra(fill, "numbered:");
  if (serial) {
    parts.push({ value: serial, role: "attribute", kind: "serial" });
  }
  const storage = hasExtra(fill, "storage:");
  if (storage) {
    parts.push({ value: storage, role: "attribute", kind: "storage" });
  }
  const size = hasExtra(fill, "size:");
  if (size) {
    parts.push({ value: size, role: "attribute", kind: "size" });
  }

  if (fill.vehicleMake) {
    parts.push({
      value: fill.vehicleMake,
      role: "core",
      kind: "brand",
      confidence: "HIGH",
    });
  }
  if (fill.vehicleModel) {
    parts.push({
      value: fill.vehicleModel,
      role: "core",
      kind: "model",
      confidence: "HIGH",
    });
  }
  if (fill.vehicleGeneration) {
    parts.push({
      value: fill.vehicleGeneration,
      role: "attribute",
      kind: "variant",
    });
  }
  if (fill.vehicleYear) {
    parts.push({ value: fill.vehicleYear, role: "attribute", kind: "year" });
  }
  if (fill.vehicleTransmission) {
    parts.push({
      value: fill.vehicleTransmission,
      role: "attribute",
      kind: "transmission",
    });
  }
  if (fill.vehicleColour) {
    parts.push({
      value: fill.vehicleColour,
      role: "attribute",
      kind: "colour",
    });
  }

  // Title / display phrase — only if we still lack a subject/product core
  const hasCore = parts.some((p) => p.role === "core");
  if (!hasCore && fill.title?.trim()) {
    parts.push(...decomposeIdentityPhrase(fill.title, domain));
  }

  return parts;
}

function domainNeedsSubject(domain: AwhinaFactDomain): boolean {
  return domain === "TRADING_CARD";
}

function hasStrongCore(parts: SemanticIdentityPart[], domain: AwhinaFactDomain): boolean {
  const cores = parts.filter((p) => p.role === "core");
  if (!cores.length) return false;

  if (domain === "TRADING_CARD") {
    if (cores.some((p) => p.kind === "subject" && p.value.length >= 2)) return true;
    // Sealed pack/box/tin identity does not need a player/character.
    return cores.some(
      (p) => p.kind === "product" && SEALED_CARD_PRODUCT_FORMAT_RE.test(p.value)
    );
  }
  if (domain === "VEHICLE") {
    const hasMake = parts.some(
      (p) =>
        (p.kind === "brand" || p.kind === "product") &&
        (p.role === "core" || p.kind === "brand")
    );
    const hasModel = parts.some((p) => p.kind === "model" || p.kind === "product");
    // Need make+model-ish, not make alone with only transmission
    return (
      (parts.some((p) => p.kind === "brand") &&
        parts.some((p) => p.kind === "model")) ||
      cores.some((p) => p.kind === "product" && /\S+\s+\S+/.test(p.value))
    );
  }
  if (domain === "PHONE") {
    // Brand alone + storage is incomplete; need model token in product/model
    return cores.some(
      (p) =>
        (p.kind === "product" || p.kind === "model") &&
        !ATTRIBUTE_ONLY_TOKENS.test(p.value) &&
        p.value.length >= 2
    );
  }
  // GENERIC / GAMING / others: core must not be attribute-only residue
  return cores.some((p) => {
    const v = p.value.trim();
    if (v.length < 2) return false;
    if (ATTRIBUTE_ONLY_TOKENS.test(v)) return false;
    if (GRADE_PAIR_RE.test(v) || STORAGE_RE.test(v) || TRANSMISSION_RE.test(v)) {
      return false;
    }
    return true;
  });
}

function isAttrsOnlyMasquerading(parts: SemanticIdentityPart[]): boolean {
  const cores = parts.filter((p) => p.role === "core");
  const attrs = parts.filter((p) => p.role === "attribute");
  if (!attrs.length) return false;
  if (!cores.length) return true;
  // Core that is only a publisher/brand name with grades → malformed for cards
  if (
    cores.every((c) => PRODUCT_LINE_BRANDISH.test(c.value) || ATTRIBUTE_ONLY_TOKENS.test(c.value)) &&
    attrs.some((a) => a.kind === "grade" || a.kind === "grader" || a.kind === "storage" || a.kind === "size" || a.kind === "transmission")
  ) {
    return true;
  }
  return false;
}

function formatAttrSnippet(parts: SemanticIdentityPart[]): string {
  const grader = parts.find((p) => p.kind === "grader")?.value;
  const grade = parts.find((p) => p.kind === "grade")?.value;
  const brand = parts.find(
    (p) => p.kind === "brand" && p.role === "attribute"
  )?.value;
  const serial = parts.find((p) => p.kind === "serial")?.value;
  const storage = parts.find((p) => p.kind === "storage")?.value;
  const size = parts.find((p) => p.kind === "size")?.value;
  const transmission = parts.find((p) => p.kind === "transmission")?.value;
  const bits: string[] = [];
  if (grader && grade) bits.push(`${grader} ${grade}`);
  else if (grade) bits.push(`grade ${grade}`);
  if (brand) bits.push(brand);
  if (serial) bits.push(`numbered ${serial}`);
  if (storage) bits.push(storage);
  if (size) bits.push(`size ${size}`);
  if (transmission) bits.push(transmission);
  return bits.join(" ");
}

function categoryNoun(
  domain: AwhinaFactDomain,
  parts: SemanticIdentityPart[],
  fill?: Partial<SkyAiListingFill>
): string {
  const fromPart = parts.find((p) => p.kind === "category_noun")?.value;
  if (fromPart) return fromPart;
  const blob = [fill?.title, fill?.category, ...(fill?.extras || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (domain === "TRADING_CARD") {
    if (/football|soccer/.test(blob)) return "football card";
    if (/basketball/.test(blob)) return "basketball card";
    if (/baseball/.test(blob)) return "baseball card";
    if (/pokemon|tcg/.test(blob)) return "trading card";
    return "trading card";
  }
  if (domain === "PHONE") return "phone";
  if (domain === "VEHICLE") return "vehicle";
  if (domain === "GAMING") return "item";
  return "item";
}

/**
 * Assess whether a claimed identity is complete / malformed.
 */
export function assessIdentityCompleteness(input: {
  fill?: Partial<SkyAiListingFill>;
  claimedIdentity?: string;
  domain?: AwhinaFactDomain;
  extraParts?: SemanticIdentityPart[];
}): IdentityCompositionResult {
  const fill = input.fill || {};
  const domain = input.domain || resolveFactDomain(fill);
  const notes: string[] = [];

  let parts = partsFromFill(fill);
  if (input.claimedIdentity?.trim()) {
    const claimedParts = decomposeIdentityPhrase(input.claimedIdentity, domain);
    // Merge: prefer existing structured cores; add attrs/cores from claim
    for (const p of claimedParts) {
      const dup = parts.some(
        (x) =>
          x.kind === p.kind &&
          x.value.toLowerCase() === p.value.toLowerCase()
      );
      if (!dup) parts.push(p);
    }
  }
  if (input.extraParts?.length) {
    parts = [...parts, ...input.extraParts];
  }

  // Re-role brands on cards
  parts = parts.map((p) => {
    if (domain === "TRADING_CARD" && p.kind === "brand") {
      return { ...p, role: "attribute" as const };
    }
    if (domain === "TRADING_CARD" && p.kind === "product" && PRODUCT_LINE_BRANDISH.test(p.value)) {
      return { ...p, role: "attribute" as const, kind: "brand" as const };
    }
    return { ...p, role: p.role === "unknown" ? classifyTokenRole(p.kind, domain) : p.role };
  });

  const malformed = isAttrsOnlyMasquerading(parts);
  const strong = hasStrongCore(parts, domain) && !malformed;
  const cat = categoryNoun(domain, parts, fill);
  const attrSnippet = formatAttrSnippet(parts);
  const coreValues = parts
    .filter((p) => p.role === "core")
    .map((p) => p.value)
    .filter(Boolean);

  let displayIdentity = "";
  let knownSummary = "";
  let missingCoreQuestion: string | null = null;
  let missingCoreHint: string | null = null;

  if (strong) {
    displayIdentity = norm(
      [coreValues.join(" "), attrSnippet].filter(Boolean).join(" ")
    );
    knownSummary = displayIdentity;
  } else {
    notes.push("incomplete_identity");
    if (malformed) notes.push("malformed_attribute_identity");

    if (domain === "TRADING_CARD") {
      const sealedFormat = sealedTradingCardFormatFromFill(fill);
      const knownBits = [attrSnippet, sealedFormat || cat].filter(Boolean).join(" ");
      knownSummary = knownBits
        ? `${articleFor(knownBits)} ${knownBits}`.replace(/^an\s+([bcdfghjklmnpqrstvwxyz])/i, "a $1")
        : `a ${cat}`;
      knownSummary = attrSnippet
        ? `${articleFor(attrSnippet)} ${attrSnippet} ${sealedFormat || cat}`.replace(/\s+/g, " ")
        : `a ${sealedFormat || cat}`;
      if (!sealedFormat) {
        missingCoreHint = "player or character name";
        missingCoreQuestion =
          "I can't confidently read the player's name — who is it?";
      }
    } else if (domain === "PHONE") {
      const brand = parts.find((p) => p.kind === "brand")?.value;
      knownSummary = [attrSnippet, brand, cat].filter(Boolean).join(" ") || cat;
      knownSummary = `a ${knownSummary}`.replace(/\s+/g, " ");
      missingCoreHint = "model";
      missingCoreQuestion = brand
        ? `I can see it's ${articleFor(brand)} ${brand}${attrSnippet ? ` (${attrSnippet})` : ""}, but which model is it?`
        : "Which phone model is it?";
    } else if (domain === "VEHICLE") {
      const make = parts.find((p) => p.kind === "brand")?.value;
      knownSummary = [make, attrSnippet, cat].filter(Boolean).join(" ") || cat;
      knownSummary = `a ${knownSummary}`.replace(/\s+/g, " ");
      missingCoreHint = "make and model";
      missingCoreQuestion = make
        ? `I can see it's ${articleFor(make)} ${make}${attrSnippet ? ` ${attrSnippet}` : ""}, but what's the model?`
        : "What's the make and model?";
    } else {
      knownSummary = attrSnippet
        ? `${articleFor(attrSnippet)} ${attrSnippet} ${cat}`
        : `an item`;
      missingCoreHint = "what it is";
      missingCoreQuestion = attrSnippet
        ? `I can see ${attrSnippet}, but what exactly is the item?`
        : "What exactly are you listing?";
    }
  }

  // Completeness for cards: subject required unless this is a sealed product.
  const sealedFormat = sealedTradingCardFormatFromFill(fill);
  const needsSubject = domainNeedsSubject(domain) && !sealedFormat;
  const isComplete =
    strong &&
    (!needsSubject ||
      parts.some((p) => p.kind === "subject" && p.role === "core"));

  if (needsSubject && !isComplete && !missingCoreQuestion) {
    missingCoreHint = "player or character name";
    missingCoreQuestion =
      "I can't confidently read the player's name — who is it?";
  }

  if (strong && sealedFormat && !displayIdentity) {
    const manufacturer = hasExtra(fill, "manufacturer:") || hasExtra(fill, "brand:");
    const league = hasExtra(fill, "league:") || hasExtra(fill, "franchise:");
    const set = hasExtra(fill, "set:");
    displayIdentity = norm(
      [manufacturer, set, league, sealedFormat].filter(Boolean).join(" ")
    );
    knownSummary = displayIdentity;
  }

  return {
    domain,
    parts,
    isComplete,
    isMalformedIdentity: malformed || (!isComplete && Boolean(input.claimedIdentity?.trim()) && !coreValues.length),
    displayIdentity: isComplete ? displayIdentity : "",
    knownSummary: norm(knownSummary),
    missingCoreQuestion,
    missingCoreHint,
    notes,
  };
}

/**
 * Reject phrases that are attribute stacks pretending to be nouns.
 * Used by quality gates and vision adapters.
 */
export function isMalformedItemIdentity(
  phrase: string,
  domain?: AwhinaFactDomain
): boolean {
  const d = domain || "GENERIC";
  const r = assessIdentityCompleteness({
    claimedIdentity: phrase,
    domain: d,
    fill: d === "TRADING_CARD" ? { category: "Collectibles", extras: ["grade:PSA 10"] } : {},
  });
  // Heuristic fast-path for classic failures
  const t = norm(phrase);
  if (!t) return true;
  if (/^(psa|bgs|cgc|sgc)\s*\d/i.test(t) && !/\b[a-z]{3,}\s+[a-z]{3,}/i.test(t.replace(GRADE_PAIR_RE, " "))) {
    // "PSA 10 Panini" — grader + brand line, no person name
    if (PRODUCT_LINE_BRANDISH.test(t) || t.replace(GRADE_PAIR_RE, "").trim().split(/\s+/).length <= 2) {
      return true;
    }
  }
  if (/\b(nike|adidas|jordan)\b/i.test(t) && /\bsize\b/i.test(t) && t.split(/\s+/).length <= 4) {
    return true;
  }
  if (/\b(bmw|toyota|ford|honda)\b/i.test(t) && TRANSMISSION_RE.test(t) && t.split(/\s+/).length <= 3) {
    return true;
  }
  if (/\b(apple|samsung)\b/i.test(t) && STORAGE_RE.test(t) && !/\b(iphone|galaxy|pixel|ipad)\b/i.test(t)) {
    return true;
  }
  return r.isMalformedIdentity || (!r.isComplete && r.notes.includes("malformed_attribute_identity"));
}

export function looksLikeGraderToken(s: string): boolean {
  return GRADER_RE.test(s) || GRADE_PAIR_RE.test(s);
}

export function looksLikeSerialFraction(s: string): boolean {
  return SERIAL_RE.test(s);
}
