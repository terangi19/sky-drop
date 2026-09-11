/**
 * Natural-language composition for seller evidence facts.
 * RAW jammed fragments → atomic facts → grammatical prose.
 * No product dictionaries — structural patterns only.
 */

function clean(raw: string): string {
  return String(raw || "")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lowerLead(text: string): string {
  if (!text) return text;
  if (/^(?:[A-Z]{2,}|[A-Z]\d)(?:\s|$)/.test(text) || /^\d/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function ensureSentence(text: string): string {
  const trimmed = text.replace(/\.+$/, "").trim();
  if (!trimmed) return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/** Join clauses with commas + and — preserve leading verbs. */
export function joinNaturalClauses(items: string[]): string {
  const cleaned = items.map((i) => clean(i)).filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] || "";
  const tail = cleaned.slice(1).map(lowerLead);
  if (cleaned.length === 2) return `${cleaned[0]} and ${tail[0]}`;
  return `${[cleaned[0], ...tail.slice(0, -1)].join(", ")} and ${tail[tail.length - 1]}`;
}

/**
 * Structural patterns that start a new condition/fault atom inside
 * unpunctuated seller text. Product-agnostic.
 */
const CONDITION_START_RE = new RegExp(
  [
    String.raw`needs?(?:\s+(?:a|an|the))?(?:\s+new)?\b`,
    String.raw`missing\b`,
    String.raw`(?:cracked?|broken|scratched?|dented?|torn|stained?|chipped|warped|faded)\b`,
    String.raw`doesn'?t\b`,
    String.raw`won'?t\b`,
    String.raw`(?:small|minor|slight|major|large|tiny|hairline)\s+(?:[\w-]+\s+)?(?:leaks?|scratches?|dents?|dings?|tears?|stains?|cracks?|marks?|chips?)`,
    String.raw`(?:oil|hydraulic|coolant|fuel)\s+leaks?`,
    String.raw`(?:face\s*id|touch\s*id|fingerprint(?:\s+sensor)?|charging\s+port|home\s+button|touchscreen|keyboard|trackpad)\b`,
  ].join("|"),
  "gi"
);

/**
 * Split one jammed seller condition blob into atomic facts.
 * "needs new clutch small oil leak" → ["needs new clutch", "small oil leak"]
 */
export function splitJammedConditionAtoms(raw: string): string[] {
  const text = clean(raw);
  if (!text) return [];

  if (/,|;|\band\b|\./i.test(text)) {
    const parts = text
      .split(/\s*(?:,|;|\band\b|\.)\s*/i)
      .map(clean)
      .filter((p) => p.length >= 3);
    return parts.length ? parts : [text];
  }

  const starts: number[] = [];
  CONDITION_START_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CONDITION_START_RE.exec(text)) !== null) {
    // Avoid nested starts inside an already-recorded span start
    if (starts.length && match.index < starts[starts.length - 1] + 2) continue;
    starts.push(match.index);
  }

  if (starts.length < 2) return [text];

  const atoms: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : text.length;
    const atom = clean(text.slice(from, to));
    if (atom.length >= 3) atoms.push(atom);
  }

  return atoms.length >= 2 ? dedupeAtoms(atoms) : [text];
}

function dedupeAtoms(atoms: string[]): string[] {
  const out: string[] = [];
  for (const atom of atoms) {
    const n = atom.toLowerCase();
    if (out.some((e) => e.toLowerCase() === n || e.toLowerCase().includes(n))) continue;
    if (out.some((e) => n.includes(e.toLowerCase()) && n !== e.toLowerCase())) {
      // replace shorter with longer
      const idx = out.findIndex((e) => n.includes(e.toLowerCase()));
      if (idx >= 0) out[idx] = atom;
      continue;
    }
    out.push(atom);
  }
  return out;
}

