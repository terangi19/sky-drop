import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { BLOCKED_USERS_LIMIT, DROP_TOKENS_LIMIT } from "../app/lib/firestore-query-limits";

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

  it("ProfileContext polls the profile doc instead of a live snapshot", () => {
    const src = readSrc("app/contexts/ProfileContext.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDoc/);
    expect(src).toMatch(/startVisibilityPolledFetch/);
    expect(src).toMatch(/BROWSE_POLL_MS/);
  });

  it("notifications page polls instead of a live snapshot", () => {
    const src = readSrc("app/notifications/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/startVisibilityPolledFetch/);
    expect(src).toMatch(/NOTIFICATIONS_PAGE_SIZE/);
    expect(src).toMatch(/NOTIFICATIONS_MAX_LIMIT/);
    expect(src).toMatch(/DASHBOARD_POLL_MS/);
    expect(src).toMatch(/limit\(NOTIFICATIONS_PAGE_SIZE\)/);
  });

  it("blocked page uses a capped one-shot getDocs and refetches after mutations (no polling)", () => {
    const src = readSrc("app/blocked/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/limit\(BLOCKED_USERS_LIMIT\)/);
    expect(src).not.toMatch(/startVisibilityPolledFetch/);
    expect(src).not.toMatch(/setInterval/);
    // block / unblock / unblock-all refetch explicitly (a failed delete reappears)
    expect(src.match(/await refreshBlockedUsers\(\)/g)?.length).toBe(3);
    expect(BLOCKED_USERS_LIMIT).toBe(100);
  });

  it("LootCrateModal polls capped dropTokens; config/platform is a one-shot getDoc", () => {
    const src = readSrc("app/components/LootCrateModal.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/getDoc\(doc\(db, "config", "platform"\)\)/);
    expect(src).toMatch(/limit\(DROP_TOKENS_LIMIT\)/);
    expect(src).toMatch(/startVisibilityPolledFetch\(loadTokens, BROWSE_POLL_MS\)/);
    expect(src).not.toMatch(/startVisibilityPolledFetch\(loadPlatform/);
    // spend / legendary claim update local state immediately
    expect(src).toMatch(/setTokenCount\(\(count\) => Math\.max\(0, count - 1\)\)/);
    expect(src).toMatch(/setBadgesAwarded\(newCount\)/);
    expect(DROP_TOKENS_LIMIT).toBe(100);
  });

  it("seller page checks follow state with a one-shot getDoc (no listener, no interval)", () => {
    const src = readSrc("app/seller/[username]/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\b/);
    expect(src).toMatch(/getDoc\(doc\(db, "followers"/);
    expect(src).toMatch(/let cancelled = false/);
    expect(src).not.toMatch(/startVisibilityPolledFetch/);
    // follow/unfollow state still comes from the API response
    expect(src).toMatch(/setFollowing\(Boolean\(data\.following\)\)/);
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
