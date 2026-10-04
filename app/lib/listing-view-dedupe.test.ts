import { describe, expect, it } from "vitest";
import { hasCountedListingView, markListingViewCounted } from "./listing-view-dedupe";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("listing view dedupe", () => {
  it("counts first view, skips repeat in same session", () => {
    const s = mem();
    expect(hasCountedListingView("L1", s)).toBe(false);
    markListingViewCounted("L1", s);
    expect(hasCountedListingView("L1", s)).toBe(true);
    expect(hasCountedListingView("L2", s)).toBe(false);
  });
  it("fails open when storage throws", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(hasCountedListingView("L1", bad)).toBe(false);
    expect(() => markListingViewCounted("L1", bad)).not.toThrow();
  });
  it("no storage means count", () => {
    expect(hasCountedListingView("L1", null)).toBe(false);
  });
});