/** Expand every jammed condition detail into atoms. */
export function expandConditionDetailAtoms(details: string[]): string[] {
  const out: string[] = [];
  for (const detail of details) {
    for (const atom of splitJammedConditionAtoms(detail)) {
      // Drop positive-only status lines ("fingerprint works") from fault prose
      if (
        /\bworks?\b/i.test(atom) &&
        !/\b(?:doesn'?t|won'?t|broken|faulty|dead|cut|fail)/i.test(atom)
      ) {
        continue;
      }
      const n = atom.toLowerCase();
      if (!out.some((e) => e.toLowerCase() === n)) out.push(atom);
    }
  }
  return out;
}

function withIndefiniteArticle(nounPhrase: string): string {
  let t = clean(nounPhrase).replace(/^(?:a|an|the)\s+/i, "");
  if (!t) return nounPhrase;
  if (/^(?:\d+|some|few|several|many|no|original|oem)\b/i.test(t)) {
    if (/^original\b/i.test(t)) return `the ${t}`;
    return t;
  }
  const last = (t.split(/\s+/).pop() || "").toLowerCase();
  if (
    /(?:scratches|dents|dings|marks|tears|stains|cracks|chips|scuffs)$/i.test(last) &&
    !/ss$/i.test(last)
  ) {
    return t;
  }
  // Letter-named acronyms spoken with consonant onset (USB, HDMI, SSD, LED…)
  if (/^(?:usb|hdmi|ssd|hdd|led|lcd|oem|abs|gps|nzd)\b/i.test(t)) {
    return `a ${t}`;
  }
  const firstLetter = (t.match(/[a-z]/i) || ["a"])[0];
  const article = /^[aeiou]/i.test(firstLetter) ? "an" : "a";
  return `${article} ${t}`;
}

/**
 * Turn one condition atom into a natural clause (no trailing period).
 */
export function naturalizeConditionClause(atom: string): string {
  const t = clean(atom);
  if (!t) return "";

  if (/^needs?\b/i.test(t)) {
    const rest = t.replace(/^needs?\s+/i, "").replace(/^(?:a|an|the)\s+/i, "");
    if (/^new\s+/i.test(rest)) return `needs ${withIndefiniteArticle(rest)}`;
    if (/^(?:repair|work|servicing)\b/i.test(rest)) return `needs ${rest}`;
    return `needs ${withIndefiniteArticle(rest)}`;
  }

  if (/^missing\b/i.test(t)) {
    const rest = t.replace(/^missing\s+/i, "");
    return `is missing ${withIndefiniteArticle(rest)}`;
  }

  if (/\bleaks?\b/i.test(t)) {
    return `has ${withIndefiniteArticle(t)}`;
  }

  if (/^(?:cracked|broken|scratched|dented|torn|stained|chipped|warped|faded)\b/i.test(t)) {
    return `has ${withIndefiniteArticle(t)}`;
  }

  if (/doesn'?t\b|won'?t\b|cuts?\s+out|drains?\s+quickly|intermittent/i.test(t)) {
    return lowerLead(t);
  }

  if (
    /(?:face\s*id|touch\s*id|fingerprint|charging\s+port|home\s+button|touchscreen)/i.test(t) &&
    /(?:work|broken|faulty|dead|cut)/i.test(t)
  ) {
    return lowerLead(t);
  }

  return `has ${withIndefiniteArticle(t)}`;
}

/** Compose one or many condition atoms into a buyer-facing sentence. */
export function composeNaturalConditionProse(details: string[]): string {
  const atoms = expandConditionDetailAtoms(details);
  if (!atoms.length) return "";
  const clauses = atoms.map(naturalizeConditionClause).filter(Boolean);
  if (!clauses.length) return "";
  return ensureSentence(joinNaturalClauses(clauses));
}

/** Articles for included/accessory nouns. */
export function withAccessoryArticle(item: string): string {
  const t = clean(item).replace(/^(?:a|an|the)\s+/i, "");
  if (!t) return item;
  if (/^original\b/i.test(t)) return `the ${t}`;
  if (/^(?:\d+|pair|set|both|two|three)\b/i.test(t)) return t;
  if (/s$/i.test((t.split(/\s+/).pop() || "")) && /(?:cables|chargers|controllers|pads|racks)$/i.test(t)) {
    return t;
  }
  return withIndefiniteArticle(t);
}

