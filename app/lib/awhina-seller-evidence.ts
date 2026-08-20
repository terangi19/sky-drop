/**
 * Generic seller-evidence capture for listing drafts.
 *
 * Useful seller statements that do not have a dedicated schema field are
 * stored as typed extras (modification, maintenance, conditionDetail, …)
 * and passed to the description writer as structured JSON — never as raw
 * metadata dumps in public copy.
 */

export const SELLER_EVIDENCE_KINDS = [
  "modification",
  "maintenance",
  "conditionDetail",
  "mechanical",
  "compliance",
  "included",
  "note",
] as const;

export type SellerEvidenceKind = (typeof SELLER_EVIDENCE_KINDS)[number];

export type SellerEvidenceItem = {
  kind: SellerEvidenceKind;
  text: string;
};

export type GroupedSellerEvidence = {
  modifications: string[];
  maintenance: string[];
  conditionDetails: string[];
  mechanical: string[];
  compliance: string[];
  included: string[];
  notes: string[];
  location?: string;
};

export type SellerEvidenceHarvestContext = {
  title?: string;
  colour?: string;
  location?: string;
  condition?: string;
};

const MULTI_VALUE_KEYS = new Set([
  "modification",
  "maintenance",
  "conditiondetail",
  "mechanical",
  "compliance",
  "included",
  "note",
]);

const MOD_HEAD_RE =
  /\b(aftermarket|modified|modifications?|fitted with|upgraded|upgrade)\b/i;
const MOD_ITEM_RE =
  /\b(exhaust|intake|coilovers?|wheels?|turbo|intercooler|downpipe|brakes?|suspension|18-?inch|20-?inch)\b/i;
const MAINT_RE =
  /\b(serviced|service|fresh (?:engine )?oil|filters?|maintenance|oil change|new chain|new (?:tyres?|tires?))\b/i;
const MECH_RE =
  /\b(no known (?:mechanical )?faults?|no (?:cracks?|faults?|repairs?|damage)|starts and drives|drives well|mechanical faults?|battery health|\d{2,3}\s*%\s*(?:battery)?|battery(?:\s+health)?\s*(?:is\s*(?:at\s*)?)?\d{2,3}\s*%)\b/i;
const COMPLY_RE = /\b(wof|warrant of fitness|rego|registration)\b/i;
const INCLUDED_RE =
  /\b(comes with|original box|with box|charger|box and charger|usb-?c|cables?|controller|screen protector)\b/i;
const USE_HISTORY_RE =
  /\b(always used with|used with a case|screen protector|case and screen)\b/i;
const COND_DETAIL_RE =
  /\b(scratch(?:es)?|stone chips?|marks?|dents?|dings?|scuffs?|chips?|tidy|wear|worn twice|paint|interior|age-related|tiny scratch|small (?:scratch|mark|dent)|corner)\b/i;
const LOGISTICS_RE = /\b(pickup only|pick-?up only|shipping only)\b/i;
const PROVENANCE_RE = /\b(bought from|purchased from|from [A-Z][\w' -]{2,40})\b/i;
const DIMENSION_RE = /\b\d+(?:\.\d+)?\s*(?:cm|mm|m|inch(?:es)?|ft)\b/i;
const MATERIAL_RE = /\b(solid oak|oak|pine|teak|walnut|steel|alloy|leather|canvas)\b/i;
const COLOUR_ONLY_RE =
  /^(?:(?:natural|space|midnight|pearl|matte|metallic|starlight|graphite|alpine|gunmetal|navy|dark|light|forest|racing)\s+)?(?:black|white|silver|grey|gray|blue|red|green|yellow|orange|brown|gold|beige|purple|pink|bronze|maroon|navy|titanium|graphite|starlight)$/i;

export function isSellerEvidenceExtraKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/_/g, "");
  return MULTI_VALUE_KEYS.has(normalized) || normalized === "sellernotes";
}

export function isSellerEvidenceExtra(entry: string): boolean {
  const match = String(entry || "").trim().match(/^([a-z][a-z0-9_]*)\s*:/i);
  return Boolean(match && isSellerEvidenceExtraKey(match[1]));
}

export function extraKeyIsMultiValue(key: string): boolean {
  return MULTI_VALUE_KEYS.has(key.toLowerCase().replace(/_/g, ""));
}

