/**
 * Collectibles / trading cards domain.
 * Understands structure (set, player, grader, grade) — never invents
 * year / parallel / card number / pop / market value.
 */

import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
  CollectibleGrade,
} from "../types";

const SET_ALIASES: ReadonlyArray<{ pattern: RegExp; name: string; sticky: string }> = [
  { pattern: /\btopps\s*chrome\b/i, name: "Topps Chrome", sticky: "set" },
  { pattern: /\btopps\b/i, name: "Topps", sticky: "set" },
  { pattern: /\bmatch\s*attax\b/i, name: "Match Attax", sticky: "set" },
  { pattern: /\bpokemon\b|\bpok[eé]mon\b/i, name: "Pokémon", sticky: "set" },
  { pattern: /\bbase\s*set\b/i, name: "Base Set", sticky: "set" },
  { pattern: /\bpanini\b/i, name: "Panini", sticky: "set" },
  { pattern: /\bupper\s*deck\b/i, name: "Upper Deck", sticky: "set" },
  { pattern: /\bfleury?\b/i, name: "Fleer", sticky: "set" },
  { pattern: /\byugioh\b|\byu[\s-]?gi[\s-]?oh\b/i, name: "Yu-Gi-Oh", sticky: "set" },
  { pattern: /\bmtg\b|\bmagic\s+the\s+gathering\b/i, name: "Magic: The Gathering", sticky: "set" },
];

const PLAYER_ALIASES: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /\bmessi\b/i, name: "Messi" },
  { pattern: /\bronaldo\b/i, name: "Ronaldo" },
  { pattern: /\bcharizard\b/i, name: "Charizard" },
  { pattern: /\bpikachu\b/i, name: "Pikachu" },
  { pattern: /\bmewtwo\b/i, name: "Mewtwo" },
  { pattern: /\blebron\b/i, name: "LeBron James" },
  { pattern: /\bjordan\b(?!\s*(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|air|retro|shoe|sneaker))/i, name: "Michael Jordan" },
];

const GRADER_RE = /\b(psa|bgs|cgc|sgc|csg)\b/i;
const GRADE_NUM_RE = /\b(?:psa|bgs|cgc|sgc)?\s*(10|9\.5|9|8\.5|8|7\.5|7|6|5|4|3|2|1)\b/i;
const PSA_COMBO_RE = /\bpsa\s*(10|9\.5|9|8\.5|8)\b/i;

const COLLECTIBLE_DETECT =
  /\b(psa|bgs|cgc|graded|trading\s*card|card\s*shop|topps|match\s*attax|charizard|pokemon|pokémon|panini|rookie\s*card|slab|pop\s*report|booster\s*(?:box|pack|display)|elite\s*trainer|etb|hobby\s*box|blaster|riftbound)\b/i;

const SEALED_PRODUCT_RE =
  /\b(booster\s*(?:box|pack|display)|elite\s*trainer(?:\s*box)?|\betb\b|hobby\s*box|blaster(?:\s*box)?|mega\s*box|starter\s*pack|\btin\b|sealed\s*set|display\s*box)\b/i;

const BUNDLE_PRODUCT_RE =
  /\b(card\s*bundle|bundle\s+of\s+\d+|\d+\s*-?\s*cards?\b|lot\s+of\s+\d+)\b/i;

function resolveGrade(text: string): CollectibleGrade | undefined {
  const psa = text.match(PSA_COMBO_RE);
  if (psa) {
    return {
      company: "PSA",
      grade: psa[1],
      provenance: "USER",
      needsCurrentCheck: true,
    };
  }
  const companyM = text.match(GRADER_RE);
  const gradeM = text.match(GRADE_NUM_RE);
  if (companyM && gradeM) {
    return {
      company: companyM[1].toUpperCase(),
      grade: gradeM[1],
      provenance: "USER",
      needsCurrentCheck: true,
    };
  }
  if (companyM && !gradeM) {
    return {
      company: companyM[1].toUpperCase(),
      grade: "",
      provenance: "USER",
      needsCurrentCheck: true,
    };
  }
  return undefined;
}