export function composeNaturalIncludedProse(
  items: string[],
  lead: "Comes with" | "Includes" | "Fitted with"
): string {
  const cleaned = items.map(clean).filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length === 1) {
    return ensureSentence(`${lead} ${withAccessoryArticle(cleaned[0])}`);
  }
  const withArticles = cleaned.map((item, i) =>
    i === 0 ? withAccessoryArticle(item) : lowerLead(withAccessoryArticle(item))
  );
  // First already has article; join rest
  if (withArticles.length === 2) {
    return ensureSentence(`${lead} ${withArticles[0]} and ${withArticles[1]}`);
  }
  return ensureSentence(
    `${lead} ${[withArticles[0], ...withArticles.slice(1, -1)].join(", ")} and ${
      withArticles[withArticles.length - 1]
    }`
  );
}

export function composeNaturalModificationProse(items: string[]): string {
  const cleaned = items
    .map((item) =>
      clean(item)
        .replace(/^(?:a|an|the)\s+(?=\S)/i, "")
        .replace(/^(?:it\s+has|it'?s\s+got|has)\s+/i, "")
        .replace(/^(?:a|an|the)\s+(?=\S)/i, "")
        .trim()
    )
    .filter((item) => item && !/^(?:a|an|the)$/i.test(item));
  if (!cleaned.length) return "";
  const nouned = cleaned.map((item) =>
    item.replace(/^(?:fitted with|modified with|upgraded with|has|with)\s+/i, "")
  );
  const withArticles = nouned.map((item) => {
    const last = item.split(/\s+/).pop() || "";
    const noArticle =
      /^(?:\d|[A-Z0-9-]{2,}\b)/.test(item) ||
      /[/]/.test(item) ||
      (last.endsWith("s") && !last.endsWith("ss")) ||
      /\b(?:and|with)\b/i.test(item);
    if (noArticle) return lowerLead(item);
    return lowerLead(withIndefiniteArticle(item));
  });
  // Prefer "Modified with" for upgrade lists
  const body =
    withArticles.length === 1
      ? withArticles[0]
      : withArticles.length === 2
        ? `${withArticles[0]} and ${withArticles[1]}`
        : `${[withArticles[0], ...withArticles.slice(1, -1)].join(", ")} and ${
            withArticles[withArticles.length - 1]
          }`;
  return ensureSentence(`Modified with ${body}`);
}

/**
 * True when a sentence looks like raw jammed facts dumped without composition.
 * Generic: multiple condition atoms glued with no and/comma.
 */
export function hasUncomposedFactDump(description: string): boolean {
  const sentences = String(description || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const body = sentence.replace(/[.!?]+$/, "").trim();
    if (!body || /,|\band\b|;/i.test(body)) continue;

    // "Needs new clutch small oil leak" — rest after Needs splits into ≥2 atoms
    if (/^Needs?\s+/i.test(body)) {
      const rest = body.replace(/^Needs?\s+/i, "");
      const atoms = splitJammedConditionAtoms(rest);
      if (atoms.length >= 2) return true;
    }

    // Whole sentence is a jammed multi-atom condition blob
    const atoms = splitJammedConditionAtoms(body);
    if (
      atoms.length >= 2 &&
      atoms.join(" ").replace(/\s+/g, " ").toLowerCase() ===
        body.replace(/\s+/g, " ").toLowerCase()
    ) {
      return true;
    }
  }

  // Repeated identical starters (Comes with X. Comes with Y.)
  const starters = sentences
    .map((s) => s.match(/^(Comes with|Fitted with|Includes|Has)\b/i)?.[1]?.toLowerCase())
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const s of starters) counts.set(s!, (counts.get(s!) || 0) + 1);
  for (const n of counts.values()) {
    if (n >= 2) return true;
  }

  return false;
}
