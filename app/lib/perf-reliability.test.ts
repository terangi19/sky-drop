import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  BROWSE_LISTINGS_LIMIT,
  SEARCH_LISTINGS_LIMIT,
  SELLER_LISTINGS_LIMIT,
} from "./firestore-query-limits";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("performance reliability locks", () => {
  it("does not force-refresh Firebase ID tokens on every API call", () => {
    const file = src("app/lib/api-auth.ts");
    expect(file).toContain("user.getIdToken(forceRefresh)");
    expect(file).toContain("fetchWithIdToken");
    expect(file).not.toMatch(/getIdToken\(true\)/);
  });

  it("keeps OpenAI SDK off the Awhina chat client import graph", () => {
    const panel = src("app/components/SkyAiChatPanel.tsx");
    expect(panel).toContain('from "../lib/sky-ai-rule-fallback"');
    expect(panel).not.toContain('from "../lib/openai-health"');
    const fallback = src("app/lib/sky-ai-rule-fallback.ts");
    expect(fallback).not.toMatch(/from ["']openai["']/);
    const nextConfig = src("next.config.ts");
    expect(nextConfig).toContain("openai-browser-stub");
    const writer = src("app/lib/awhina-description-writer.ts");
    expect(writer).not.toMatch(/from ["']openai["']/);
    expect(writer).not.toMatch(/import\(["']openai["']\)/);
    expect(src("app/lib/awhina-description-writer.server.ts")).toContain("server-only");
  });

  it("loads unread inbox and activity counts concurrently", () => {
    const file = src("app/api/unread-counts/route.ts");
    expect(file).toContain("Promise.all");
    expect(file).toContain("blockedSnap");
    expect(file).toContain("inboxCountSnap");
    expect(file).toContain("activitySnap");
  });

  it("batches public-profile email chunks instead of awaiting them in a loop", () => {
    const file = src("app/api/public-profiles/route.ts");
    expect(file).toContain("Promise.all");
    expect(file).not.toMatch(/for \(let i = 0; i < emails\.length[\s\S]*await db/);
  });

  it("does not N+1 watchlist listing reads in radar-matches", () => {
    const file = src("app/api/radar-matches/route.ts");
    expect(file).toContain("db.getAll");
    expect(file).not.toMatch(/for \(const listingId of watchlist[\s\S]*\.get\(\)/);
  });

  it("does not block listing publish on matchmaking", () => {
    const file = src("app/api/create-listing/route.ts");
    expect(file).toContain("after(() =>");
    expect(file).toContain("runCreateListingSideEffects");
    const handler = file.slice(file.indexOf("export async function POST"));
    expect(handler).not.toMatch(/await runMatchmaking\(/);
  });

  it("polls search listings instead of a 400-doc realtime listener", () => {
    const file = src("app/useListings.ts");
    expect(file).toContain("getDocs");
    expect(file).not.toContain("onSnapshot");
    expect(file).toContain("SEARCH_LISTINGS_LIMIT");
  });

  it("polls navbar badges instead of dual realtime listeners", () => {
    const file = src("app/components/Navbar.tsx");
    expect(file).toContain("/api/unread-counts");
    expect(file).toContain("UNREAD_COUNTS_POLL_MS");
    expect(file).not.toMatch(/\bonSnapshot\s*\(/);
  });

  it("caps previously unbounded marketplace queries", () => {
    expect(src("app/services/page.tsx")).toContain("limit(BROWSE_LISTINGS_LIMIT)");
    expect(src("app/rentals/page.tsx")).toContain("limit(BROWSE_LISTINGS_LIMIT)");
    expect(src("app/events/page.tsx")).toContain("limit(BROWSE_LISTINGS_LIMIT)");
    expect(src("app/jobs/page.tsx")).toContain("limit(BROWSE_LISTINGS_LIMIT)");
    expect(src("app/opportunities/page.tsx")).toContain("limit(BROWSE_LISTINGS_LIMIT)");
    expect(src("app/list-list/page.tsx")).toContain("limit(SELLER_LISTINGS_LIMIT)");
    expect(src("app/seller/[username]/page.tsx")).toMatch(/limit\(100\)/);
    expect(BROWSE_LISTINGS_LIMIT).toBeLessThanOrEqual(120);
    expect(SELLER_LISTINGS_LIMIT).toBeLessThanOrEqual(100);
    expect(SEARCH_LISTINGS_LIMIT).toBeLessThanOrEqual(400);
  });

  it("compresses listing photos concurrently", () => {
    const file = src("app/lib/sky-ai-images.ts");
    expect(file).toContain("Promise.all");
    expect(file).toContain("compressImageFile");
  });

  it("skips vision description writer on cache hits when identity is unchanged", () => {
    const file = src("app/lib/awhina-vision-listing.ts");
    expect(file).toContain("reuseCachedVisionListingFill");
    expect(file).toContain("skippedDescriptionWriter");
  });

  it("resolves send-message identity lookups concurrently", () => {
    const file = src("app/api/send-message/route.ts");
    expect(file).toContain("Promise.all");
    expect(file).toMatch(/unameSnap[\s\S]*listingSnap[\s\S]*userRec/);
  });
});
