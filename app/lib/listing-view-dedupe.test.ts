import { readFileSync } from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasCountedListingView, markListingViewCounted, scheduleListingView } from "./listing-view-dedupe";

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

function memFull() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("scheduleListingView", () => {
  afterEach(() => vi.useRealTimers());

  it("sends exactly once after the delay and marks the session", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = memFull();
    scheduleListingView("L1", send, 3000, s);
    vi.advanceTimersByTime(2999);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("L1");
    expect(hasCountedListingView("L1", s)).toBe(true);
  });

  it("does not send again in the same tab session (reload / remount)", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = memFull();
    scheduleListingView("L1", send, 3000, s);
    vi.advanceTimersByTime(3000);
    scheduleListingView("L1", send, 3000, s);
    vi.advanceTimersByTime(3000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("cancel (unmount before the delay) sends nothing and does not mark", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = memFull();
    const cancel = scheduleListingView("L1", send, 3000, s);
    vi.advanceTimersByTime(1000);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(send).not.toHaveBeenCalled();
    expect(hasCountedListingView("L1", s)).toBe(false);
  });

  it("empty id schedules nothing; storage failures fail open (still sends)", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    scheduleListingView("", send, 3000, memFull());
    vi.advanceTimersByTime(5000);
    expect(send).not.toHaveBeenCalled();
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    scheduleListingView("L2", send, 3000, bad);
    vi.advanceTimersByTime(3000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("listing detail view effect wiring", () => {
  const src = readFileSync("app/post/listing/[id]/page.tsx", "utf8");

  it("schedules the view POST in an effect keyed on [listingId] only (no user/listing deps, no verified gate)", () => {
    const m = src.match(/scheduleListingView\(listingId,[\s\S]*?\n\s*\[(.*?)\]\n\s*\);/);
    expect(m, "scheduleListingView effect not found").not.toBeNull();
    expect(m![1].trim()).toBe("listingId");
    expect(m![0]).toContain("/api/listing-view");
    expect(m![0]).not.toMatch(/emailVerified|user\b|getIdToken|Authorization/);
  });

  it("the old combined effect no longer posts the view", () => {
    expect(src.match(/fetch\("\/api\/listing-view"/g)?.length).toBe(1);
  });
});
