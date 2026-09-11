import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  PUBLIC_SELLER_MEANING_CLASSES,
  type AtomicSellerFact,
  type IncludedItemFact,
  type SellerFactConflict,
  type SellerFactProvenance,
  type SellerMeaningClass,
  type StructuredSellerFactModel,
} from "./awhina-semantic-fact-model";
import {
  containsSellerMetaInstruction,
  sanitizePublicListingCopy,
  stripInternalOrchestrationOnly,
} from "./awhina-orchestration-boundary";
import { sanitizeListingExtras } from "./awhina-seller-evidence";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const INSTRUCTION_PATTERNS = [
  /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:make|write|create|generate|suggest|tell)\b(?:(?!\b(?:sell|selling|list|asking)\b).){0,80}/gi,
  /\b(?:please\s+)?(?:make|write|create|generate)\s+(?:the|this|my|a)?\s*(?:listing|title|description)\b(?:(?!\b(?:sell|selling|list)\b).){0,60}/gi,
  /\b(?:tell|help)\s+me\s+(?:what|which|how|to)\b(?:(?!\b(?:sell|selling|list)\b).){0,60}/gi,
  /\b(?:recommend|suggest)\s+(?:a\s+)?price\b(?:(?!\b(?:sell|selling|list)\b).){0,40}/gi,
  /\bdon'?t\s+(?:put|use|include|say|mention)\b(?:\s+\w+){0,6}(?=\s+(?:sell|selling|list|in\s+(?:the\s+)?ad)|$)/gi,
  /\btitle\s+it(?:\s+\w+){0,3}(?=\s+(?:don'?t|dont|sell|selling|list)|$)/gi,
  /\blisting_fill\b(?:\s+\w+){0,8}/gi,
  /\bsystem\s+prompt\b(?:\s+\w+){0,6}/gi,
  /\brespond\s+only\b(?:\s+\w+){0,6}/gi,
  /\bno\s+scams\b(?:\s+\w+){0,4}/gi,
  /\bno\s+time\s*wasters?\b(?:\s+\w+){0,4}/gi,
  /\bserious\s+only\b/gi,
];

const INTENT_PATTERNS = [
  /\b(?:just\s+)?want\s+(?:it|this|them)?\s*gone\b/gi,
  /\bneed\s+(?:a\s+)?quick\s+sale\b/gi,
  /\bmust\s+sell\b/gi,
  /\bno\s+longer\s+need(?:ed)?\b/gi,
];

const FILLER_RE = /\b(?:bro|um+|uh+|erm+|sorta|kinda|you know)\b/gi;

function normalizeText(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(
      /\b(?:an?|the|and|with|has|have|got|comes|includes|upgraded)\b/g,
      " ",
    )
    .replace(/\b(\w+?)(?:ies)\b/g, "$1y")
    .replace(/\b(\w+?)(?:s)\b/g, "$1")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function idFor(kind: SellerMeaningClass, normalized: string): string {
  let hash = 2166136261;
  const input = `${kind}:${normalized}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sf_${(hash >>> 0).toString(36)}`;
}

function provenanceFor(
  evidence: string,
  source: SellerFactProvenance["source"],
  raw: string,
  field?: string,
): SellerFactProvenance {
  const index =
    source === "seller_message"
      ? raw.toLowerCase().indexOf(evidence.toLowerCase())
      : -1;
  return {
    evidence,
    source,
    ...(field ? { field } : {}),
    ...(index >= 0 ? { start: index, end: index + evidence.length } : {}),
  };
}

function makeFact(
  kind: SellerMeaningClass,
  value: string,
  provenance: SellerFactProvenance,
  confidence = 1,
): AtomicSellerFact {
  const clean = value.replace(/\s+/g, " ").trim();
  const normalized = normalizeText(clean);
  return {
    id: idFor(kind, normalized),
    class: kind,
    value: clean,
    normalized,
    provenance: [provenance],
    confidence,
  };
}

function makeIncludedFact(
  value: string,
  provenance: SellerFactProvenance,
): IncludedItemFact {
  const clean = value.replace(/\s+/g, " ").trim();
  const quantityMatch = clean.match(
    /^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+)$/i,
  );
  const quantity = quantityMatch
    ? Number(quantityMatch[1]) || NUMBER_WORDS[quantityMatch[1].toLowerCase()]
    : undefined;
  const name = (quantityMatch?.[2] || clean).trim();
  const fact = makeFact(
    "included_item",
    quantity ? `${quantity} ${name}` : name,
    provenance,
  );
  return {
    ...fact,
    class: "included_item",
    name,
    ...(quantity ? { quantity } : {}),
  };
}

function factsOverlap(a: AtomicSellerFact, b: AtomicSellerFact): boolean {
  if (a.class !== b.class) return false;
  const aa = new Set(a.normalized.split(/\s+/).filter(Boolean));
  const bb = new Set(b.normalized.split(/\s+/).filter(Boolean));
  const smaller = Math.min(aa.size, bb.size);
  if (!smaller) return a.normalized === b.normalized;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return overlap / smaller >= 0.8;
}

function dedupeFacts<T extends AtomicSellerFact>(facts: T[]): T[] {
  const out: T[] = [];
  for (const fact of facts) {
    const index = out.findIndex((existing) => factsOverlap(fact, existing));
    if (index < 0) {
      out.push(fact);
      continue;
    }
    const existing = out[index];
    const preferred =
      fact.confidence > existing.confidence ||
      (fact.confidence === existing.confidence &&
        fact.value.length > existing.value.length)
        ? fact
        : existing;
    const provenance = [...existing.provenance];
    for (const source of fact.provenance) {
      if (
        !provenance.some(
          (item) =>
            item.source === source.source &&
            item.evidence.toLowerCase() === source.evidence.toLowerCase(),
        )
      ) {
        provenance.push(source);
      }
    }
    out[index] = { ...preferred, provenance } as T;
  }
  return out;
}

function collectMatches(
  raw: string,
  patterns: RegExp[],
  kind: SellerMeaningClass,
): AtomicSellerFact[] {
  const out: AtomicSellerFact[] = [];
  for (const pattern of patterns) {
    for (const match of raw.matchAll(
      new RegExp(pattern.source, pattern.flags),
    )) {
      const value = match[0].trim();
      if (!value) continue;
      out.push(
        makeFact(kind, value, provenanceFor(value, "seller_message", raw)),
      );
    }
  }
  return dedupeFacts(out);
}

function isNegativeCondition(value: string): boolean {
  if (
    /\b(?:no|without)\s+(?:known\s+)?(?:faults?|damage|issues?|problems?|repairs?)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  return /\b(?:scratch(?:ed|es)?|damag(?:e|ed)|fault|broken|crack(?:ed|s)?|drift|leak|missing|worn|doesn'?t|won'?t|cuts?\s+out|reduced|not\s+last|needs?\s+(?:repair|work|new)|stain(?:ed|s)?|torn|tear|dent(?:ed|s)?)\b/i.test(
    value,
  );
}

function conditionConflict(
  positive: AtomicSellerFact[],
  raw: string,
): SellerFactConflict[] {
  const flattering = positive.find((fact) =>
    /\b(?:barely|lightly|only)\s+used\b/i.test(fact.value),
  );
  const heavyUse = raw.match(
    /\b(?:used\s+(?:every\s+day|daily)|had\s+it\s+(?:for\s+)?\d+\s+years?|used\s+for\s+\d+\s+years?)\b/i,
  );
  if (!flattering || !heavyUse) return [];
  const heavy = makeFact(
    "positive_condition",
    heavyUse[0],
    provenanceFor(heavyUse[0], "seller_message", raw),
  );
  positive.splice(positive.indexOf(flattering), 1, heavy);
  return [
    {
      key: "condition:usage",
      factIds: [flattering.id, heavy.id],
      resolution: "conservative",
      publicFactId: heavy.id,
    },
  ];
}

function conditionGradeConflicts(
  positive: AtomicSellerFact[],
): SellerFactConflict[] {
  const rank = (value: string): number => {
    if (/\bfair\b/i.test(value)) return 1;
    if (/\bused\b/i.test(value) && !/\blike[\s-]*new\b/i.test(value)) return 2;
    if (/\bgood\b/i.test(value)) return 3;
    if (/\blike[\s-]*new\b/i.test(value)) return 4;
    if (/\b(?:brand[\s-]*new|new)\b/i.test(value)) return 5;
    return 99;
  };
  const graded = positive.filter((fact) => rank(fact.value) < 99);
  const grades = new Set(graded.map((fact) => rank(fact.value)));
  if (grades.size <= 1) return [];
  const conservative = [...graded].sort(
    (a, b) => rank(a.value) - rank(b.value),
  )[0];
  for (const fact of graded) {
    if (fact.id === conservative.id) continue;
    positive.splice(positive.indexOf(fact), 1);
  }
  return [
    {
      key: "condition:grade",
      factIds: graded.map((fact) => fact.id),
      resolution: "conservative",
      publicFactId: conservative.id,
    },
  ];
}

function extractSellerIdentity(raw: string): string | null {
  const match = raw.match(
    /\b(?:selling|sell|listing)\s+(?:my|a|an|the)?\s*(.+?)(?=\s+\b(?:bro|had|have\s+had|got|comes?\s+with|includes?|barely|lightly|only\s+used|used\s+(?:for|every|daily)|still\s+works?|works?|condition|located|i['’]?m\s+in|im\s+in|paid|cost|asking|maybe|thinking|just\s+want|need|can|could|would|please)\b|[.!?]|$)/i,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function titleCaseIdentity(value: string): string {
  const small = new Set(["and", "with", "of", "for"]);
  return value
    .split(/\s+/)
    .map((token, index) => {
      if (index > 0 && small.has(token.toLowerCase()))
        return token.toLowerCase();
      if (/\d/.test(token)) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

function singularize(value: string): string {
  return value.replace(/ies$/i, "y").replace(/s$/i, "");
}

function extractAtomicIncludedItems(
  raw: string,
  identityValue: string | null,
): IncludedItemFact[] {
  const out: IncludedItemFact[] = [];
  const segments = [
    ...raw.matchAll(
      /\b(?:got|includes?|comes?\s+with)\s+(.+?)(?=\b(?:but|one\s+\w+\s+(?:doesn'?t|has|is)|located|i['’]?m\s+in|im\s+in|paid|cost|asking|maybe|thinking|just\s+want|can|could|would|please)\b|[.!?]|$)/gi,
    ),
  ];
  for (const segmentMatch of segments) {
    const evidence = segmentMatch[1].trim();
    let remainder = evidence;

    for (const counted of evidence.matchAll(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+([a-z][\w'-]*(?:\s+[a-z][\w'-]*)?)/gi,
    )) {
      const next = counted[2].split(/\s+/);
      const name =
        next.length > 1 &&
        /^(?:and|but|charger|case|cable)$/i.test(next[next.length - 1])
          ? next.slice(0, -1).join(" ")
          : counted[2];
      const value = `${counted[1]} ${name}`;
      out.push(
        makeIncludedFact(
          value,
          provenanceFor(counted[0], "seller_message", raw),
        ),
      );
      remainder = remainder.replace(counted[0], " ");
    }

    const identityComponents = String(identityValue || "")
      .replace(/\b(?:bundle|kit|set|lot)\b/gi, " ")
      .split(/\s+and\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const component of identityComponents) {
      const words = component.split(/\s+/);
      let matched = "";
      for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
        const candidate = words.slice(-size).join(" ");
        if (
          new RegExp(
            `\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i",
          ).test(remainder)
        ) {
          matched = candidate;
          break;
        }
      }
      if (matched) {
        out.push(
          makeIncludedFact(
            matched,
            provenanceFor(matched, "seller_message", raw),
          ),
        );
        remainder = remainder.replace(
          new RegExp(
            `\\b${matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i",
          ),
          " ",
        );
      }
    }

    for (const atom of remainder
      .split(/\s+(?:and|plus)\s+/i)
      .flatMap((part) => part.split(/\s{2,}/))
      .map((part) => part.trim())
      .filter((part) => /[a-z]/i.test(part))) {
      // Remaining short noun chunks are explicit inclusions. Long prose is
      // intentionally rejected instead of being copied into buyer copy.
      if (atom.split(/\s+/).length <= 3) {
        out.push(
          makeIncludedFact(atom, provenanceFor(atom, "seller_message", raw)),
        );
      }
    }
  }
  return dedupeFacts(out);
}

function extractRelationalConditions(raw: string): {
  positive: AtomicSellerFact[];
  negative: AtomicSellerFact[];
} {
  const positive: AtomicSellerFact[] = [];
  const negative: AtomicSellerFact[] = [];
  for (const match of raw.matchAll(
    /\b(?:still\s+)?works?\s+(?:mint|well|fine|great)\b/gi,
  )) {
    positive.push(
      makeFact(
        "positive_condition",
        "works well",
        provenanceFor(match[0], "seller_message", raw),
      ),
    );
  }
  for (const match of raw.matchAll(
    /\b(?:had\s+it|used\s+it)\s+(?:for\s+)?(?:a\s+)?couple\s+(?:of\s+)?years\b/gi,
  )) {
    positive.push(
      makeFact(
        "positive_condition",
        "used for a couple of years",
        provenanceFor(match[0], "seller_message", raw),
      ),
    );
  }
  for (const match of raw.matchAll(
    /\bone\s+([a-z][\w'-]*)\s+(?:doesn'?t|does\s+not)\s+last\s+as\s+long(?:\s+anymore)?\b/gi,
  )) {
    negative.push(
      makeFact(
        "negative_condition",
        `one ${singularize(match[1])} has reduced runtime`,
        provenanceFor(match[0], "seller_message", raw),
      ),
    );
  }
  for (const match of raw.matchAll(
    /\b(dent(?:ed)?|crack(?:ed)?|scratch(?:ed)?|smash(?:ed)?)\s+on\s+(?:the\s+)?([a-z][\w'-]*)\b/gi,
  )) {
    negative.push(
      makeFact(
        "negative_condition",
        `${match[1].toLowerCase()} on ${match[2].toLowerCase()}`,
        provenanceFor(match[0], "seller_message", raw),
      ),
    );
  }
  for (const match of raw.matchAll(
    /\b([a-z][\w'-]*(?:\s+[a-z][\w'-]*)?)\s+(?:is\s+|pretty\s+|has\s+)?(scratched|cracked|damaged|stained|torn|dented|worn|smashed)\b/gi,
  )) {
    const subject = match[1].replace(/^anymore\s+/i, "").trim();
    if (
      /^(?:don'?t|dont|say|put|mention|title|bargain|the|a|an|it|its|this|that|not)\b/i.test(
        subject
      ) ||
      /\b(?:don'?t|dont|say|put|mention|title it)\b/i.test(subject)
    ) {
      continue;
    }
    negative.push(
      makeFact(
        "negative_condition",
        `${/^(?:one|the|this)\b/i.test(subject) ? subject : `the ${subject}`} is ${match[2]}`,
        provenanceFor(match[0], "seller_message", raw),
      ),
    );
  }
  return { positive: dedupeFacts(positive), negative: dedupeFacts(negative) };
}

function pushCanonical(
  target: AtomicSellerFact[],
  kind: SellerMeaningClass,
  value: unknown,
  field: string,
  raw: string,
): void {
  const text = String(value || "").trim();
  if (!text) return;
  const rawNorm = normalizeText(raw);
  const textNorm = normalizeText(text);
  const sellerBacked =
    !raw.trim() ||
    (textNorm.length >= 2 &&
      textNorm
        .split(" ")
        .filter(Boolean)
        .every((token) => rawNorm.includes(token)));
  if (!sellerBacked) return;
  target.push(
    makeFact(
      kind,
      text,
      provenanceFor(
        text,
        raw.trim() ? "seller_message" : "canonical_field",
        raw,
        field,
      ),
    ),
  );
}

/**
 * Convert seller input into a validated semantic object. Raw text is retained
 * only in provenance/excluded classes and is never a public composition input.
 */
export function parseSellerMessageToFactModel(
  sellerMessage: string | undefined,
  fill: SkyAiListingFill,
): StructuredSellerFactModel {
  const raw = stripInternalOrchestrationOnly(String(sellerMessage || ""))
    .replace(/\s+/g, " ")
    .trim();
  const identity: AtomicSellerFact[] = [];
  const attributes: AtomicSellerFact[] = [];
  const includedItems: IncludedItemFact[] = [];
  const positiveCondition: AtomicSellerFact[] = [];
  const negativeCondition: AtomicSellerFact[] = [];
  const modifications: AtomicSellerFact[] = [];
  const location: AtomicSellerFact[] = [];

  const sellerIdentity = extractSellerIdentity(raw);
  const canonicalTitle = String(fill.title || "").trim();
  const canonicalTitleContaminated =
    /\b(?:selling|bro|had\s+it|got|couple|make\s+the\s+listing)\b/i.test(
      canonicalTitle,
    );
  if (canonicalTitle && !canonicalTitleContaminated) {
    const evidence = sellerIdentity || canonicalTitle;
    identity.push(
      makeFact(
        "identity",
        canonicalTitle,
        provenanceFor(
          evidence,
          raw.trim() ? "seller_message" : "canonical_field",
          raw,
          "title",
        ),
      ),
    );
  } else if (sellerIdentity) {
    identity.push(
      makeFact(
        "identity",
        titleCaseIdentity(sellerIdentity),
        provenanceFor(sellerIdentity, "seller_message", raw),
      ),
    );
  }
  for (const [field, value] of [
    ["vehicleMake", fill.vehicleMake],
    ["vehicleModel", fill.vehicleModel],
    ["vehicleGeneration", fill.vehicleGeneration],
    ["vehicleYear", fill.vehicleYear],
  ] as const) {
    pushCanonical(identity, "identity", value, field, raw);
  }
  for (const [field, value] of [
    ["vehicleColour", fill.vehicleColour],
    [
      "vehicleOdometer",
      fill.vehicleOdometer ? `${fill.vehicleOdometer} km` : undefined,
    ],
    ["vehicleTransmission", fill.vehicleTransmission],
    ["vehicleFuelType", fill.vehicleFuelType],
    ["vehicleBodyType", fill.vehicleBodyType],
  ] as const) {
    pushCanonical(attributes, "attribute", value, field, raw);
  }
  for (const [field, value] of [
    ["condition", fill.condition],
    ["stockQuantity", fill.stockQuantity],
    ["serviceDuration", fill.serviceDuration],
    ["servicePricingType", fill.servicePricingType],
    ["rentalSubType", fill.rentalSubType],
    ["rentalPropertyType", fill.rentalPropertyType],
    ["rentalPriceDaily", fill.rentalPriceDaily],
    ["rentalPriceWeekly", fill.rentalPriceWeekly],
    ["rentalPriceMonthly", fill.rentalPriceMonthly],
    ["rentalDeposit", fill.rentalDeposit],
    ["rentalBedrooms", fill.rentalBedrooms],
    ["rentalBathrooms", fill.rentalBathrooms],
    ["rentalParkingSpaces", fill.rentalParkingSpaces],
    ["rentalFurnishedStatus", fill.rentalFurnishedStatus],
    ["rentalPetsPolicy", fill.rentalPetsPolicy],
    ["rentalMinTenancy", fill.rentalMinTenancy],
    ["rentalAvailableDate", fill.rentalAvailableDate],
  ] as const) {
    pushCanonical(attributes, "attribute", value, field, raw);
  }
  pushCanonical(
    location,
    "location",
    fill.location || fill.pickupArea,
    "location",
    raw,
  );

  const lowUse = raw.match(
    /\b(?:barely\s+use(?:d)?(?:\s+(?:it|them))?|lightly\s+used|only\s+used\s+(?:once|twice|a\s+few\s+times))\b/i,
  );
  if (lowUse) {
    positiveCondition.push(
      makeFact(
        "positive_condition",
        /barely/i.test(lowUse[0]) ? "barely used" : lowUse[0],
        provenanceFor(lowUse[0], "seller_message", raw),
      ),
    );
  }
  for (const explicitCondition of raw.matchAll(
    /\b(?:brand[\s-]*new|like[\s-]*new|good|fair|excellent|mint|used)\s+(?:used\s+)?condition\b/gi,
  )) {
    positiveCondition.push(
      makeFact(
        "positive_condition",
        explicitCondition[0],
        provenanceFor(explicitCondition[0], "seller_message", raw, "condition"),
      ),
    );
  }

  includedItems.push(...extractAtomicIncludedItems(raw, sellerIdentity));
  const relationalCondition = extractRelationalConditions(raw);
  positiveCondition.push(...relationalCondition.positive);
  negativeCondition.push(...relationalCondition.negative);

  for (const rawExtra of fill.extras || []) {
    const keyedModification = rawExtra.match(/^modifications?\s*:\s*(.+)$/i);
    if (keyedModification) {
      const value = sanitizePublicListingCopy(keyedModification[1]).trim();
      if (value && !containsSellerMetaInstruction(value)) {
        modifications.push(
          makeFact(
            "modification",
            value,
            provenanceFor(value, "structured_extra", raw, "modification"),
          ),
        );
      }
      continue;
    }
    if (/^[a-z][a-z0-9_]*\s*:/i.test(rawExtra)) continue;
    const value = sanitizePublicListingCopy(String(rawExtra || "")).trim();
    if (
      !value ||
      value.split(/\s+/).length > 10 ||
      containsSellerMetaInstruction(value)
    ) {
      continue;
    }
    const included = value.match(/^(?:comes?\s+with\s+)?(.+?)\s+included$/i);
    if (included) {
      includedItems.push(
        makeIncludedFact(
          included[1],
          provenanceFor(value, "structured_extra", raw, "included"),
        ),
      );
    } else if (
      /\b(?:working|works?|serviced|clean|barely used|lightly used)\b/i.test(
        value,
      )
    ) {
      positiveCondition.push(
        makeFact(
          "positive_condition",
          value,
          provenanceFor(value, "structured_extra", raw, "mechanical"),
        ),
      );
    } else if (isNegativeCondition(value)) {
      negativeCondition.push(
        makeFact(
          "negative_condition",
          value,
          provenanceFor(value, "structured_extra", raw, "conditiondetail"),
        ),
      );
    } else {
      attributes.push(
        makeFact(
          "attribute",
          value,
          provenanceFor(value, "structured_extra", raw, "note"),
        ),
      );
    }
  }

  const sanitizedExtras = sanitizeListingExtras(fill);
  for (const entry of sanitizedExtras) {
    const match = entry.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/_/g, "");
    const value = match[2].trim();
    const provenance = provenanceFor(value, "structured_extra", raw, key);
    if (key === "included" || key === "includes" || key === "include") {
      includedItems.push(makeIncludedFact(value, provenance));
    } else if (key === "modification" || key === "modifications") {
      // Original modification entries were parsed above so all duplicate
      // phrasings retain provenance before semantic collapse.
      continue;
    } else if (key === "conditiondetail" || key === "mechanical") {
      const target = isNegativeCondition(value)
        ? negativeCondition
        : positiveCondition;
      target.push(
        makeFact(
          isNegativeCondition(value)
            ? "negative_condition"
            : "positive_condition",
          value,
          provenance,
        ),
      );
    } else if (
      key === "maintenance" ||
      key === "compliance" ||
      key === "logistics" ||
      key === "note"
    ) {
      const kind = isNegativeCondition(value)
        ? "negative_condition"
        : "positive_condition";
      (kind === "negative_condition"
        ? negativeCondition
        : positiveCondition
      ).push(makeFact(kind, value, provenance));
    } else {
      // Remaining sanitized keyed values are structured context/attributes
      // (storage, grade, set, object type, service/rental terms, etc.).
      // Keeping the original key in provenance lets downstream specialist
      // writers use them without exposing an uncontrolled raw string.
      attributes.push(makeFact("attribute", value, provenance));
    }
  }

  const sellerInstructions = collectMatches(
    raw,
    INSTRUCTION_PATTERNS,
    "seller_instruction",
  );
  const sellerIntent = collectMatches(raw, INTENT_PATTERNS, "seller_intent");
  const filler = [...raw.matchAll(FILLER_RE)].map((match) =>
    makeFact(
      "non_fact_filler",
      match[0],
      provenanceFor(match[0], "seller_message", raw),
      1,
    ),
  );

  const tentativeMatch = raw.match(
    /\b(?:not\s+sure\s+|idk\s+)?(?:maybe|thinking\s+(?:around|about)?|roughly|perhaps)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i,
  );
  const historicalMatch = raw.match(
    /\b(?:paid|cost(?:\s+me)?|bought(?:\s+it)?\s+for)\s+(?:heaps|a\s+lot|lots|\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?)\b/i,
  );
  const confirmedMatch = raw.match(
    /\b(?:asking|price\s+is|want|sell(?:ing)?\s+for)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i,
  );
  const moneyFact = (
    match: RegExpMatchArray | null,
    kind: "price_confirmed" | "price_tentative" | "price_historical",
  ): AtomicSellerFact | null => {
    if (!match?.[1]) return null;
    const value = String(
      Number(match[1].replace(/,/g, "")) *
        (match[2]?.toLowerCase() === "k" ? 1000 : 1),
    );
    return makeFact(
      kind,
      value,
      provenanceFor(match[0], "seller_message", raw),
    );
  };
  const tentative = moneyFact(tentativeMatch, "price_tentative");
  const historical =
    moneyFact(historicalMatch, "price_historical") ||
    (historicalMatch
      ? makeFact(
          "price_historical",
          "unspecified historical price",
          provenanceFor(historicalMatch[0], "seller_message", raw),
        )
      : null);
  let confirmed = moneyFact(confirmedMatch, "price_confirmed");
  if (!confirmed && fill.price) {
    const amount = String(fill.price).replace(/[^\d.]/g, "");
    const excludedSameAmount =
      tentative?.value === amount || historical?.value === amount;
    if (!excludedSameAmount) {
      const sourceAmount =
        [...raw.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?\b/gi)]
          .find((match) => {
            const parsed =
              Number(match[1].replace(/,/g, "")) *
              (match[2]?.toLowerCase() === "k" ? 1000 : 1);
            return String(parsed) === amount;
          })?.[0]
          .trim() || fill.price;
      confirmed = makeFact(
        "price_confirmed",
        fill.price,
        provenanceFor(
          sourceAmount,
          raw.trim() ? "seller_message" : "canonical_field",
          raw,
          "price",
        ),
      );
    }
  }

  const conflicts: SellerFactConflict[] = [
    ...conditionConflict(positiveCondition, raw),
    ...conditionGradeConflicts(positiveCondition),
  ];
  const groups = {
    identity: dedupeFacts(identity),
    attributes: dedupeFacts(attributes),
    includedItems: dedupeFacts(includedItems),
    positiveCondition: dedupeFacts(positiveCondition),
    negativeCondition: dedupeFacts(negativeCondition),
    modifications: dedupeFacts(modifications),
    location: dedupeFacts(location),
  };
  const publicFacts = dedupeFacts(
    [
      ...groups.identity,
      ...groups.attributes,
      ...groups.includedItems,
      ...groups.positiveCondition,
      ...groups.negativeCondition,
      ...groups.modifications,
      ...groups.location,
    ].filter((fact) => PUBLIC_SELLER_MEANING_CLASSES.has(fact.class)),
  );

  return {
    version: 1,
    ...groups,
    price: { confirmed, tentative, historical },
    sellerIntent,
    sellerInstructions,
    filler: dedupeFacts(filler),
    conflicts,
    publicFacts,
  };
}

export function semanticFactModelToPublicExtras(
  model: StructuredSellerFactModel,
): string[] {
  const out: string[] = [];
  for (const fact of model.publicFacts) {
    if (fact.class === "included_item") out.push(`included:${fact.value}`);
    else if (fact.class === "modification")
      out.push(`modification:${fact.value}`);
    else if (fact.class === "negative_condition") {
      out.push(`conditionDetail:${fact.value}`);
    } else if (fact.class === "positive_condition") {
      const sourceKey = fact.provenance.find((source) => source.field)?.field;
      if (sourceKey === "condition") continue;
      out.push(
        sourceKey &&
          /^(maintenance|compliance|logistics|note)$/i.test(sourceKey)
          ? `${sourceKey}:${fact.value}`
          : /\bworks?\b/i.test(fact.value)
            ? `mechanical:${fact.value}`
            : `maintenance:${fact.value}`,
      );
    } else if (fact.class === "attribute") {
      const sourceKey = fact.provenance.find(
        (source) => source.source === "structured_extra",
      )?.field;
      if (sourceKey) out.push(`${sourceKey}:${fact.value}`);
    }
  }
  return [...new Set(out)];
}

export function validateStructuredSellerFactModel(
  model: StructuredSellerFactModel | undefined,
): model is StructuredSellerFactModel {
  if (!model || model.version !== 1) return false;
  const all = [
    ...model.identity,
    ...model.attributes,
    ...model.includedItems,
    ...model.positiveCondition,
    ...model.negativeCondition,
    ...model.modifications,
    ...model.location,
    ...(model.price.confirmed ? [model.price.confirmed] : []),
    ...(model.price.tentative ? [model.price.tentative] : []),
    ...(model.price.historical ? [model.price.historical] : []),
    ...model.sellerIntent,
    ...model.sellerInstructions,
    ...model.filler,
  ];
  if (
    all.some(
      (fact) =>
        !fact.id ||
        !fact.value ||
        !fact.normalized ||
        !fact.provenance.length ||
        fact.provenance.some((source) => !source.evidence),
    )
  ) {
    return false;
  }
  if (
    model.publicFacts.some(
      (fact) => !PUBLIC_SELLER_MEANING_CLASSES.has(fact.class),
    )
  ) {
    return false;
  }
  const publicIds = new Set(model.publicFacts.map((fact) => fact.id));
  return model.publicFacts.every(
    (fact) =>
      publicIds.has(fact.id) &&
      all.some((candidate) => candidate.id === fact.id),
  );
}

export function attachSellerFactModel(
  sellerMessage: string,
  fill: SkyAiListingFill,
): SkyAiListingFill {
  const semanticFactModel = parseSellerMessageToFactModel(sellerMessage, fill);
  const hasConfirmedPrice = Boolean(semanticFactModel.price.confirmed);
  const sellerIdentity = semanticFactModel.identity.find((fact) =>
    fact.provenance.some((source) => source.source === "seller_message"),
  );
  const titleLooksContaminated =
    /\b(?:selling|bro|had\s+it|got|couple|make\s+the\s+listing)\b/i.test(
      String(fill.title || ""),
    );
  const operationalMintWasMisread =
    fill.condition === "Used - Like New" &&
    /\bworks?\s+mint\b/i.test(sellerMessage) &&
    !/\b(?:like[\s-]*new|mint\s+condition)\b/i.test(sellerMessage);
  const conditionConflictFactId = semanticFactModel.conflicts.find(
    (conflict) => conflict.key === "condition:grade",
  )?.publicFactId;
  const resolvedConditionFact = semanticFactModel.positiveCondition.find(
    (fact) => fact.id === conditionConflictFactId,
  );
  const resolvedCondition = resolvedConditionFact
    ? /\bfair\b/i.test(resolvedConditionFact.value)
      ? "Used - Fair"
      : /\bgood\b/i.test(resolvedConditionFact.value)
        ? "Used - Good"
        : /\blike[\s-]*new\b/i.test(resolvedConditionFact.value)
          ? "Used - Like New"
          : /\bnew\b/i.test(resolvedConditionFact.value)
            ? "New"
            : undefined
    : undefined;
  const hasUsageConflict = semanticFactModel.conflicts.some(
    (conflict) => conflict.key === "condition:usage",
  );
  return {
    ...fill,
    ...(sellerIdentity && titleLooksContaminated
      ? { title: sellerIdentity.value }
      : {}),
    ...(fill.price && !hasConfirmedPrice ? { price: undefined } : {}),
    ...(resolvedCondition
      ? { condition: resolvedCondition }
      : operationalMintWasMisread || hasUsageConflict
        ? { condition: undefined }
        : {}),
    extras: semanticFactModelToPublicExtras(semanticFactModel),
    semanticFactModel,
  };
}
