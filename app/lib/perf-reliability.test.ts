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
    expect(file).toContain("startVisibilityPolledFetch");
    expect(file).toContain("dedupeAsync");
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

  it("does not block Āwhina SSE/JSON on Firestore conversation persist", () => {
    const file = src("app/api/sky-ai/route.ts");
    expect(file).toContain('import { NextRequest, NextResponse, after } from "next/server"');
    expect(file).toContain("after(run)");
    expect(file).not.toMatch(/await safePersist\(/);
    expect(file).toContain("function safePersist(fn: () => Promise<void>): void");
  });

  it("does not insert fixed SSE sleeps after the Āwhina reply is computed", () => {
    const file = src("app/api/sky-ai/route.ts");
    expect(file).toContain('sseLine({ type: "progress", state })');
    expect(file).toContain('sseLine({ type: "delta", text: part })');
    expect(file).not.toMatch(/setTimeout\(\s*r\s*,\s*40\s*\)/);
    expect(file).not.toMatch(/setTimeout\(\s*r\s*,\s*12\s*\)/);
    expect(file).not.toMatch(/sleep\(\s*40\s*\)/);
    expect(file).not.toMatch(/sleep\(\s*12\s*\)/);
  });

  it("dynamically imports unused Āwhina branch arms on /api/sky-ai", () => {
    const file = src("app/api/sky-ai/route.ts");
    expect(file).not.toMatch(
      /import \{[^}]*runVisionListing[^}]*\} from ["']\.\.\/\.\.\/lib\/awhina-vision-listing["']/
    );
    expect(file).not.toMatch(
      /import \{[^}]*runVisionCapability[^}]*\} from ["']\.\.\/\.\.\/lib\/awhina-vision-capability["']/
    );
    expect(file).not.toMatch(
      /import \{[^}]*runFreeformCapability[^}]*\} from ["']\.\.\/\.\.\/lib\/awhina-freeform-capability["']/
    );
    expect(file).not.toMatch(
      /import \{[^}]*fetchListingFactsForCompare[^}]*\} from ["']\.\.\/\.\.\/lib\/awhina-listing-compare\.server["']/
    );
    expect(file).toContain('import("../../lib/awhina-vision-listing")');
    expect(file).toContain('import("../../lib/awhina-vision-capability")');
    expect(file).toContain('import("../../lib/awhina-freeform-capability")');
    expect(file).toMatch(
      /import\(\s*["']\.\.\/\.\.\/lib\/awhina-listing-compare\.server["']\s*\)/
    );
    expect(file).toMatch(
      /import\(\s*["']\.\.\/\.\.\/lib\/awhina-listing-composer\.server["']\s*\)/
    );
  });

  it("dedupes Āwhina status probes on chat mount", () => {
    const panel = src("app/components/SkyAiChatPanel.tsx");
    expect(panel).toContain("fetchSkyAiStatus");
    expect(panel).not.toMatch(/fetch\(["']\/api\/sky-ai\/status["']/);
    const client = src("app/lib/sky-ai-status-client.ts");
    expect(client).toContain('fetchImpl("/api/sky-ai/status")');
    expect(client).toContain("SKY_AI_STATUS_TTL_MS");
    expect(client).toContain("if (inflight) return inflight");
  });

  it("loads homepage listings without waiting on Firebase auth", () => {
    const file = src("app/page.tsx");
    expect(file).not.toMatch(/if \(!authReady\) return/);
    expect(file).toContain("startVisibilityPolledFetch");
    expect(file).toContain("HOME_SWR_TTL_MS");
    expect(file).toContain("dedupeAsync");
    expect(file).not.toMatch(/\bonSnapshot\s*\(/);
  });

  it("skips visibility refetch churn and shares browse SWR", () => {
    const file = src("app/lib/polled-firestore.ts");
    expect(file).toContain("VISIBILITY_REFETCH_MIN_MS");
    expect(file).toContain("fromVisibility");
    expect(file).toContain("dedupeAsync");
    expect(src("app/components/BrowseCategoryPage.tsx")).toContain("dedupeAsync");
  });

  it("loads Āwhina conversation history with one parallel Firestore round-trip", () => {
    const file = src("app/lib/sky-ai-firestore.ts");
    const start = file.indexOf("export async function loadSkyAiMessages");
    const next = file.indexOf("export async function", start + 1);
    const fn = file.slice(start, next === -1 ? undefined : next);
    expect(fn).toContain("Promise.all");
    expect(fn).toContain("convRef.get()");
    expect(fn).not.toContain("assertConversationOwner");
    expect(fn).toContain("if (!convSnap.exists || convSnap.data()?.uid !== uid)");
  });

  it("overlaps seller review and public-profile fetches on listing cards", () => {
    const file = src("app/lib/useSellerListingMeta.ts");
    expect(file).toContain("const profilesPromise = fetchSellerProfilesByListing(snapshot)");
    expect(file).toContain("await profilesPromise");
  });

  it("allows a short CDN cache on the homepage shell only", () => {
    const file = src("next.config.ts");
    expect(file).toContain('source: "/"');
    expect(file).toContain(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
    );
    expect(file).toContain(
      'source: "/((?!api|_next/static|_next/image|favicon|manifest).+)"'
    );
    expect(file).toContain(
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    expect(file).not.toContain(
      'source: "/((?!api|_next/static|_next/image|favicon|manifest).*)"'
    );
  });

  it("does not CDN-cache auth or geo-blocked HTML (catch-all requires a path segment)", () => {
    // Mirrors next.config `source: "/((?!api|_next/static|_next/image|favicon|manifest).+)"`
    const noStoreDoc = /^\/(?!api|_next\/static|_next\/image|favicon|manifest).+$/;
    expect(noStoreDoc.test("/")).toBe(false);
    for (const path of [
      "/login",
      "/signup",
      "/profile",
      "/messages",
      "/list-list",
      "/purchases",
      "/about",
      "/privacy",
    ]) {
      expect(noStoreDoc.test(path), path).toBe(true);
    }
  });

  it("keeps Āwhina conversation create awaited so follow-ups share one id", () => {
    const route = src("app/api/sky-ai/route.ts");
    expect(route).toMatch(
      /conversationId = await createSkyAiConversation\(uid, email\)/
    );
    expect(route).toContain("await loadSkyAiMessages(conversationId, uid, 30)");
    const panel = src("app/components/SkyAiChatPanel.tsx");
    expect(panel).toContain("history: user ? undefined : history");
    expect(panel).toContain(
      "conversationId: user ? conversationId || undefined : undefined"
    );
  });
});
