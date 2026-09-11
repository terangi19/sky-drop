/**
 * Semantic turn understanding — NOT keyword-only ("actually"/"no").
 * Classifies NEW FACT / ANSWER / CORRECTION / CLARIFICATION / COMMAND / QUESTION / multi.
 */

import type { ListingMissingSlot } from "./awhina-pending-slots";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { parseListingCondition } from "./awhina-listing-condition";

export type SemanticIntentKind =
  | "NEW_FACT"
  | "ANSWER"
  | "CORRECTION"
  | "CLARIFICATION"
  | "COMMAND"
  | "QUESTION"
  | "UNCERTAINTY"
  | "AFFIRMATION"
  | "NEGATION";

export type ExtractedFactHint = {
  key: string;
  value: string;
  /** Slot this fact would satisfy if any */
  slot?: ListingMissingSlot;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type SemanticTurnInterpretation = {
  kinds: SemanticIntentKind[];
  /** Primary kind for routing */
  primary: SemanticIntentKind;
  isCorrection: boolean;
  isMultiFact: boolean;
  isMultiIntent: boolean;
  facts: ExtractedFactHint[];
  /** Fields the user is correcting (when detectable) */
  correctedKeys: string[];
  /** Normalized residual after stripping correction framing */
  residualMessage: string;
  notes: string[];
};

const QUESTION_RE =
  /^(who|what|where|when|why|how|which|can\s+you|could\s+you|do\s+you|is\s+it|are\s+there)\b|\?$/i;
const COMMAND_RE =
  /\b(publish|list\s+it|post\s+it|add\s+photos?|edit\s+(the\s+)?listing|remove|delete|clear|start\s+over|reset)\b/i;
const UNCERTAINTY_RE =
  /^(not\s+sure|dunno|don'?t\s+know|idk|no\s+idea|skip|n\/a|unsure|whatever)\b/i;
const AFFIRM_RE = /^(yes|yeah|yep|yup|correct|right|that's\s+right|true|ok|okay|sure|sweet|keen)\b/i;
const NEGATE_RE = /^(no|nah|nope|wrong|incorrect)\b/i;

/** Correction framing — helpful but not required; semantic conflict also counts. */
const CORRECTION_FRAME_RE =
  /\b(actually|correction|i\s+meant|meant\s+to\s+say|not\s+\w+|isn'?t|aren'?t|wrong|nah\s+bro|nah\s+it'?s|it'?s\s+not|its\s+not|instead\s+of|rather\s+than|change\s+(it|that|the)|make\s+it|should\s+be|was\s+wrong)\b/i;

const NOT_X_BUT_Y =
  /\b(?:not|isn'?t|aren'?t)\s+([a-z0-9][\w\s.'-]{1,40}?)\s*(?:,?\s*)?(?:it'?s|its|but|rather|instead)?\s*([a-z0-9][\w\s.'-]{1,40})/i;
const ITS_X_NOT_Y =
  /\b(?:it'?s|its|is)\s+([a-z0-9][\w\s.'-]{1,40}?)\s+not\s+([a-z0-9][\w\s.'-]{1,40})/i;
const NAH_ITS =
  /\b(?:nah(?:\s+bro)?|nope|wrong)[,.]?\s*(?:it'?s|its|is)\s+(.+)$/i;
const ACTUALLY_ITS = /\b(?:actually|i\s+meant)[,.]?\s*(?:it'?s|its|is)?\s*(.+)$/i;

function cleanIdentity(raw: string): string {
  return raw
    .replace(/^(it'?s|its|is|a|an|the)\s+/i, "")
    .replace(/\b(not|bro|mate|please|thanks)\b/gi, " ")
    .replace(/[^\w\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COLOUR_WORD_RE =
  /^(?:natural|space|midnight|pearl|matte|metallic|starlight|graphite|alpine|gunmetal|navy|dark|light|forest|racing\s+)?(?:black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy|titanium|graphite|starlight)$/i;

const STORAGE_CAP_RE = /^(?:64|128|256|512|1024)(?:\s*(?:gb|tb))?$/i;

function looksLikePersonOrSubject(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 60) return false;
  // 1–4 tokens, mostly letters — player/character/product identity
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 5) return false;
  if (/^\d+$/.test(t)) return false;
  if (COLOUR_WORD_RE.test(t) || STORAGE_CAP_RE.test(t)) return false;
  if (
    /^(new|used|good|fair|mint|auckland|wellington|manual|auto|petrol|pad|pads|game|games|charger|chargers|bond|pickup|purple|blue|black|white)$/i.test(
      t
    )
  ) {
    return false;
  }
  if (/\b(?:gb|tb|pad|controller|game|charger|bond|inch)\b/i.test(t)) return false;
  return /^[a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,4}$/i.test(t);
}

function looksLikeVehicleGen(t: string): boolean {
  return /\b(r[\s-]?3[2-4]|a80|a90|mk\s?[45]|jza80|e9[0-3]|f[238]0)\b/i.test(t);
}

function extractPriceFact(
  message: string,
  pendingSlot?: ListingMissingSlot | null
): ExtractedFactHint | null {
  // Odometer answers must never become price
  if (
    pendingSlot === "odometer" &&
    /^\s*[\d,]+\s*k?\s*(?:km|kms|kilometers|kilometres|miles?|mi)?\s*$/i.test(
      message.trim()
    )
  ) {
    return null;
  }
  // Strip grade tokens so "PSA 10 … 300" does not treat 10 as price
  let scrubbed = message
    .replace(/\b(psa|bgs|cgc|sgc)\s*[0-9]{1,2}(?:\.\d)?\b/gi, " ")
    .replace(/\bnumbered\s+\d{1,4}\b/gi, " ")
    .replace(
      /\b[\d,]+\s*k\s*(?:km|kms|kilometers|kilometres|miles?|mi)\b/gi,
      " "
    )
    .replace(/\b\d+\s*(?:gb|tb)\b/gi, " ")
    .replace(/\bbattery\s*\d{2,3}\b/gi, " ")
    .replace(/\b(?:wait\s+)?(?:no|nah|actually)\s+(?:64|128|256|512|1024)\b/gi, " ")
    .replace(/\b(?:wait\s+)?(?:no|nah)\s+\d{2,4}\b/gi, " ")
    .replace(/\b\d+\s+(?:pads?|controllers?|games?|chargers?|keys?)\b/gi, " ");
  // Vehicle compound: year + odo-k + price-k → drop the first bare k (odometer)
  const kTokens = scrubbed.match(/\b[\d,]+\s*k\b/gi) || [];
  if (/\b(?:19|20)\d{2}\b/.test(scrubbed) && kTokens.length >= 2) {
    scrubbed = scrubbed.replace(/\b[\d,]+\s*k\b/i, " ");
  }
  const m =
    scrubbed.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?/i) ||
    scrubbed.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(k)\s*(?:bucks|nzd|dollars?)?\b/i
    ) ||
    scrubbed.match(
      /\b([\d,]+(?:\.\d{1,2})?)\s*(?:bucks|nzd|dollars?)\b/i
    ) ||
    scrubbed.match(/\b(?:make\s+it|asking|price(?:\s+is)?)\s*\$?\s*([\d,]+)\s*(k)?/i) ||
    scrubbed.match(
      /\b(?:under|up\s+to|max(?:imum)?|budget|around|about|less\s+than|below)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i
    ) ||
    scrubbed.match(/\b(?:actually|for|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i) ||
    // Bare price only when not a tiny grade-like residue
    scrubbed.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(k)?\b/i);
  if (!m) return null;
  let n = Number(String(m[1]).replace(/,/g, ""));
  const kFlag = m[2];
  if (kFlag && /^k$/i.test(String(kFlag))) n *= 1000;
  if (!Number.isFinite(n) || n < 1 || n > 10_000_000) return null;
  if (
    /^(64|128|256|512|1024)$/.test(String(Math.round(n))) &&
    /\b(?:wait|nah|actually|no|gb|tb)\b/i.test(message)
  ) {
    return null;
  }
  if (n >= 1980 && n <= 2035 && !/\$/.test(m[0]) && !kFlag) return null;
  // Ignore lone tiny numbers that are likely grade leftovers (1–10) unless $-prefixed
  if (n <= 10 && !/\$/.test(m[0]) && !kFlag && !/price|bucks|asking|actually/i.test(message)) {
    return null;
  }
  return {
    key: "price",
    value: String(Math.round(n)),
    slot: "price",
    confidence: "HIGH",
  };
}

function extractLocationFact(message: string): ExtractedFactHint | null {
  const m = message.match(
    /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston\s+north|rotorua|queenstown|nelson|whangarei|henderson|manukau|albany)\b/i
  );
  if (!m) return null;
  const city = m[1]
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return { key: "location", value: city, slot: "location", confidence: "HIGH" };
}

function extractYearFact(message: string): ExtractedFactHint | null {
  const m = message.match(/\b((?:19|20)\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 1950 || y > new Date().getFullYear() + 1) return null;
  return { key: "vehicleYear", value: m[1], slot: "year", confidence: "HIGH" };
}

function extractGenerationFact(message: string): ExtractedFactHint | null {
  const m = message.match(/\b(r[\s-]?3[2-4]|a80|a90|mk\s?[45]|jza80)\b/i);
  if (!m) return null;
  const gen = m[1].replace(/[\s-]/g, "").toUpperCase();
  return {
    key: "vehicleGeneration",
    value: gen,
    slot: "generation",
    confidence: "HIGH",
  };
}

function extractPickupOnly(message: string): ExtractedFactHint | null {
  if (!/\bpick(?:\s*-?\s*up|up)\s+only\b/i.test(message)) return null;
  return {
    key: "delivery",
    value: "pickup_only",
    confidence: "HIGH",
  };
}

/**
 * Detect identity/subject corrections from natural language + prior context.
 */
function extractIdentityCorrection(
  message: string,
  opts?: {
    priorAssistant?: string;
    pendingSlot?: ListingMissingSlot | null;
    canonicalTitle?: string;
    canonicalSubject?: string;
  }
): { facts: ExtractedFactHint[]; correctedKeys: string[]; residual: string } | null {
  const t = message.trim();
  const facts: ExtractedFactHint[] = [];
  const correctedKeys: string[] = [];
  let residual = t;

  const itsNot = t.match(ITS_X_NOT_Y);
  if (itsNot) {
    const correct = cleanIdentity(itsNot[1]);
    const rejected = cleanIdentity(itsNot[2] || "");
    if (COLOUR_WORD_RE.test(correct) || COLOUR_WORD_RE.test(rejected)) {
      facts.push({
        key: "colour",
        value: correct.charAt(0).toUpperCase() + correct.slice(1).toLowerCase(),
        slot: "colour",
        confidence: "HIGH",
      });
      correctedKeys.push("colour");
      residual = t.replace(itsNot[0], " ").replace(/\s+/g, " ").trim();
      return { facts, correctedKeys, residual };
    }
    if (looksLikePersonOrSubject(correct) || looksLikeVehicleGen(correct)) {
      if (looksLikeVehicleGen(correct)) {
        facts.push({
          key: "vehicleGeneration",
          value: correct.replace(/[\s-]/g, "").toUpperCase(),
          slot: "generation",
          confidence: "HIGH",
        });
        correctedKeys.push("vehicleGeneration");
      } else {
        facts.push({
          key: "cardSubject",
          value: correct,
          slot: "card_subject",
          confidence: "HIGH",
        });
        facts.push({
          key: "itemIdentity",
          value: correct,
          confidence: "HIGH",
        });
        correctedKeys.push("cardSubject", "itemIdentity", "title");
      }
      residual = "";
      return { facts, correctedKeys, residual };
    }
  }

  const notBut = t.match(NOT_X_BUT_Y);
  if (notBut) {
    const correct = cleanIdentity(notBut[2] || notBut[1]);
    if (looksLikePersonOrSubject(correct)) {
      facts.push({
        key: "cardSubject",
        value: correct,
        slot: "card_subject",
        confidence: "HIGH",
      });
      facts.push({ key: "itemIdentity", value: correct, confidence: "HIGH" });
      correctedKeys.push("cardSubject", "itemIdentity", "title");
      residual = "";
      return { facts, correctedKeys, residual };
    }
  }

  const nah = t.match(NAH_ITS) || t.match(ACTUALLY_ITS);
  if (nah) {
    const correct = cleanIdentity(nah[1]);
    if (looksLikeVehicleGen(correct) || looksLikeVehicleGen(t)) {
      const genFact = extractGenerationFact(t);
      if (genFact) {
        facts.push(genFact);
        correctedKeys.push("vehicleGeneration");
        residual = "";
        return { facts, correctedKeys, residual };
      }
    }
    if (looksLikePersonOrSubject(correct)) {
      facts.push({
        key: "cardSubject",
        value: correct,
        slot: "card_subject",
        confidence: "HIGH",
      });
      facts.push({ key: "itemIdentity", value: correct, confidence: "HIGH" });
      correctedKeys.push("cardSubject", "itemIdentity", "title");
      residual = "";
      return { facts, correctedKeys, residual };
    }
  }

  // "It's Floyd Samba" while pending card_set / after wrong vision subject
  const itsOnly = t.match(/^(?:it'?s|its|is)\s+(.+)$/i);
  if (itsOnly) {
    const correct = cleanIdentity(itsOnly[1]);
    const pending = opts?.pendingSlot;
    const prior = (opts?.priorAssistant || "").toLowerCase();
    const priorSuggestsIdentity =
      /player|character|subject|who\s+is|card|identify|looks\s+like|this\s+is|i\s+think/i.test(
        prior
      );
    if (
      looksLikePersonOrSubject(correct) &&
      (pending === "card_set" ||
        pending === "card_subject" ||
        pending === "title" ||
        priorSuggestsIdentity ||
        Boolean(opts?.canonicalSubject))
    ) {
      facts.push({
        key: "cardSubject",
        value: correct,
        slot: "card_subject",
        confidence: "HIGH",
      });
      facts.push({ key: "itemIdentity", value: correct, confidence: "HIGH" });
      correctedKeys.push("cardSubject", "itemIdentity", "title");
      residual = "";
      return { facts, correctedKeys, residual };
    }
  }

  return null;
}

/**
 * Interpret a user turn against pending question + canonical facts.
 * Deterministic — no extra AI call.
 */
export function interpretSemanticTurn(opts: {
  message: string;
  pendingSlot?: ListingMissingSlot | null;
  priorAssistant?: string;
  canonical?: Partial<SkyAiListingFill> | null;
}): SemanticTurnInterpretation {
  const message = opts.message.trim();
  const kinds: SemanticIntentKind[] = [];
  const notes: string[] = [];
  const facts: ExtractedFactHint[] = [];
  let correctedKeys: string[] = [];
  let residualMessage = message;

  if (!message) {
    return {
      kinds: ["CLARIFICATION"],
      primary: "CLARIFICATION",
      isCorrection: false,
      isMultiFact: false,
      isMultiIntent: false,
      facts: [],
      correctedKeys: [],
      residualMessage: "",
      notes: ["empty"],
    };
  }

  if (UNCERTAINTY_RE.test(message)) kinds.push("UNCERTAINTY");
  if (QUESTION_RE.test(message)) kinds.push("QUESTION");
  if (COMMAND_RE.test(message)) kinds.push("COMMAND");
  if (AFFIRM_RE.test(message)) kinds.push("AFFIRMATION");
  if (NEGATE_RE.test(message)) kinds.push("NEGATION");

  const canonSubject =
    (opts.canonical?.extras || [])
      .find((e) => e.toLowerCase().startsWith("subject:"))
      ?.slice("subject:".length) || undefined;

  const identityCorr = extractIdentityCorrection(message, {
    priorAssistant: opts.priorAssistant,
    pendingSlot: opts.pendingSlot,
    canonicalTitle: opts.canonical?.title,
    canonicalSubject: canonSubject,
  });
  if (identityCorr) {
    kinds.push("CORRECTION");
    facts.push(...identityCorr.facts);
    correctedKeys = identityCorr.correctedKeys;
    residualMessage = identityCorr.residual;
    notes.push("identity_correction");
  } else if (CORRECTION_FRAME_RE.test(message) || NEGATE_RE.test(message)) {
    // Framing suggests correction even if we only extract other facts
    kinds.push("CORRECTION");
    notes.push("correction_frame");
  }

  const price = extractPriceFact(message, opts.pendingSlot);
  if (price) facts.push(price);
  const loc = extractLocationFact(message);
  if (loc) facts.push(loc);
  const year = extractYearFact(message);
  if (year) facts.push(year);
  const gen = extractGenerationFact(message);
  if (gen && !facts.some((f) => f.key === "vehicleGeneration")) facts.push(gen);
  const pickup = extractPickupOnly(message);
  if (pickup) facts.push(pickup);

  const storageHits = [...message.matchAll(/\b(\d+)\s?(gb|tb)\b/gi)];
  const storageBare = message.match(/\b(?:wait\s+)?(?:no|nah)\s+(\d{2,4})\b/i);
  const storageN =
    storageBare && Number(storageBare[1]) >= 32
      ? storageBare[1]
      : storageHits.length
        ? storageHits[storageHits.length - 1][1]
        : null;
  if (storageN) {
    const unit = (storageHits[storageHits.length - 1]?.[2] || "GB").toUpperCase();
    facts.push({
      key: "storage",
      value: `${storageN}${unit}`,
      slot: "storage",
      confidence: "HIGH",
    });
    correctedKeys.push("storage");
  }
  const colours = [
    ...message.matchAll(
      /\b(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|purple|pink|navy)\b/gi
    ),
  ];
  const colourDenied = /\bnot\s+(black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|purple|pink|navy)\b/gi;
  const denied = new Set(
    [...message.matchAll(colourDenied)].map((hit) => hit[1].toLowerCase())
  );
  if (colours.length) {
    const affirmed = colours.filter((hit) => !denied.has(hit[1].toLowerCase()));
    const last = (affirmed.length ? affirmed : colours).at(-1)?.[1];
    if (last) {
      facts.push({
        key: "colour",
        value: last.charAt(0).toUpperCase() + last.slice(1).toLowerCase(),
        slot: "colour",
        confidence: "HIGH",
      });
      correctedKeys.push("colour");
    }
  }
  const battery = message.match(/\bbattery\s*(\d{2,3})\b/i);
  if (battery) {
    facts.push({
      key: "battery",
      value: battery[1],
      confidence: "HIGH",
    });
  }
  if (/\b(?:screen\s+)?crack(?:ed|s)?\b/i.test(message)) {
    facts.push({
      key: "conditionDetail",
      value: "cracked screen",
      slot: "condition",
      confidence: "HIGH",
    });
  }
  const padHit = message.match(/\b(\d+)\s+(pads?|controllers?)\b/i);
  if (padHit) {
    facts.push({
      key: "included",
      value: `${padHit[1]} ${padHit[2].toLowerCase()}`,
      slot: "quantity",
      confidence: "HIGH",
    });
  }
  const gameHit = message.match(/\b(\d+)\s+games?\b/i);
  if (gameHit) {
    facts.push({
      key: "included",
      value: `${gameHit[1]} games`,
      slot: "quantity",
      confidence: "HIGH",
    });
  }
  if (/\bhedge\s*trimm/i.test(message)) {
    facts.push({
      key: "included",
      value: "hedge trimming",
      slot: "service_rate",
      confidence: "HIGH",
    });
  }
  if (/\bwof\b/i.test(message)) {
    facts.push({
      key: "included",
      value: "WOF checks",
      slot: "service_rate",
      confidence: "HIGH",
    });
  }
  if (/\bengine\s+knocks?\b/i.test(message)) {
    facts.push({
      key: "conditionDetail",
      value: "engine knocks",
      slot: "condition",
      confidence: "HIGH",
    });
  }

  const parsedCondition = parseListingCondition(message);
  if (parsedCondition) {
    facts.push({
      key: "condition",
      value: parsedCondition,
      slot: "condition",
      confidence: "HIGH",
    });
  }

  if (facts.length && !kinds.includes("CORRECTION")) {
    if (opts.pendingSlot && facts.some((f) => f.slot === opts.pendingSlot)) {
      kinds.push("ANSWER");
    } else {
      kinds.push("NEW_FACT");
    }
  }

  // Semantic correction vs prior vision/title without keyword
  if (
    !kinds.includes("CORRECTION") &&
    facts.some((f) => f.key === "cardSubject" || f.key === "itemIdentity")
  ) {
    const newId = facts.find(
      (f) => f.key === "cardSubject" || f.key === "itemIdentity"
    )?.value;
    const old =
      canonSubject ||
      opts.canonical?.title ||
      "";
    if (
      newId &&
      old &&
      !old.toLowerCase().includes(newId.toLowerCase()) &&
      !newId.toLowerCase().includes(old.toLowerCase().slice(0, 8))
    ) {
      kinds.push("CORRECTION");
      correctedKeys.push("cardSubject", "itemIdentity", "title");
      notes.push("semantic_conflict_with_canonical");
    }
  }

  if (!kinds.length) {
    kinds.push(opts.pendingSlot ? "ANSWER" : "NEW_FACT");
  }

  const uniqueKinds = [...new Set(kinds)];
  const primary =
    uniqueKinds.find((k) => k === "CORRECTION") ||
    uniqueKinds.find((k) => k === "COMMAND") ||
    uniqueKinds.find((k) => k === "QUESTION") ||
    uniqueKinds.find((k) => k === "UNCERTAINTY") ||
    uniqueKinds.find((k) => k === "ANSWER") ||
    uniqueKinds.find((k) => k === "NEW_FACT") ||
    uniqueKinds[0];

  return {
    kinds: uniqueKinds,
    primary,
    isCorrection: uniqueKinds.includes("CORRECTION"),
    isMultiFact: facts.length > 1,
    isMultiIntent: uniqueKinds.length > 1,
    facts,
    correctedKeys: [...new Set(correctedKeys)],
    residualMessage,
    notes,
  };
}
