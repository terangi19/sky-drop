import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function readSrc(path: string): string {
  return readFileSync(path, "utf8");
}

describe("P0 Firestore listener cost guards", () => {
  it("Navbar does not hold messages/notifications/blocked onSnapshot listeners", () => {
    const src = readSrc("app/components/Navbar.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toContain("/api/unread-counts");
    expect(src).toMatch(/getDocs/);
  });

  it("useListings fetches with getDocs and keeps existing limits", () => {
    const src = readSrc("app/useListings.ts");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/GLOBAL_LISTINGS_LIMIT/);
    expect(src).toMatch(/limit\(sellerEmail \? 100 : GLOBAL_LISTINGS_LIMIT\)/);
    expect(src).toMatch(/startVisibilityPolledFetch/);
  });

  it("post/listing browse uses getDocs instead of realtime listings snapshots", () => {
    const src = readSrc("app/post/listing/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/limit\(50\)/);
  });

  it("messages page still uses realtime listeners", () => {
    const src = readSrc("app/messages/page.tsx");
    expect(src).toMatch(/\bonSnapshot\b/);
  });

  it("browse category pages poll listings instead of live snapshots", () => {
    for (const path of [
      "app/components/BrowseCategoryPage.tsx",
      "app/rentals/page.tsx",
      "app/services/page.tsx",
      "app/jobs/page.tsx",
      "app/events/page.tsx",
      "app/opportunities/page.tsx",
      "app/wanted/page.tsx",
    ]) {
      const src = readSrc(path);
      expect(src, path).not.toMatch(/\bonSnapshot\s*\(/);
      expect(src, path).toMatch(/getDocs/);
      expect(src, path).toMatch(/startVisibilityPolledFetch/);
      expect(src, path).toMatch(/dedupeAsync/);
      expect(src, path).toMatch(/limit\(/);
    }
  });

  it("watchlist, seller list-list, and WantedLiveFeed do not hold collection snapshots", () => {
    for (const path of [
      "app/watchlist/page.tsx",
      "app/list-list/page.tsx",
      "app/components/WantedLiveFeed.tsx",
    ]) {
      const src = readSrc(path);
      expect(src, path).not.toMatch(/\bonSnapshot\s*\(/);
      expect(src, path).toMatch(/getDocs/);
      expect(src, path).toMatch(/limit\(/);
    }
  });

  it("trade-feed posts poll; shout chat stays realtime", () => {
    const src = readSrc("app/trade-feed/page.tsx");
    expect(src).toMatch(/getDocs\(q\)/);
    expect(src).toMatch(/startVisibilityPolledFetch/);
    expect(src).toMatch(/tradeShouts/);
    expect(src).toMatch(/\bonSnapshot\s*\(/);
  });

  it("listing detail polls listing/purchases/Q&A and records views via API", () => {
    const src = readSrc("app/post/listing/[id]/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).not.toMatch(/updateDoc\([^)]*views/);
    expect(src).toContain("/api/listing-view");
    expect(src).toMatch(/startVisibilityPolledFetch/);
    expect(src).toMatch(/LISTING_QNA_LIMIT/);
    expect(src).toMatch(/LISTING_ORDERS_LIMIT/);
    expect(src).toMatch(/SELLER_OTHER_LISTINGS_FETCH_LIMIT/);
    expect(src).toMatch(/listingQuestions/);
  });

  it("seller dashboard, purchases, sales, and disputes poll instead of live snapshots", () => {
    for (const path of [
      "app/dashboard/page.tsx",
      "app/dashboard/applications/page.tsx",
      "app/purchases/page.tsx",
      "app/sales/page.tsx",
      "app/disputes/page.tsx",
    ]) {
      const src = readSrc(path);
      expect(src, path).not.toMatch(/\bonSnapshot\s*\(/);
      expect(src, path).toMatch(/getDocs/);
      expect(src, path).toMatch(/startVisibilityPolledFetch/);
      expect(src, path).toMatch(/limit\(/);
    }
  });

  it("admin disputes and verification poll instead of live snapshots", () => {
    for (const path of [
      "app/admin/disputes/page.tsx",
      "app/admin/verification/page.tsx",
    ]) {
      const src = readSrc(path);
      expect(src, path).not.toMatch(/\bonSnapshot\s*\(/);
      expect(src, path).toMatch(/getDocs/);
      expect(src, path).toMatch(/startVisibilityPolledFetch/);
      expect(src, path).toMatch(/limit\(/);
    }
  });

  it("funnelEvents client writes are gated behind the beta-off flag", () => {
    const src = readSrc("app/lib/funnel-events.ts");
    expect(src).toContain("isFunnelEventsEnabled");
    expect(src).toMatch(/if\s*\(\s*!isFunnelEventsEnabled\(\)\s*\)\s*return/);
    expect(src).toContain('collection(db, "funnelEvents")');
    const flags = readSrc("app/lib/funnel-events-flags.ts");
    expect(flags).toContain("NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED");
    const nextConfig = readSrc("next.config.ts");
    expect(nextConfig).toContain("NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED");
    expect(nextConfig).toContain("FUNNEL_EVENTS_ENABLED");
  });

  it("onListingUpdated skips view-only writes", () => {
    const src = readSrc("functions/src/index.ts");
    expect(src).toContain("isViewsOnlyListingUpdate");
    expect(src).toMatch(/if \(isViewsOnlyListingUpdate\(before, after\)\) return;/);
  });
});