function cleanFragment(raw: string): string {
  return String(raw || "")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .replace(/^(?:and|with|plus)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function splitList(text: string): string[] {
  return text
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map(cleanFragment)
    .filter((part) => part.length >= 2);
}

function shouldSkipFragment(raw: string, ctx: SellerEvidenceHarvestContext): boolean {
  const t = normalize(raw);
  if (t.length < 3) return true;
  if (/\b(?:sell(?:ing)?|list)\s+my\b/.test(t)) return true;
  if (/\$\s*[\d,]/.test(t)) return true;
  if (/^asking\b/.test(t)) return true;
  if (/^\d{4}$/.test(t)) return true;
  if (/^\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:k\s*)?(?:km|kilometers?|kilometres?)$/.test(t)) {
    return true;
  }
  if (/^(manual|automatic|auto)$/.test(t)) return true;
  if (
    /^(?:brand new|like[\s-]*new(?:\s+condition)?|good used condition|good condition|used condition|fair condition|excellent condition|mint condition|new|used|good|fair|sealed|unopened)$/.test(
      t
    )
  ) {
    return true;
  }
  if (COLOUR_ONLY_RE.test(t)) return true;
  if (ctx.colour && t === normalize(ctx.colour)) return true;
  const location = ctx.location?.trim();
  if (location) {
    const loc = normalize(location);
    if (t === loc || t === `located in ${loc}` || t === `in ${loc}`) return true;
    const leftover = t
      .replace(new RegExp(`\\b(?:located in|in)\\s+${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ")
      .replace(new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ")
      .replace(
        /\b(?:brand new|like new|good used condition|good condition|used condition|fair condition|excellent condition|mint condition|new|used|good|fair|condition|cars?|vehicle|it|its|the|and|is|are|in|of|on|at|to)\b/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
    if (!leftover) return true;
  }
  if (/^located in /.test(t) && t.split(" ").length <= 4) return true;
  if (/^\d+\s?(gb|tb)$/.test(t)) return true;
  if (/^size\s+\S+$/.test(t)) return true;
  if (/\b\d{3,}\s*k(?:m|ms)?\b/.test(t) && t.split(" ").length <= 5) return true;
  const title = ctx.title ? normalize(ctx.title) : "";
  if (title) {
    const withoutYear = t.replace(/^\d{4}\s+/, "");
    if (
      (t === title || withoutYear === title) &&
      !MOD_ITEM_RE.test(t) &&
      !MAINT_RE.test(t) &&
      !COND_DETAIL_RE.test(t)
    ) {
      return true;
    }
    if (
      title.includes(t) &&
      t.split(" ").length <= 6 &&
      !MOD_ITEM_RE.test(t) &&
      !MAINT_RE.test(t) &&
      !COND_DETAIL_RE.test(t)
    ) {
      return true;
    }
  }
  return false;
}

function pushUnique(items: SellerEvidenceItem[], item: SellerEvidenceItem): void {
  const text = cleanFragment(item.text);
  if (text.length < 3) return;
  const key = `${item.kind}:${normalize(text)}`;
  if (items.some((existing) => `${existing.kind}:${normalize(existing.text)}` === key)) {
    return;
  }
  items.push({ kind: item.kind, text });
}

function harvestFragment(
  raw: string,
  ctx: SellerEvidenceHarvestContext
): SellerEvidenceItem[] {
  const text = cleanFragment(raw);
  if (!text || shouldSkipFragment(text, ctx)) return [];
  const items: SellerEvidenceItem[] = [];

  if (COMPLY_RE.test(text)) {
    if (/\bwof\b|\bwarrant of fitness\b/i.test(text)) {
      pushUnique(items, { kind: "compliance", text: "WOF current" });
    }
    if (/\brego\b|\bregistration\b/i.test(text)) {
      pushUnique(items, { kind: "compliance", text: "registration current" });
    }
    if (items.length) return items;
  }

  if (MECH_RE.test(text)) {
    if (/\bno known (?:mechanical )?faults?\b/i.test(text)) {
      pushUnique(items, { kind: "mechanical", text: "no known mechanical faults" });
    }
    if (/\bstarts and drives\b|\bdrives well\b/i.test(text)) {
      pushUnique(items, { kind: "mechanical", text: "starts and drives well" });
    }
    const battery =
      text.match(/(\d{2,3})\s*%\s*(?:battery(?:\s+health)?)/i) ||
      text.match(/battery(?:\s+health)?\s*(?:is\s*(?:at\s*)?)?(\d{2,3})\s*%/i);
    if (battery) {
      pushUnique(items, { kind: "mechanical", text: `${battery[1]}% battery health` });
    }
    if (/\bno (?:cracks?|faults?|repairs?|damage)\b/i.test(text)) {
      pushUnique(items, { kind: "mechanical", text });
    }
    if (items.length) return items;
  }

  if (MAINT_RE.test(text) && !MOD_HEAD_RE.test(text)) {
    pushUnique(items, { kind: "maintenance", text });
    return items;
  }

  if (MOD_HEAD_RE.test(text) || MOD_ITEM_RE.test(text)) {
    if (/\bmostly stock\b|\bexcept\b/i.test(text)) {
      pushUnique(items, { kind: "note", text });
      return items;
    }
    const parts = splitList(
      text.replace(/^(?:fitted with|modified with|has|with)\s+/i, "")
    );
    if (parts.length > 1) {
      for (const part of parts) {
        if (!shouldSkipFragment(part, ctx)) {
          pushUnique(items, { kind: "modification", text: part });
        }
      }
      if (items.length) return items;
    }
    pushUnique(items, {
      kind: "modification",
      text: text.replace(/^(?:fitted with|modified with|has)\s+/i, ""),
    });
    return items;
  }

  if (INCLUDED_RE.test(text) || USE_HISTORY_RE.test(text)) {
    pushUnique(items, { kind: "included", text });
    return items;
  }

  if (COND_DETAIL_RE.test(text)) {
    pushUnique(items, { kind: "conditionDetail", text });
    return items;
  }

  if (LOGISTICS_RE.test(text) || PROVENANCE_RE.test(text) || DIMENSION_RE.test(text) || MATERIAL_RE.test(text)) {
    pushUnique(items, { kind: "note", text });
    return items;
  }

  if (/\b(factory sealed|unopened)\b/i.test(text)) {
    pushUnique(items, { kind: "note", text });
    return items;
  }

  if (text.split(/\s+/).length >= 2) {
    pushUnique(items, { kind: "note", text });
  }
  return items;
}

function harvestSentence(
  sentence: string,
  ctx: SellerEvidenceHarvestContext
): SellerEvidenceItem[] {
  const text = cleanFragment(sentence);
  if (!text) return [];

  if (/\bno\s+(?:known\s+)?(?:cracks?|faults?|repairs?|damage)/i.test(text)) {
    return harvestFragment(text, ctx);
  }

  if (/,/.test(text) || /;/.test(text)) {
    const parts = text.split(/\s*[,;]\s*/).map(cleanFragment).filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => harvestFragment(part, ctx));
    }
  }

  if (shouldSkipFragment(text, ctx)) return [];

  if (
    (MOD_HEAD_RE.test(text) || MOD_ITEM_RE.test(text)) &&
    /\band\b/i.test(text) &&
    !COND_DETAIL_RE.test(text) &&
    !MAINT_RE.test(text)
  ) {
    return harvestFragment(text, ctx);
  }

  return harvestFragment(text, ctx);
}

export function harvestSellerEvidence(
  message: string,
  ctx: SellerEvidenceHarvestContext = {}
): SellerEvidenceItem[] {
  const source = String(message || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map(cleanFragment)
    .filter(Boolean);
  const items: SellerEvidenceItem[] = [];
  for (const sentence of sentences.length ? sentences : [source]) {
    for (const item of harvestSentence(sentence, ctx)) {
      pushUnique(items, item);
    }
  }
  return items;
}

export function sellerEvidenceToExtras(items: SellerEvidenceItem[]): string[] {
  return items
    .map((item) => `${item.kind}:${item.text}`)
    .filter((entry) => entry.length > 4);
}

export function sellerEvidenceFromExtras(extras: string[] | undefined): SellerEvidenceItem[] {
  const items: SellerEvidenceItem[] = [];
  for (const raw of extras || []) {
    const extra = String(raw || "").trim();
    const match = extra.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/_/g, "");
    const value = match[2].trim();
    if (!value) continue;
    if (key === "sellernotes") {
      for (const sentence of value.split(/(?<=[.!?])\s+/)) {
        const text = cleanFragment(sentence);
        if (text.length >= 3) pushUnique(items, { kind: "note", text });
      }
      continue;
    }
    const kind: SellerEvidenceKind | null =
      key === "modification"
        ? "modification"
        : key === "maintenance"
          ? "maintenance"
          : key === "conditiondetail"
            ? "conditionDetail"
            : key === "mechanical"
              ? "mechanical"
              : key === "compliance"
                ? "compliance"
                : key === "included"
                  ? "included"
                  : key === "note"
                    ? "note"
                    : null;
    if (kind) pushUnique(items, { kind, text: value });
  }
  return items;
}

export function groupSellerEvidence(
  items: SellerEvidenceItem[],
  location?: string
): GroupedSellerEvidence {
  const grouped: GroupedSellerEvidence = {
    modifications: [],
    maintenance: [],
    conditionDetails: [],
    mechanical: [],
    compliance: [],
    included: [],
    notes: [],
  };
  const add = (list: string[], value: string) => {
    const text = cleanFragment(value);
    if (text.length < 3) return;
    if (!list.some((existing) => normalize(existing) === normalize(text))) {
      list.push(text);
    }
  };
  for (const item of items) {
    if (item.kind === "modification") add(grouped.modifications, item.text);
    else if (item.kind === "maintenance") add(grouped.maintenance, item.text);
    else if (item.kind === "conditionDetail") add(grouped.conditionDetails, item.text);
    else if (item.kind === "mechanical") add(grouped.mechanical, item.text);
    else if (item.kind === "compliance") add(grouped.compliance, item.text);
    else if (item.kind === "included") add(grouped.included, item.text);
    else add(grouped.notes, item.text);
  }
  if (location?.trim()) grouped.location = location.trim();
  return grouped;
}

export function groupedSellerEvidenceFromExtras(
  extras: string[] | undefined,
  location?: string
): GroupedSellerEvidence {
  return groupSellerEvidence(sellerEvidenceFromExtras(extras), location);
}

export function sellerEvidenceItemCount(grouped: GroupedSellerEvidence): number {
  return (
    grouped.modifications.length +
    grouped.maintenance.length +
    grouped.conditionDetails.length +
    grouped.mechanical.length +
    grouped.compliance.length +
    grouped.included.length +
    grouped.notes.length +
    (grouped.location ? 1 : 0)
  );
}

function joinAnd(items: string[]): string {
  const cleaned = items.map((item) => item.replace(/\.+$/, "").trim()).filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] || "";
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
}

function ensureSentence(text: string): string {
  const trimmed = text.replace(/\.+$/, "").trim();
  if (!trimmed) return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

export function composeSellerEvidenceProse(grouped: GroupedSellerEvidence): string {
  const sentences: string[] = [];
  if (grouped.modifications.length) {
    sentences.push(
      `Fitted with ${joinAnd(grouped.modifications.map((item) => item.charAt(0).toLowerCase() + item.slice(1)))}.`
    );
  }
  for (const item of grouped.maintenance) sentences.push(ensureSentence(item));
  for (const item of grouped.conditionDetails) sentences.push(ensureSentence(item));
  if (grouped.mechanical.length) sentences.push(ensureSentence(joinAnd(grouped.mechanical)));
  if (grouped.compliance.length) {
    const blob = grouped.compliance.join(" ").toLowerCase();
    if (/\bwof\b/.test(blob) && /\b(rego|registration)\b/.test(blob)) {
      sentences.push("WOF and registration are current.");
    } else {
      sentences.push(ensureSentence(joinAnd(grouped.compliance)));
    }
  }
  for (const item of grouped.included) {
    sentences.push(
      ensureSentence(
        /^(comes|includes|with|always)\b/i.test(item) || /\bused with\b/i.test(item)
          ? item
          : `Comes with ${item}`
      )
    );
  }
  for (const item of grouped.notes) sentences.push(ensureSentence(item));
  if (grouped.location) sentences.push(`Located in ${grouped.location}.`);
  return sentences.filter(Boolean).join(" ");
}

export function compactSellerEvidence(
  grouped: GroupedSellerEvidence
): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  if (grouped.modifications.length) compact.modifications = grouped.modifications;
  if (grouped.maintenance.length) compact.maintenance = grouped.maintenance;
  if (grouped.conditionDetails.length) compact.conditionDetails = grouped.conditionDetails;
  if (grouped.mechanical.length) compact.mechanical = grouped.mechanical;
  if (grouped.compliance.length) compact.compliance = grouped.compliance;
  if (grouped.included.length) compact.included = grouped.included;
  if (grouped.notes.length) compact.notes = grouped.notes;
  if (grouped.location) compact.location = grouped.location;
  return compact;
}
