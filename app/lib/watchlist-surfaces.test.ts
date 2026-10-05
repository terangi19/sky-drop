import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source guards (repo has no jsdom): every watchlist surface goes through the
 * shared helper, keeps the #59 guest gate first, and nothing reads/writes the
 * old un-scoped localStorage "watchlist" key.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const SURFACES = [
  "app/page.tsx",
  "app/search/page.tsx",
  "app/wanted/page.tsx",
  "app/opportunities/page.tsx",
  "app/rentals/page.tsx",
  "app/services/page.tsx",
  "app/components/BrowseCategoryPage.tsx",
  "app/profile/ProfileAccountClient.tsx",
];

describe("watchlist surfaces share one helper", () => {
  it("no production file touches the legacy un-scoped localStorage 'watchlist' key", () => {
    const offenders = walk(path.join(root, "app")).filter((f) => {
      if (f.endsWith(path.join("lib", "watchlist-cache.ts"))) return false;
      const src = readFileSync(f, "utf8");
      return /localStorage\.(get|set|remove)Item\(\s*["'`]watchlist["'`]/.test(src);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("only watchlist-cache.ts builds localStorage watchlist keys", () => {
    const offenders = walk(path.join(root, "app")).filter((f) => {
      if (f.endsWith(path.join("lib", "watchlist-cache.ts"))) return false;
      return /`watchlist_\$\{/.test(readFileSync(f, "utf8"));
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it.each(SURFACES)("%s: guest gate first, then the shared helper, intent from the heart", (rel) => {
    const src = read(rel);
    const fnAt = src.indexOf("toggleWatchlist = async (item") >= 0
      ? src.indexOf("toggleWatchlist = async (item")
      : src.indexOf("async function toggleWatchlist(");
    expect(fnAt).toBeGreaterThan(0);
    const body = src.slice(fnAt, fnAt + 900);
    const gateAt = body.indexOf("requireWatchlistAccount(user)");
    const helperAt = body.indexOf("setListingWatchlistSaved(");
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(body.slice(gateAt, gateAt + 120)).toMatch(/if \(!uid\) return;/);
    expect(helperAt).toBeGreaterThan(gateAt);
    expect(body).toMatch(/save: !isInWatchlist(ForCards)?\(item\.id\)/);
    expect(src).toContain("useWatchlistSaved(user?.uid)");
    // no per-surface Firestore watchlist writes left behind
    expect(body).not.toContain("deleteDoc(");
    expect(body).not.toContain("setDoc(");
    expect(body).not.toContain("adjustListingWatchlistCount(");
  });

  it("listing card still gates guests before toggling (#59)", () => {
    const card = read("app/components/listing-card/MarketplaceListingCard.tsx");
    const at = card.indexOf("if (!requireWatchlistAccount(user)) return;");
    expect(at).toBeGreaterThan(0);
    expect(card.indexOf("onToggleWatchlist(item)", at)).toBeGreaterThan(at);
  });

  it("detail page keeps the M2 toggle but caches per uid and writes the price-alert index doc on save", () => {
    const src = read("app/post/listing/[id]/page.tsx");
    expect(src).toContain("addToWatchlistCache(uid, listing.id)");
    expect(src).toContain("removeFromWatchlistCache(uid, listing.id)");
    expect(src).toContain("buildWatchlistIndexDoc(uid, listing, user?.email");
    expect(src).toContain("const [savedToWatchlist, setSavedToWatchlist] = useState<boolean | null>(null)");
  });

  it("/watchlist page drops the legacy key and clears the per-uid cache on removals", () => {
    const src = read("app/watchlist/page.tsx");
    expect(src).toContain("purgeLegacyWatchlistKey()");
    expect(src.match(/removeFromWatchlistCache\(/g)?.length).toBe(3);
  });
});
