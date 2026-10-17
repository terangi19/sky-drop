import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { EMAIL_MAX_LENGTH, isValidEmailFormat } from "./email-format";
import { validateEmail } from "./api-validation";
import { isEmailLike } from "./public-display";

/** The old pattern, used only as a parity oracle on SHORT inputs (it is quadratic on long ones). */
const OLD_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HOSTILE = (n: number) => [
  "a@" + ".".repeat(n) + "@",
  "a@" + "a.".repeat(Math.floor(n / 2)) + "@",
  "a@" + ".".repeat(n),
  "x".repeat(n) + "@" + "y".repeat(n) + ".",
  "a@b" + ".".repeat(n) + " ",
];

function timeMs(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe("isValidEmailFormat", () => {
  it.each([
    "a@b.co",
    "sky.drop+test@example.co.nz",
    "first_last@sub.domain.io",
    "x@y.z",
  ])("accepts %j", (e) => {
    expect(isValidEmailFormat(e)).toBe(true);
  });

  it.each([
    "",
    "plain",
    "@b.co",
    "a@",
    "a@b",
    "a@.co",
    "a@b.",
    "a@@b.co",
    "a@b@c.co",
    "a b@c.co",
    "a@b .co",
    "a@b.co\n",
    "\ta@b.co",
  ])("rejects %j", (e) => {
    expect(isValidEmailFormat(e)).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const v of [null, undefined, 42, {}, ["a@b.co"]]) expect(isValidEmailFormat(v)).toBe(false);
  });

  it("caps at 254 chars (RFC 5321) before any check", () => {
    const local = "a".repeat(EMAIL_MAX_LENGTH - "@b.co".length);
    expect(isValidEmailFormat(`${local}@b.co`)).toBe(true);
    expect(isValidEmailFormat(`a${local}@b.co`)).toBe(false);
  });

  it("matches the old regex on every short input (fuzz parity)", () => {
    const alphabet = "a.@ \t\u00a0b-_+";
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 50_000; i++) {
      const n = 1 + Math.floor(rnd() * 12);
      let s = "";
      for (let j = 0; j < n; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(isValidEmailFormat(s), JSON.stringify(s)).toBe(OLD_RE.test(s));
    }
  });
});

describe("hostile input stays bounded (< 50 ms)", () => {
  for (const n of [100_000, 1_000_000]) {
    it(`isValidEmailFormat / validateEmail / isEmailLike at ${n.toLocaleString()} chars`, () => {
      for (const s of HOSTILE(n)) {
        expect(timeMs(() => expect(isValidEmailFormat(s)).toBe(false))).toBeLessThan(50);
        expect(timeMs(() => expect(validateEmail(s).valid).toBe(false))).toBeLessThan(50);
        expect(timeMs(() => expect(isEmailLike(s)).toBe(false))).toBeLessThan(50);
      }
    });
  }
});

describe("source guard: no uncapped email regex on server paths", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const RAW = "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/";

  it.each([
    "app/api/create-notification/route.ts",
    "app/api/send-email/route.ts",
    "app/api/send-notification-email/route.ts",
    "app/lib/api-validation.ts",
  ])("%s uses isValidEmailFormat, not the raw regex", (p) => {
    const src = read(p);
    expect(src).not.toContain(RAW);
    expect(src).toMatch(/isValidEmailFormat\(/);
  });

  it("public-display isEmailLike caps at 254 before its regex", () => {
    const src = read("app/lib/public-display.ts");
    const fn = src.slice(src.indexOf("export function isEmailLike"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body.indexOf("> 254")).toBeGreaterThan(-1);
    expect(body.indexOf("> 254")).toBeLessThan(body.indexOf(".test("));
  });

  it("public-profiles keeps its length filter ahead of EMAIL_RE", () => {
    expect(read("app/api/public-profiles/route.ts")).toMatch(/e\.length < 254 && EMAIL_RE\.test\(e\)/);
  });

  it("send-email checks admin before parsing or validating the body", () => {
    const src = read("app/api/send-email/route.ts");
    expect(src.indexOf("isAdminEmail(decoded.email)")).toBeLessThan(src.indexOf("await req.json()"));
  });
});
