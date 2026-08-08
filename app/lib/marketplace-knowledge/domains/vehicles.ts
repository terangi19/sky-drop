/**
 * Vehicles domain module — wraps existing resolveVehicleIdentity.
 * Adds chassis/generation awareness without inventing trims or values.
 */

import { resolveVehicleIdentity } from "../../sky-ai-find-routing";
import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
} from "../types";

/** Controlled chassis → generation (LOCAL_DATA). Never invents model years as listing year. */
const CHASSIS_GENERATIONS: ReadonlyArray<{
  pattern: RegExp;
  code: string;
  name: string;
  family: string;
  make: string;
}> = [
  { pattern: /\be92\b/i, code: "E92", name: "E92 (3 Series coupe)", family: "3 Series", make: "BMW" },
  { pattern: /\be90\b/i, code: "E90", name: "E90 (3 Series sedan)", family: "3 Series", make: "BMW" },
  { pattern: /\be93\b/i, code: "E93", name: "E93 (3 Series convertible)", family: "3 Series", make: "BMW" },
  { pattern: /\be46\b/i, code: "E46", name: "E46 (3 Series)", family: "3 Series", make: "BMW" },
  { pattern: /\be36\b/i, code: "E36", name: "E36 (3 Series)", family: "3 Series", make: "BMW" },
  { pattern: /\bf30\b/i, code: "F30", name: "F30 (3 Series)", family: "3 Series", make: "BMW" },
  { pattern: /\bf80\b/i, code: "F80", name: "F80 (M3)", family: "M3", make: "BMW" },
  { pattern: /\bg20\b/i, code: "G20", name: "G20 (3 Series)", family: "3 Series", make: "BMW" },
];

/** User-stated trims — preserved, never invented when absent. */
const USER_TRIM_RE =
  /\b(gt[\s-]?t|gtt|gt[\s-]?r|gtr|type[\s-]?r|sti|ss|sr5|trd|nismo|amg|m[\s-]?sport|m\s*packet|v8|twin[\s-]?turbo|turbo)\b/i;

const VEHICLE_DETECT =
  /\b(bmw|toyota|mazda|honda|ford|nissan|subaru|hyundai|kia|volkswagen|vw|audi|mercedes|holden|lexus|suzuki|isuzu|jeep|ute|car|vehicle|skyline|supra|hilux|ranger|civic|corolla|axela|r[\s-]?3[2-4]|e9[0-3]|f30|g20|335i|330i|320[di]|wrx|mustang|navara|commodore|rx[\s-]?[78]|km\b|odometer)\b/i;

