import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  canPersistWatchlistToAccount,
  guestWatchlistLoginHref,
  unauthenticatedWatchlistClickResult,
  watchlistAccountUid,
  watchlistHeartIsSaved,
} from "./watchlist-account-gate";

describe("guest watchlist must not false-succeed", () => {
  it("treats missing auth as no account uid", () => {
    expect(watchlistAccountUid(null)).toBeNull();
    expect(watchlistAccountUid(undefined)).toBeNull();
    expect(watchlistAccountUid({})).toBeNull();
    expect(canPersistWatchlistToAccount(null)).toBe(false);
  });

  it("prefers the signed-in uid, including auth.currentUser fallback", () => {
    expect(watchlistAccountUid({ uid: "react-user" }, { uid: "firebase-user" })).toBe(
      "react-user"
    );
    expect(watchlistAccountUid(null, { uid: "firebase-user" })).toBe("firebase-user");
    expect(canPersistWatchlistToAccount("firebase-user")).toBe(true);
  });

  it("never reports success, persist, or a filled heart for a guest click", () => {
    const result = unauthenticatedWatchlistClickResult();
    expect(result.allow).toBe(false);
    expect(result.persistToAccount).toBe(false);
    expect(result.showSuccessToast).toBe(false);
    expect(result.fillHeart).toBe(false);
    expect(result.redirectToLogin).toBe(true);
  });

  it("does not fill the heart from leftover localStorage while logged out", () => {
    expect(watchlistHeartIsSaved(null, "listing-1", ["listing-1"])).toBe(false);
    expect(watchlistHeartIsSaved("", "listing-1", ["listing-1"])).toBe(false);
    expect(watchlistHeartIsSaved("uid-1", "listing-1", ["listing-1"])).toBe(true);
    expect(watchlistHeartIsSaved("uid-1", "listing-1", ["other"])).toBe(false);
  });

  it("sends guests to login with a sanitized return URL", () => {
    expect(guestWatchlistLoginHref("/")).toBe("/login?redirect=%2F");
    expect(guestWatchlistLoginHref("/vehicles")).toBe("/login?redirect=%2Fvehicles");
    expect(guestWatchlistLoginHref("/post/listing/abc")).toBe(
      "/login?redirect=%2Fpost%2Flisting%2Fabc"
    );
    expect(guestWatchlistLoginHref("https://evil.example")).toBe("/login");
  });
});

const WATCHLIST_GATE_FILES = [
  "app/components/listing-card/MarketplaceListingCard.tsx",
  "app/page.tsx",
  "app/components/BrowseCategoryPage.tsx",
  "app/rentals/page.tsx",
  "app/services/page.tsx",
  "app/wanted/page.tsx",
  "app/opportunities/page.tsx",
  "app/post/listing/[id]/page.tsx",
  "app/search/page.tsx",
  "app/trade-feed/page.tsx",
  "app/profile/ProfileAccountClient.tsx",
];

describe("watchlist UI gates guests before success toasts", () => {
  it.each(WATCHLIST_GATE_FILES)("%s requires an account before mutating watchlist", (file) => {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).toContain("requireWatchlistAccount");
  });

  it("listing card does not render a saved heart without an account uid", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/components/listing-card/MarketplaceListingCard.tsx"),
      "utf8"
    );
    expect(src).toContain("watchlistHeartIsSaved");
    expect(src).toContain("requireWatchlistAccount");
  });

  it("homepage heart toggle returns before Added to watchlist when gated", () => {
    const src = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    const toggle = src.slice(src.indexOf("async function toggleWatchlist"));
    const gateAt = toggle.indexOf("requireWatchlistAccount");
    const toastAt = toggle.indexOf('showToast("Added to watchlist!")');
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(toastAt).toBeGreaterThan(gateAt);
    expect(toggle.slice(0, toastAt)).toMatch(/if\s*\(\s*!uid\s*\)\s*return/);
  });
});