function resolve(input: DomainResolveInput): DomainResolveResult {
  const raw = String(input.text || "").trim();
  const prior = input.prior;
  const sticky = prior?.domain === "collectibles" ? prior.sticky : {};
  const text = raw;

  let setName = sticky.set;
  let player = sticky.player;
  for (const row of SET_ALIASES) {
    if (row.pattern.test(text)) {
      setName = row.name;
      break;
    }
  }
  for (const row of PLAYER_ALIASES) {
    if (row.pattern.test(text)) {
      player = row.name;
      break;
    }
  }

  const grade = resolveGrade(text);
  const sealedProduct = SEALED_PRODUCT_RE.test(text);
  const bundleProduct = BUNDLE_PRODUCT_RE.test(text);
  const productFormat = sealedProduct
    ? "sealed_product"
    : bundleProduct
      ? "card_bundle"
      : grade
        ? "graded_card"
        : "individual_card";
  const detect = COLLECTIBLE_DETECT.test(text) || Boolean(setName && (player || grade || sealedProduct || bundleProduct));

  // Follow-up only grade/player with sticky set
  const followUp =
    prior?.domain === "collectibles" &&
    (Boolean(grade) || Boolean(player) || SET_ALIASES.some((s) => s.pattern.test(text)));

  if (!detect && !followUp && !(setName && player) && !sealedProduct && !bundleProduct) {
    return { hit: false, score: 0 };
  }

  const attributes: Attribute[] = [];
  const unknowns: string[] = [];
  const needsCurrentCheck = ["market value", "population", "parallel", "card number"];

  attributes.push({
    key: "productFormat",
    value: productFormat,
    provenance: "LOCAL_DATA",
  });

  if (setName) {
    attributes.push({ key: "set", value: setName, provenance: sticky.set === setName ? "USER" : "LOCAL_DATA" });
  } else if (!sealedProduct && !bundleProduct) {
    unknowns.push("set");
  }
  if (sealedProduct || bundleProduct) {
    // Sealed product / loose lot identity is the product itself — not a card subject.
  } else if (player) {
    attributes.push({ key: "subject", value: player, provenance: "USER" });
  } else {
    unknowns.push("player_or_subject");
  }

  // Year / parallel / number only if USER stated — never invent
  const yearM = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearM) {
    attributes.push({ key: "year", value: yearM[1], provenance: "USER" });
  } else if (!sealedProduct && !bundleProduct) {
    unknowns.push("year");
  }
  const parallelM = text.match(
    /\b(refractor|gold\s*wave|superfractor|prizm|silver|holo|reverse\s*holo|1st\s*edition|shadowless)\b/i
  );
  if (parallelM) {
    attributes.push({ key: "parallel", value: parallelM[1], provenance: "USER" });
  } else if (!sealedProduct && !bundleProduct) {
    unknowns.push("parallel");
  }
  const numM = text.match(/\b(?:#|no\.?|number)\s*(\d+)\b/i);
  if (numM) {
    attributes.push({ key: "cardNumber", value: numM[1], provenance: "USER" });
  } else if (!sealedProduct && !bundleProduct) {
    unknowns.push("cardNumber");
  }

  if (grade?.grade) {
    attributes.push({
      key: "grade",
      value: `${grade.company} ${grade.grade}`,
      provenance: "USER",
      needsCurrentCheck: true,
    });
  } else if (grade?.company && !sealedProduct && !bundleProduct) {
    unknowns.push("grade");
  }

  const displayBits = [
    grade?.company && grade.grade ? `${grade.company} ${grade.grade}` : undefined,
    sealedProduct || bundleProduct ? undefined : player,
    setName,
  ].filter(Boolean);

  const confidence: MarketplaceEntity["confidence"] =
    sealedProduct || bundleProduct
      ? setName
        ? "medium"
        : "low"
      : (setName && player && grade?.grade) || (player && grade?.grade && setName)
        ? "high"
        : setName || player || grade
          ? "medium"
          : "low";

  const entity: MarketplaceEntity = {
    domain: "collectibles",
    brand: setName ? { id: setName.toLowerCase().replace(/\s+/g, "-"), name: setName } : undefined,
    family: setName
      ? { id: setName.toLowerCase().replace(/\s+/g, "-"), name: setName }
      : undefined,
    model: sealedProduct || bundleProduct
      ? undefined
      : player
        ? { id: player.toLowerCase().replace(/\s+/g, "-"), name: player }
        : undefined,
    category: {
      id: "collectibles",
      label: "Collectibles",
      skyDropCategory: "Collectibles",
      listingTypeHint: "physical",
    },
    attributes,
    grade: grade?.grade ? grade : grade?.company ? { ...grade, grade: "" } : undefined,
    displayName: displayBits.join(" ") || text.slice(0, 80),
    confidence,
    provenance: "LOCAL_DATA",
    userFacts: [
      ...(player ? [player] : []),
      ...(grade?.grade ? [`${grade.company} ${grade.grade}`] : []),
      ...(yearM ? [yearM[1]] : []),
      ...(parallelM ? [parallelM[1]] : []),
    ],
    unknowns,
    needsCurrentCheck,
  };

  const clarify: DomainClarifyAsk[] = [];
  if (sealedProduct || bundleProduct) {
    if (!setName) {
      clarify.push({
        field: "set",
        question: sealedProduct
          ? "Which sealed product line — e.g. Pokémon ETB, Topps Chrome hobby box?"
          : "Which set or product line is the bundle from?",
        priority: 1,
      });
    } else if (bundleProduct) {
      clarify.push({
        field: "quantity",
        question: "How many cards are in the bundle?",
        priority: 1,
      });
    } else {
      clarify.push({ field: "price", question: "Asking price?", priority: 1 });
    }
  } else if (!setName) {
    clarify.push({
      field: "set",
      question: "Which set — e.g. Topps Chrome, Match Attax, Pokémon Base Set?",
      priority: 1,
    });
  } else if (!player) {
    clarify.push({
      field: "subject",
      question: `Which player or card from ${setName}?`,
      priority: 1,
    });
  } else if (grade?.company && !grade.grade) {
    clarify.push({
      field: "grade",
      question: `${grade.company} grade — e.g. 10, 9?`,
      priority: 2,
    });
  } else if (!grade && /graded|slab/i.test(text)) {
    clarify.push({
      field: "grade",
      question: "Which grader and grade — e.g. PSA 10?",
      priority: 2,
    });
  }

  const score =
    (COLLECTIBLE_DETECT.test(text) ? 0.55 : 0.35) +
    (setName ? 0.2 : 0) +
    (sealedProduct || bundleProduct ? 0.15 : player ? 0.15 : 0) +
    (grade?.grade ? 0.15 : 0);

  return { hit: true, entity, clarify, score: Math.min(1, score) };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  const has = (k: string) => entity.attributes.some((a) => a.key === k);
  const format = String(
    entity.attributes.find((a) => a.key === "productFormat")?.value || ""
  );
  const sealedOrBundle =
    format === "sealed_product" ||
    format === "card_bundle" ||
    /booster|etb|hobby|blaster|sealed|bundle/i.test(entity.displayName || "");

  if (!has("set")) {
    asks.push({
      field: "set",
      question: sealedOrBundle ? "Which product line or set?" : "Which card set?",
      priority: 1,
    });
  }
  if (!sealedOrBundle && !has("subject")) {
    asks.push({ field: "subject", question: "Player or character?", priority: 1 });
  }
  if (format === "card_bundle" && !has("quantity") && !has("bundle_quantity")) {
    asks.push({
      field: "quantity",
      question: "How many cards are in the bundle?",
      priority: 2,
    });
  }
  if (!sealedOrBundle && !has("grade") && entity.grade?.company) {
    asks.push({ field: "grade", question: "Grade number?", priority: 2 });
  }
  if (!sealedOrBundle && !has("year")) {
    asks.push({
      field: "year",
      question: "Card year if you know it? (skip if unsure — I won't guess)",
      priority: 3,
    });
  }
  asks.push({ field: "price", question: "Asking price?", priority: 4 });
  if (!sealedOrBundle) {
    asks.push({
      field: "condition_note",
      question: "Any cert number or notes? (I won't invent pop or value)",
      priority: 5,
    });
  }
  return asks;
}

export const collectiblesDomain: MarketplaceDomainModule = {
  id: "collectibles",
  detect: (text) => (COLLECTIBLE_DETECT.test(text) ? 0.85 : 0),
  resolve,
  enrichmentPriority,
};
