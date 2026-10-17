import { describe, expect, it } from "vitest";
import { extractEmailsFromText, findEmailMatches, sanitizePublicText } from "./public-display";

/** The previous implementation, kept here as the behavioural oracle. */
const LEGACY_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const legacyExtract = (t: string) => [...new Set(t.match(LEGACY_EMAIL_RE) || [])];
const legacyMatches = (t: string) => [...t.matchAll(LEGACY_EMAIL_RE)].map((m) => ({ index: m.index!, match: m[0] }));

function elapsed(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("public-display email scanning: same results as the old regex", () => {
  const cases = [
    "",
    "no emails here",
    "contact bob@example.com please",
    "two: a@b.co and A.B+tag@sub.example.org.",
    "<alice@test.io>, (carol_x@mail.co.nz); dave%y@host-1.example.com!",
    "a@b.co.d@e.fg",
    "x@y.z (tld too short) and ok@y.zz",
    "trailing dot user@example.com.",
    "user@@example.com and user@example..com and @example.com and user@.com",
    "joined a@b.cob@c.de",
    "unicode ✨ tama@kiwi.nz ✨ end",
    "hyphen-start -x@-y.zz",
  ];

  it.each(cases)("matches identically: %j", (text) => {
    expect(findEmailMatches(text)).toEqual(legacyMatches(text));
    expect(extractEmailsFromText(text)).toEqual(legacyExtract(text));
  });

  it("matches identically on random fuzz input", () => {
    const alphabet = "ab.@-_+%9 Zc,.<>xyz";
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 4000; i++) {
      const len = Math.floor(rnd() * 40);
      let t = "";
      for (let j = 0; j < len; j++) t += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(findEmailMatches(t)).toEqual(legacyMatches(t));
    }
  });

  it("sanitizePublicText redaction is unchanged for normal text", () => {
    const handles = { "bob@example.com": "bobby", "carol@example.com": "@caz", "u@example.com": "User" };
    const legacySanitize = (text: string) => {
      let out = text;
      for (const [email, handle] of Object.entries(handles)) {
        const display = handle === "Buyer" || handle === "User" ? handle : handle.startsWith("@") ? handle : `@${handle}`;
        out = out.split(email).join(display);
      }
      return out.replace(LEGACY_EMAIL_RE, (m) => {
        const mapped = (handles as Record<string, string>)[m];
        if (mapped) return mapped === "Buyer" || mapped === "User" ? mapped : mapped.startsWith("@") ? mapped : `@${mapped}`;
        return "Buyer";
      });
    };
    for (const text of [
      "bob@example.com sent an offer",
      "carol@example.com and stranger@other.org and u@example.com",
      "Offer from x.y+z@mail.co.nz on your listing",
      "nothing to redact",
      "",
    ]) {
      expect(sanitizePublicText(text, handles)).toBe(legacySanitize(text));
    }
    expect(sanitizePublicText("hi stranger@other.org", {})).toBe("hi Buyer");
    expect(sanitizePublicText("bob@example.com", handles)).toBe("@bobby");
  });
});

describe("public-display email scanning: linear on hostile input", () => {
  const hostile = (n: number) => [
    "a".repeat(n) + "@",                          // long local run, no domain
    "a".repeat(n),                                // long local run, no "@"
    "x@" + "a.".repeat(n / 2),                    // long domain, no valid TLD
    ".".repeat(n) + "@a",
    ("a@" ).repeat(n / 2),
    "a".repeat(n) + "@b.co",                      // real (long) email still found
  ];

  // The old global regex took ~2.3 s on 50k chars; the linear scan does 1M in ~10 ms.
  it.each([100_000, 1_000_000])("each hostile string of %i chars scans in < 50 ms", (n) => {
    for (const text of hostile(n)) {
      expect(elapsed(() => extractEmailsFromText(text))).toBeLessThan(50);
      expect(elapsed(() => sanitizePublicText(text, {}))).toBeLessThan(50);
    }
  });

  it("still redacts an email after a long hostile prefix (no length cap)", () => {
    const text = "a".repeat(200_000) + " leak@example.com";
    expect(extractEmailsFromText(text)).toEqual(["leak@example.com"]);
    expect(sanitizePublicText(text, {}).endsWith(" Buyer")).toBe(true);
  });
});
