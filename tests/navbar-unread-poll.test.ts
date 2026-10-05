import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

/**
 * The Navbar unread badge calls /api/unread-counts (billed Firestore reads, server side).
 * Its refocus path must go through the shared startVisibilityPolledFetch helper so the
 * VISIBILITY_REFETCH_MIN_MS throttle (covered in app/lib/polled-firestore.test.ts) applies.
 */
describe("Navbar unread-counts polling", () => {
  const src = readFileSync("app/components/Navbar.tsx", "utf8");

  it("polls through startVisibilityPolledFetch (interval + throttled refocus)", () => {
    expect(src).toContain(
      'import { startVisibilityPolledFetch } from "../lib/polled-firestore";'
    );
    expect(src).toContain(
      "startVisibilityPolledFetch(fetchUnreadCounts, UNREAD_COUNTS_POLL_MS)"
    );
  });

  it("has no hand-rolled interval or unthrottled visibilitychange refetch for unread counts", () => {
    expect(src).not.toMatch(/setInterval\(\s*fetchUnreadCounts/);
    expect(src).not.toMatch(/addEventListener\(\s*["']visibilitychange["']/);
  });

  it("still hits /api/unread-counts and holds no snapshot listeners", () => {
    expect(src).toContain("/api/unread-counts");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
  });
});
