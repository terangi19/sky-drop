import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library): expired listings
 * must not offer the watchlist Save/Remove control (M4); Share stays.
 */
const src = readFileSync(
  path.join(process.cwd(), "app/post/listing/[id]/page.tsx"),
  "utf8"
);
const rowStart = src.indexOf("{/* 9. WATCHLIST & SHARE */}");
const row = src.slice(rowStart, src.indexOf("{listing.description && (", rowStart));

describe("expired listing hides Save to Watchlist (M4)", () => {
  it("finds the watchlist & share row", () => {
    expect(rowStart).toBeGreaterThan(0);
    expect(row.length).toBeGreaterThan(200);
  });

  it("defines isExpired from expiresAt", () => {
    expect(src).toContain(
      "const isExpired = Boolean(listing?.expiresAt?.toMillis?.() && listing.expiresAt.toMillis() < Date.now());"
    );
  });

  it("wraps the watchlist toggle button in !isExpired", () => {
    const gateAt = row.indexOf("{!isExpired && (");
    const toggleAt = row.indexOf("onClick={() => void toggleWatchlist()}");
    const shareAt = row.indexOf("navigator.share");
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(toggleAt).toBeGreaterThan(gateAt);
    // gate closes before the Share button starts
    const closeAt = row.indexOf("\n              )}\n", gateAt);
    expect(closeAt).toBeGreaterThan(toggleAt);
    expect(closeAt).toBeLessThan(shareAt);
    expect(row.slice(gateAt, closeAt)).toContain("Save to Watchlist");
  });

  it("does not gate Share on isExpired", () => {
    const shareAt = row.indexOf("navigator.share");
    expect(shareAt).toBeGreaterThan(0);
    expect(row.slice(row.indexOf("\n              )}\n"))).not.toContain("isExpired");
    expect(row).toContain("Share");
  });
});
