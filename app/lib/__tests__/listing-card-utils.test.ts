import { describe, it, expect } from "vitest";
import { timeAgo } from "../listing-card-utils";

describe("timeAgo", () => {
  it('returns "Just now" for timestamps less than 60 seconds ago', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(timeAgo(now)).toBe("Just now");
    expect(timeAgo(now - 30)).toBe("Just now");
  });

  it("returns minutes ago for < 1 hour", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(timeAgo(now - 120)).toBe("2m ago");
    expect(timeAgo(now - 3599)).toBe("59m ago");
  });

  it("returns hours ago for < 1 day", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(timeAgo(now - 3600)).toBe("1h ago");
    expect(timeAgo(now - 7200)).toBe("2h ago");
    expect(timeAgo(now - 86399)).toBe("23h ago");
  });

  it("returns days ago for < 1 week", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(timeAgo(now - 86400)).toBe("1d ago");
    expect(timeAgo(now - 86400 * 3)).toBe("3d ago");
    expect(timeAgo(now - 604799)).toBe("6d ago");
  });

  it("returns weeks ago for >= 1 week", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(timeAgo(now - 604800)).toBe("1w ago");
    expect(timeAgo(now - 604800 * 4)).toBe("4w ago");
  });
});
