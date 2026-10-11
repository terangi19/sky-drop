/**
 * Wave 6.x hygiene — tests must COMPUTE production output, never fake it (must PASS).
 *
 * Reads the source of every Wave 6.x adversarial test file (plus the shared corpus module) and fails when a test:
 *   1. assigns a literal to a result-shaped variable (`const blob = "price:23"`, `const r = { facts: [...] }`,
 *      `const result = {` …) instead of deriving it from a production call;
 *   2. builds an object literal shaped like production output (`{ facts: [...] }`, `{ primary: … }`,
 *      `{ isCorrection: … }`, `{ listingFill: … }`, `{ handled: … }`) outside the corpus fixtures;
 *   3. calls `expect(<literal>)` (string / template-without-interpolation / number / null / undefined);
 *   4. mocks production (`vi.mock`, `mockReturnValue`, `mockImplementation`, `mockResolvedValue`);
 *   5. force-fails with `expect(false|true, …)` — a hard-coded outcome. FORCE_FAIL_STUB_ALLOWLIST is EMPTY
 *      (strict, 2026-09-28): the 6.1/6.2/6.3 index stubs were replaced by plain `it` index checks against the
 *      shared corpus module, so ANY stub in ANY scanned file fails this test.
 *
 * Files: WAVE6_REQUIRED_FILES must all be present. WAVE6_OPTIONAL_FILES (the #28-only Wave 6.4 file) are
 * scanned only when present, so hygiene passes both on the main tests-only tree (no 6.4) and on the #28 tree.
 *
 * Corpus `input:` / `expect:` fixture data and regex constants are fixtures, not outputs: the patterns
 * below only look at result-shaped variable names, `expect(` call arguments, and production-output keys.
 * Full-line comments are ignored.
 *
 * TESTS ONLY. No production edits. NOT SAFE. #28 HOLD.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/** Shared corpus fixture module — a NON-test file (must not match the vitest *.test.ts include glob). */
export const WAVE6_CORPUS_MODULE = "awhina-adversarial-wave-6-corpus.ts";

/** Always scanned; each must exist (main tests-only PR set). */
export const WAVE6_REQUIRED_FILES = [
  WAVE6_CORPUS_MODULE,
  "awhina-adversarial-wave-6.test.ts",
  "awhina-adversarial-wave-6.1-class5.test.ts",
  "awhina-adversarial-wave-6.2-class7.test.ts",
  "awhina-adversarial-wave-6.3-class5.test.ts",
] as const;

/** Scanned only when present: the Wave 6.4 file is #28-only (not in the main tests-only PR). */
export const WAVE6_OPTIONAL_FILES = ["awhina-adversarial-wave-6.4-rechange-harvest.test.ts"] as const;

/** Strict: zero force-fail stubs allowed in any scanned file (2026-09-28). */
export const FORCE_FAIL_STUB_ALLOWLIST: Readonly<Record<string, number>> = {};

const RESULT_VAR =
  "(?:blob|factsBlob|r|res|result|results|out|output|actual|interp|interpretation|semantic|facts|fill|listingFill|canonicalResult|parsed|price)";

