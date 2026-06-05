import { AWHINA_NAME } from "./awhina-brand";
import { dispatchSkyAiOpen } from "./sky-ai-events";
import { isListingVisibleInMarketplace } from "./listing-availability";

export type AwhinaInsightAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

export type AwhinaInsight = {
  icon: string;
  label: string;
  message: string;
  actions?: AwhinaInsightAction[];
};

type WatchlistItem = { id: string; title?: string; category?: string };

export function buildWatchlistInsight(
  watchlist: WatchlistItem[],
  popularIds: Set<string>
): AwhinaInsight | null {
  if (watchlist.length === 0) return null;

  const trending = watchlist.find((item) => popularIds.has(item.id));
  if (trending) {
    return {
      icon: "🔥",
      label: "Hot Listing",
      message: trending.title
        ? `"${trending.title}" is trending right now.`
        : "One of your saved listings is currently trending.",
      actions: [{ label: "View Listing", href: `/post/listing/${trending.id}`, primary: true }],
    };
  }

  if (watchlist.length >= 2) {
    return {
      icon: "✨",
      label: AWHINA_NAME,
      message: `You have ${watchlist.length} saved listings.`,
      actions: [
        { label: "Browse Similar", href: "/" },
        {
          label: `Ask ${AWHINA_NAME}`,
          onClick: () => dispatchSkyAiOpen("Help me find listings similar to my watchlist"),
        },
      ],
    };
  }

  return {
    icon: "💡",
    label: "Tip",
    message: "Add more listings to your watchlist to track prices and compare options.",
    actions: [{ label: "Browse Listings", href: "/", primary: true }],
  };
}

type SellerListing = {
  id: string;
  title?: string;
  views?: number;
  promotedUntil?: { toMillis?: () => number };
  [key: string]: unknown;
};

type ListListInsightInput = {
  listings: SellerListing[];
  onBoost?: (listing: SellerListing) => void;
};

export function buildListListInsight({ listings, onBoost }: ListListInsightInput): AwhinaInsight | null {
  if (listings.length === 0) return null;

  const now = Date.now();
  const active = listings.filter((l) => isListingVisibleInMarketplace(l));

  if (active.length === 0) {
    return {
      icon: "✨",
      label: AWHINA_NAME,
      message: "All your listings have sold or expired — ready to list again?",
      actions: [{ label: "New Listing", href: "/post/ai", primary: true }],
    };
  }

  const unboosted = active.find(
    (l) => !l.promotedUntil?.toMillis?.() || l.promotedUntil.toMillis() <= now
  );
  if (unboosted && onBoost) {
    return {
      icon: "💡",
      label: "Tip",
      message: unboosted.title
        ? `Boost "${unboosted.title}" to reach more buyers.`
        : "Boost a listing to reach more buyers.",
      actions: [{ label: "Boost Listing", onClick: () => onBoost(unboosted), primary: true }],
    };
  }

  const topViews = active.reduce<SellerListing | null>(
    (best, l) => ((l.views || 0) > (best?.views || 0) ? l : best),
    null
  );
  if (topViews && (topViews.views || 0) >= 5) {
    return {
      icon: "🔥",
      label: "Hot Listing",
      message: `"${topViews.title}" has ${topViews.views} views — keep the momentum going.`,
      actions: [{ label: "View Listing", href: `/post/listing/${topViews.id}`, primary: true }],
    };
  }

  if (active.length >= 2) {
    return {
      icon: "✨",
      label: AWHINA_NAME,
      message: `You have ${active.length} active listings live on the marketplace.`,
      actions: [
        {
          label: `Ask ${AWHINA_NAME}`,
          onClick: () => dispatchSkyAiOpen("How can I improve my listings?"),
          primary: true,
        },
      ],
    };
  }

  return null;
}

type PurchaseRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  status: string;
  deliveryMethod?: string;
  disputeStatus?: string;
};

export function buildPurchasesInsight(
  purchases: PurchaseRow[],
  onFocusActive?: () => void
): AwhinaInsight | null {
  if (purchases.length === 0) return null;

  const needsConfirm = purchases.filter(
    (p) =>
      p.status === "shipped" ||
      (p.deliveryMethod === "pickup" && p.status === "seller_confirming") ||
      (p.deliveryMethod === "service" && p.status === "completed")
  );

  if (needsConfirm.length > 0) {
    const p = needsConfirm[0];
    return {
      icon: "✨",
      label: AWHINA_NAME,
      message:
        needsConfirm.length === 1
          ? `"${p.listingTitle}" is ready to confirm received.`
          : `${needsConfirm.length} orders are ready to confirm received.`,
      actions: [{ label: "View Orders", onClick: onFocusActive, primary: true }],
    };
  }

  const openDispute = purchases.find((p) => p.disputeStatus === "open" || p.disputeStatus === "under_review");
  if (openDispute) {
    return {
      icon: "💡",
      label: "Tip",
      message: `Dispute in progress on "${openDispute.listingTitle}".`,
      actions: [{ label: "View Orders", onClick: onFocusActive, primary: true }],
    };
  }

  const active = purchases.filter((p) => !["delivered", "cancelled"].includes(p.status));
  if (active.length >= 2) {
    return {
      icon: "✨",
      label: AWHINA_NAME,
      message: `You have ${active.length} active orders in progress.`,
      actions: [
        {
          label: `Ask ${AWHINA_NAME}`,
          onClick: () => dispatchSkyAiOpen("Help me with my active purchases"),
        },
      ],
    };
  }

  return null;
}