function extractUserTrim(text: string): string | undefined {
  const m = text.match(USER_TRIM_RE);
  if (!m?.[1]) return undefined;
  const raw = m[1].replace(/\s+/g, "-");
  if (/^gt[\s-]?t$/i.test(raw) || /^gtt$/i.test(raw)) return "GT-T";
  if (/^gt[\s-]?r$/i.test(raw) || /^gtr$/i.test(raw)) return "GT-R";
  if (/^type[\s-]?r$/i.test(raw)) return "Type R";
  if (/^sti$/i.test(raw)) return "STI";
  if (/^m[\s-]?sport$/i.test(raw)) return "M Sport";
  return raw
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

function detectChassis(text: string) {
  for (const row of CHASSIS_GENERATIONS) {
    if (row.pattern.test(text)) return row;
  }
  return null;
}

function buildEntity(
  text: string,
  identity: ReturnType<typeof resolveVehicleIdentity>,
  chassis: ReturnType<typeof detectChassis>,
  trim: string | undefined
): MarketplaceEntity {
  const attributes: Attribute[] = [];
  const userFacts: string[] = [];
  const unknowns: string[] = [];
  const needsCurrentCheck: string[] = ["market value", "current comps"];

  if (trim) {
    userFacts.push(trim);
    attributes.push({
      key: "trim",
      value: trim,
      provenance: "USER",
    });
  }

  if (identity.year) {
    attributes.push({
      key: "year",
      value: identity.year,
      provenance: "LOCAL_DATA",
    });
  }

  if (chassis) {
    attributes.push({
      key: "generation",
      value: chassis.code,
      provenance: "LOCAL_DATA",
    });
  }

  const make = identity.make || chassis?.make;
  const modelParts = [
    identity.model,
    !identity.model && chassis ? chassis.family : undefined,
    trim && !identity.model?.toLowerCase().includes(trim.toLowerCase()) ? trim : undefined,
  ].filter(Boolean) as string[];

  // Prefer identity model; append user trim only when not already in model string
  let modelName = identity.model || (chassis ? chassis.family : undefined);
  if (trim && modelName && !modelName.toLowerCase().includes(trim.toLowerCase().replace(/-/g, ""))) {
    // Keep GT-T as user fact on display, don't invent into canonical model id
    modelName = `${modelName}`;
  }

  if (!make) unknowns.push("make");
  if (!modelName) unknowns.push("model");
  if (!identity.year) unknowns.push("year");

  const displayBits = [
    identity.year,
    make,
    modelName,
    chassis && !String(modelName || "").includes(chassis.code) ? chassis.code : undefined,
    trim,
  ].filter(Boolean);

  const confidence =
    identity.confidence === "high" || (make && modelName)
      ? "high"
      : make || modelName || chassis
        ? "medium"
        : "low";

  return {
    domain: "vehicles",
    brand: make ? { id: make.toLowerCase(), name: make } : undefined,
    family: chassis
      ? { id: chassis.family.toLowerCase().replace(/\s+/g, "-"), name: chassis.family, brandId: make?.toLowerCase() }
      : undefined,
    model: modelName
      ? {
          id: modelName.toLowerCase().replace(/\s+/g, "-"),
          name: modelName,
          brandId: make?.toLowerCase(),
        }
      : undefined,
    generation: chassis
      ? {
          id: chassis.code.toLowerCase(),
          name: chassis.name,
          code: chassis.code,
        }
      : undefined,
    category: {
      id: "cars",
      label: "Cars",
      skyDropCategory: "Cars",
      listingTypeHint: "vehicle",
    },
    attributes,
    displayName: displayBits.join(" ") || text.trim().slice(0, 80),
    confidence,
    provenance: identity.confidence === "high" || chassis ? "LOCAL_DATA" : "MODEL_INFERENCE",
    userFacts,
    unknowns,
    needsCurrentCheck,
  };
}

function resolve(input: DomainResolveInput): DomainResolveResult {
  const text = String(input.text || "").trim();
  if (!text) return { hit: false, score: 0 };

  const identity = resolveVehicleIdentity(text);
  const chassis = detectChassis(text);
  const trim = extractUserTrim(text);
  const detectScore = VEHICLE_DETECT.test(text) ? 0.4 : 0;

  if (
    identity.confidence === "low" &&
    !chassis &&
    !trim &&
    detectScore < 0.4 &&
    !identity.make &&
    !identity.model
  ) {
    return { hit: false, score: 0 };
  }

  if (!identity.make && !identity.model && !chassis && detectScore < 0.4) {
    return { hit: false, score: 0 };
  }

  const entity = buildEntity(text, identity, chassis, trim);
  const score =
    (identity.confidence === "high" ? 0.9 : identity.confidence === "medium" ? 0.7 : 0.45) +
    (chassis ? 0.15 : 0) +
    detectScore * 0.2;

  const clarify: DomainClarifyAsk[] = [];
  if (!entity.brand && entity.confidence !== "high") {
    clarify.push({
      field: "make",
      question: "Which make is it — e.g. Nissan, BMW, Toyota?",
      priority: 1,
    });
  } else if (!entity.model) {
    clarify.push({
      field: "model",
      question: "Which model — e.g. Skyline R34, 335i, Hilux?",
      priority: 1,
    });
  } else if (!identity.year && entity.confidence === "medium") {
    clarify.push({
      field: "year",
      question: "What year is the vehicle?",
      priority: 2,
    });
  }

  return { hit: true, entity, clarify, score: Math.min(1, score) };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  const has = (k: string) => entity.attributes.some((a) => a.key === k) || entity.userFacts.some((f) => f.toLowerCase().includes(k));
  if (!entity.brand) asks.push({ field: "make", question: "Make?", priority: 1 });
  if (!entity.model) asks.push({ field: "model", question: "Model?", priority: 1 });
  if (entity.unknowns.includes("year")) {
    asks.push({ field: "year", question: "What year?", priority: 2 });
  }
  if (!has("odometer") && !/km|odometer/i.test(entity.displayName)) {
    asks.push({ field: "odometer", question: "Rough odometer (km)?", priority: 3 });
  }
  asks.push({ field: "price", question: "Asking price?", priority: 4 });
  asks.push({ field: "location", question: "Where is it listed from?", priority: 5 });
  return asks;
}

export const vehiclesDomain: MarketplaceDomainModule = {
  id: "vehicles",
  detect: (text) => (VEHICLE_DETECT.test(text) ? 0.8 : 0),
  resolve,
  enrichmentPriority,
};