/** Violations (non-allowlistable). Each rule is matched per source line. */
const RULES: ReadonlyArray<{ name: string; re: RegExp }> = [
  {
    name: "literal assigned to result-shaped variable",
    re: new RegExp(
      String.raw`\b(?:const|let|var)\s+${RESULT_VAR}\s*(?::[^=]+)?=\s*(?:["']|` +
        "`(?![^`]*\\$\\{)" +
        String.raw`|\{|\[|-?\d|true\b|false\b|null\b)`
    ),
  },
  {
    name: "result variable re-assigned a literal",
    re: new RegExp(
      String.raw`^\s*${RESULT_VAR}\s*=\s*(?:["']|` + "`(?![^`]*\\$\\{)" + String.raw`|\{|\[|-?\d|true\b|false\b|null\b)`
    ),
  },
  {
    name: "object literal shaped like production output",
    re: /(?:=|\(|,|return)\s*\{\s*(?:facts\s*:\s*\[|primary\s*:|isCorrection\s*:|listingFill\s*:|handled\s*:|correctedKeys\s*:)/,
  },
  {
    name: "expect(<literal>)",
    re: new RegExp(
      String.raw`\bexpect\(\s*(?:["']|` + "`(?![^`]*\\$\\{)" + String.raw`|-?\d|null\b|undefined\b|\[\s*\]|\{\s*\})`
    ),
  },
  { name: "production mocked", re: /\bvi\.(?:mock|doMock|spyOn)\(|\.mock(?:ReturnValue|Implementation|ResolvedValue)\w*\(/ },
];

const FORCE_FAIL_RE = /\bexpect\(\s*(?:false|true)\s*[,)]/;

function codeLines(src: string): Array<{ n: number; text: string }> {
  const out: Array<{ n: number; text: string }> = [];
  let inBlock = false;
  src.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      return;
    }
    if (t.startsWith("//") || t.startsWith("*")) return;
    out.push({ n: i + 1, text: line });
  });
  return out;
}

export function scanWave6Source(file: string, src: string) {
  const violations: string[] = [];
  const stubs: string[] = [];
  for (const { n, text } of codeLines(src)) {
    for (const rule of RULES) {
      if (rule.re.test(text)) violations.push(`${file}:${n} [${rule.name}] ${text.trim()}`);
    }
    if (FORCE_FAIL_RE.test(text)) stubs.push(`${file}:${n} ${text.trim()}`);
  }
  return { violations, stubs };
}

function siblingPath(name: string): string {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

function readSibling(name: string): string {
  const p = siblingPath(name);
  if (!existsSync(p)) throw new Error(`Wave 6.x hygiene: missing ${name} next to the hygiene test`);
  return readFileSync(p, "utf8");
}

/** Required files always; optional (#28-only) files only when present on this tree. */
export const WAVE6_SCANNED_FILES: readonly string[] = [
  ...WAVE6_REQUIRED_FILES,
  ...WAVE6_OPTIONAL_FILES.filter((f) => existsSync(siblingPath(f))),
];

describe("Wave 6.x hygiene — no hard-coded production output (must PASS)", () => {
  const scans = WAVE6_SCANNED_FILES.map((f) => ({ file: f, ...scanWave6Source(f, readSibling(f)) }));

  it("every required Wave 6.x file (incl. the shared corpus module) is present and non-trivial", () => {
    for (const f of WAVE6_REQUIRED_FILES) expect(existsSync(siblingPath(f)), `missing ${f}`).toBe(true);
    for (const s of scans) expect(readSibling(s.file).length, s.file).toBeGreaterThan(500);
  });

  it("shared corpus module is build-safe: not a *.test.* file, no vitest import", () => {
    expect(WAVE6_CORPUS_MODULE).not.toMatch(/\.(?:test|spec)\.[cm]?[jt]sx?$/);
    const src = readSibling(WAVE6_CORPUS_MODULE);
    expect(src).not.toMatch(/from\s+["']vitest["']|require\(\s*["']vitest["']\s*\)/);
  });

  it("no test fakes a result blob/object, calls expect(<literal>), or mocks production", () => {
    const all = scans.flatMap((s) => s.violations);
    expect(all, `hard-coded output found:\n${all.join("\n")}`).toEqual([]);
  });

  it("zero force-fail stubs in any scanned file (strict; allowlist is empty)", () => {
    expect(FORCE_FAIL_STUB_ALLOWLIST).toEqual({});
    const actual: Record<string, number> = {};
    for (const s of scans) if (s.stubs.length) actual[s.file] = s.stubs.length;
    const detail = scans.flatMap((s) => s.stubs).join("\n");
    expect(actual, `force-fail stubs are not allowed (replace with a real assertion or index check):\n${detail}`).toEqual(
      FORCE_FAIL_STUB_ALLOWLIST
    );
  });

  it("detectors fire on planted fakes (self-test)", () => {
    const planted = [
      'const blob = "price:23"; // simulated current break',
      "const r = { facts: [{ key: \"price\", value: \"23\" }], primary: \"CORRECTION\" };",
      "const result = {",
      'expect("price:23").not.toMatch(/price:23/);',
      "vi.mock(\"./awhina-semantic-intent\");",
    ].join("\n");
    const { violations, stubs } = scanWave6Source("planted.ts", `${planted}\nexpect(false, "x").toBe(true);\n`);
    expect(violations.length).toBeGreaterThanOrEqual(5);
    expect(stubs).toHaveLength(1);
    // Fixture/derived shapes must NOT trip it.
    const legit = [
      "const blob = (r.facts || []).map((f) => `${f.key}:${f.value}`).join(\" | \");",
      "const r = interpretSemanticTurn({ message: \"nah\", pendingSlot: \"price\" });",
      "    expect: { listingType: \"physical\", price: \"550\" },",
      "const INSTRUCTION_LEAK_RE = /\\bdont put\\b/i;",
      "expect(`${fill.location || \"\"} ${desc}`, ctx).toMatch(e.locationMatch);",
      "let fill = (last.listingFill || {}) as SkyAiListingFill;",
    ].join("\n");
    expect(scanWave6Source("legit.ts", legit)).toEqual({ violations: [], stubs: [] });
  });
});
