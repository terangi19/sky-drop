import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library): lock the listing
 * detail Save -> Saved -> Remove toggle (M2) on top of the #59 guest gate.
 */
const src = readFileSync(
  path.join(process.cwd(), "app/post/listing/[id]/page.tsx"),
  "utf8"
);
const toggle = src.slice(src.indexOf("async function toggleWatchlist"));
const toggleBody = toggle.slice(0, toggle.indexOf("const sellerStatsData"));

describe("listing detail watchlist CTA toggle (M2)", () => {
  it("no longer has an add-only saveToWatchlist handler", () => {
    expect(src).not.toContain("saveToWatchlist");
    expect(src).not.toContain("onClick={saveToWatchlist}");
  });

  it("imports deleteDoc and tracks savedToWatchlist state", () => {
    expect(src).toMatch(/import \{[^}]*\bdeleteDoc\b[^}]*\} from "firebase\/firestore"/);
    expect(src).toContain("const [savedToWatchlist, setSavedToWatchlist] = useState<boolean | null>(null)");
  });

  it("seeds saved state from the account watchlist doc, not localStorage", () => {
    const seedAt = src.indexOf("if (!listing?.id) {\n      setSavedToWatchlist(null);");
    expect(seedAt).toBeGreaterThan(0);
    const seed = src.slice(seedAt, src.indexOf("async function toggleWatchlist"));
    expect(seed).toContain('getDoc(doc(db, "users", uid, "watchlist", listing.id))');
    expect(seed).toContain("setSavedToWatchlist(snap.exists())");
    expect(seed).toContain("if (!uid) {");
    expect(seed).not.toContain("localStorage");
    expect(seed).toContain("cancelled");
  });

  it("keeps the #59 guest gate ahead of every mutation", () => {
    const gateAt = toggleBody.indexOf("requireWatchlistAccount(user)");
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(toggleBody.slice(gateAt, gateAt + 120)).toMatch(/if \(!uid\) return;/);
    for (const mutation of ["deleteDoc(", "setDoc(", "showToast(", "setSavedToWatchlist(true)"]) {
      expect(toggleBody.indexOf(mutation)).toBeGreaterThan(gateAt);
    }
  });

  it("remove path deletes the doc, decrements the count, and toasts Removed", () => {
    const removeAt = toggleBody.indexOf("if (savedToWatchlist) {");
    const addAt = toggleBody.indexOf("const snap = await getDoc(ref)");
    expect(removeAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(removeAt);
    const remove = toggleBody.slice(removeAt, addAt);
    expect(remove).toContain("await deleteDoc(ref)");
    expect(remove).toContain("adjustListingWatchlistCount(listing.id, -1)");
    expect(remove).toContain("setSavedToWatchlist(false)");
    expect(remove).toContain('showToast("Removed from watchlist", "info")');
    // A failed delete must not flip UI state.
    expect(remove.indexOf("return;")).toBeLessThan(remove.indexOf("setSavedToWatchlist(false)"));
  });

  it("add path flips to saved and bumps the count", () => {
    const add = toggleBody.slice(toggleBody.indexOf("const snap = await getDoc(ref)"));
    expect(add).toContain("adjustListingWatchlistCount(listing.id, 1)");
    expect(add).toContain("setSavedToWatchlist(true)");
    expect(add).toContain('showToast("Added to watchlist!")');
  });

  it("button label, pressed state, and filled heart follow savedToWatchlist", () => {
    expect(src).toContain("onClick={() => void toggleWatchlist()}");
    expect(src).toContain("aria-pressed={savedToWatchlist === true}");
    expect(src).toContain('{savedToWatchlist ? "Remove from Watchlist" : "Save to Watchlist"}');
    expect(src).toContain('fill={savedToWatchlist ? "currentColor" : "none"}');
    expect(src).toContain("disabled={savedToWatchlist === null && Boolean(user?.uid)}");
  });
});
