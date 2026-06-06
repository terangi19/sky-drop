import { describe, it, expect } from "vitest";
import { getLevelInfo } from "../xp";

describe("getLevelInfo", () => {
  it("returns level 1 for 0 XP", () => {
    const info = getLevelInfo(0);
    expect(info.level).toBe(1);
    expect(info.progress).toBe(0);
    expect(info.xpToNext).toBe(150);
  });

  it("returns level 1 with progress for partial XP", () => {
    const info = getLevelInfo(75);
    expect(info.level).toBe(1);
    expect(info.progress).toBe(75);
  });

  it("returns level 2 at exactly 150 XP", () => {
    const info = getLevelInfo(150);
    expect(info.level).toBe(2);
    expect(info.progress).toBe(0);
  });

  it("returns level 2 with progress at 200 XP", () => {
    const info = getLevelInfo(200);
    expect(info.level).toBe(2);
    expect(info.progress).toBe(50);
  });

  it("returns level 11 at 1500 XP", () => {
    const info = getLevelInfo(1500);
    expect(info.level).toBe(11);
    expect(info.progress).toBe(0);
  });

  it("always returns xpToNext as 150", () => {
    expect(getLevelInfo(0).xpToNext).toBe(150);
    expect(getLevelInfo(500).xpToNext).toBe(150);
    expect(getLevelInfo(10000).xpToNext).toBe(150);
  });
});
