import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const p = join(dir, "..", "app", "page.tsx");
let text = readFileSync(p, "utf8");

if (!text.includes("MarketplaceListingCard")) {
  text = text.replace(
    'import PromoteModal from "./components/PromoteModal";',
    'import PromoteModal from "./components/PromoteModal";\nimport MarketplaceListingCard from "./components/MarketplaceListingCard";'
  );
  text = text.replace(
    'import { isListingVisibleInMarketplace } from "./lib/listing-availability";',
    'import { isListingVisibleInMarketplace } from "./lib/listing-availability";\nimport { adjustListingWatchlistCount } from "./lib/listing-watchlist-count";'
  );
}

if (!text.includes("watchlistTick")) {
  text = text.replace(
    '  const [promoteItem, setPromoteItem] = useState<any>(null);',
    '  const [promoteItem, setPromoteItem] = useState<any>(null);\n  const [watchlistTick, setWatchlistTick] = useState(0);'
  );
}

if (!text.includes("setWatchlistTick")) {
  text = text.replace(
    `    if (index >= 0) {
      existing.splice(index, 1);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      showToast("Removed from watchlist", "info");
    } else {`,
    `    const wasSaved = isInWatchlist(item.id);

    if (index >= 0) {
      existing.splice(index, 1);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      showToast("Removed from watchlist", "info");
      if (wasSaved) void adjustListingWatchlistCount(item.id, -1);
    } else {`
  );
  text = text.replace(
    `      showToast("Added to watchlist!");
    }
  }`,
    `      showToast("Added to watchlist!");
      void adjustListingWatchlistCount(item.id, 1);
    }
    setWatchlistTick((t) => t + 1);
  }`
  );
}

const nl = text.includes("\r\n") ? "\r\n" : "\n";
const markerStart = `        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">${nl}${nl}          {(() => {`;
const markerEnd = `        })()}${nl}${nl}        </div>${nl}${nl}        {visibleCount < filteredListings.length ? (`;

const replacement = `        {!loading && filteredListings.length > 0 && (
        <div key={watchlistTick} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredListings.slice(0, visibleCount).map((item: any, cardIndex: number) => (
            <MarketplaceListingCard
              key={item.id}
              item={item}
              cardIndex={cardIndex}
              user={user}
              isInWatchlist={(id) => {
                void watchlistTick;
                return isInWatchlist(id);
              }}
              onToggleWatchlist={toggleWatchlist}
              onCardClick={() => {
                saveRecentlyViewed(item);
                router.push(\`/post/listing/\${item.id}\`);
              }}
              onBuyNow={handleBuyNow}
              onMakeOffer={(listing) => {
                setOfferListing(listing);
                setShowOfferModal(true);
              }}
              sellerReviewStats={sellerReviewStats}
              sellerBadges={sellerBadges}
              onPromote={(listing) => setPromoteItem(listing)}
              onDelete={(listing) => setDeleteConfirm(listing)}
            />
          ))}
        </div>
        )}

        {visibleCount < filteredListings.length ? (`;

const i = text.indexOf(markerStart);
const j = text.indexOf(markerEnd, i);
if (i < 0 || j < 0) {
  console.error("markers not found", i, j);
  process.exit(1);
}

text = text.slice(0, i) + replacement + text.slice(j + markerEnd.length);
writeFileSync(p, text, "utf8");
console.log("Homepage grid patched to MarketplaceListingCard");
