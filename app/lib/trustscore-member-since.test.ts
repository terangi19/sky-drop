import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateTrustScore } from "./trustscore";

const DAY = 86_400_000;
const base = { emailVerified: false, hasProfile: true, hasBio: false, hasPhoto: false, reportsCount: 0, salesCount: 0 };
const score = (memberSince: unknown) => calculateTrustScore({ ...base, memberSince: memberSince as never }).score;

describe("calculateTrustScore memberSince shapes (messages 'Failed to fetch seller profile: TypeError … toMillis')", () => {
  const old = Date.now() - 200 * DAY; // > 90 days → +15
  const recent = Date.now() - 5 * DAY; // no bonus

  it("ISO string no longer throws and counts account age", () => {
    expect(() => score("2026-05-30T12:06:41.784Z")).not.toThrow();
    expect(score(new Date(old).toISOString())).toBe(65);
    expect(score(new Date(recent).toISOString())).toBe(50);
  });

  it("Firestore Timestamp, {seconds}, Admin JSON {_seconds}, Date and epoch ms all agree", () => {
    const shapes = [
      { toMillis: () => old, toDate: () => new Date(old) },
      { seconds: Math.floor(old / 1000), nanoseconds: 0 },
      { _seconds: Math.floor(old / 1000), _nanoseconds: 0 },
      new Date(old),
      old,
    ];
    for (const s of shapes) expect(score(s)).toBe(65);
  });

  it("missing or unparseable values give no account-age bonus (old code treated unknown objects as epoch 0 → +15)", () => {
    for (const s of [null, undefined, "", "not a date", {}, { foo: 1 }]) {
      expect(() => score(s)).not.toThrow();
      expect(score(s)).toBe(50);
    }
  });

  it("no `in` operator on memberSince remains", () => {
    const src = readFileSync(join(process.cwd(), "app/lib/trustscore.ts"), "utf8");
    expect(src).not.toMatch(/" in params\.memberSince/);
  });
});
