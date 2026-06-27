import { AWHINA_NAME } from "./awhina-brand";
import {
  AWHINA_GUIDE_BROWSE_PATHS,
  isAwhinaGuideExcluded,
  isAwhinaNavbarPath,
  normalizeAwhinaGuidePath,
} from "./awhina-guide-paths";
import { dispatchSkyAiOpen } from "./sky-ai-events";
import { isListingVisibleInMarketplace } from "./listing-availability";

export type AwhinaInsightActionLink = {
  type: "link";
  label: string;
  href: string;
  primary?: boolean;
};

export type AwhinaInsightActionButton = {
  type: "button";
  label: string;
  onClick: () => void;
  primary?: boolean;
};

export type AwhinaInsightAction = AwhinaInsightActionLink | AwhinaInsightActionButton;

export type AwhinaInsight = {
  icon: string;
  label: string;
  message: string;
  actions?: AwhinaInsightAction[];
};

const PAGE_INTROS: Record<string, string[]> = {
  "/": [
    "You're on Physical Goods — everyday items from sellers across New Zealand.",
    "Search or pick a category, then open a listing to buy or message the seller.",
  ],
  "/digital": [
    "You're in the Digital Store — buy templates, e-books, design assets, software, and more from Kiwi creators.",
    "Search or pick a category, open a listing, and checkout to download your purchase instantly.",
  ],
  "/services": [
    "You're on Services — freelancers and professionals offering help across NZ.",
    "Search by skill or location, open a listing, and message the provider to agree scope and price.",
  ],
  "/rentals": [
    "You're on Rentals — short-term hire for gear, tools, rooms, and equipment.",
    "Filter by region, open a listing, and message the owner to arrange dates and pickup.",
  ],
  "/vehicles": [
    "You're on Vehicles — cars, motorbikes, boats, and transport listed for sale.",
    "Search by make or region, then open a listing to view photos, price, and contact the seller.",
  ],
  "/property": [
    "You're on Property — homes, land, and commercial listings across New Zealand.",
    "Browse available properties and message sellers from each listing to arrange viewings.",
  ],
  "/jobs": [
    "You're on Jobs — roles and opportunities posted on Sky Drop.",
    "Browse openings that match your skills, or post a job if you're hiring.",
  ],
  "/events": [
    "You're on Events — tickets, gigs, meetups, and local happenings.",
    "Find something near you and purchase securely through each event listing.",
  ],
  "/trade-feed": [
    "This is the Trade Feed — community trades, swaps, and barter-style posts.",
    "See what others want to trade and message to negotiate a swap.",
  ],
  "/watchlist": [
    "You're on Watchlist — listings you've saved for later.",
    "Search or sort your saved items, then open any card when you're ready to buy or message the seller.",
  ],
  "/list-list": [
    "You're on My Listings — your seller hub for everything you've posted.",
    "Use Active and Sold tabs to manage posts, edit details, or check performance on each listing.",
  ],
  "/purchases": [
    "You're on My Purchases — orders you've placed on Sky Drop.",
    "Track delivery status, message sellers, and open a dispute if something isn't right.",
  ],
  "/sales": [
    "You're on Sales — orders buyers have placed on your listings.",
    "Update each order when you ship or deliver, and message buyers from the sale card.",
  ],
  "/dashboard": [
    "This is your Dashboard — a quick overview of your Sky Drop activity.",
    "See stats, recent sales, and shortcuts to your seller tools.",
  ],
  "/dashboard/applications": [
    "This is Job Applications — responses to jobs you've posted.",
    "Review applicants and manage who you want to hire.",
  ],
  "/messages": [
    "This is Messages — your inbox for buyer and seller conversations.",
    "Negotiate offers, arrange pickups, and keep every deal in one thread.",
  ],
  "/disputes": [
    "You're on Disputes — track and resolve issues with your orders.",
    "Open a dispute within 7 days of delivery if something isn't right with your purchase.",
  ],
  "/notifications": [
    "This is Notifications — updates about your activity on Sky Drop.",
    "Stay on top of messages, sales, purchases, and platform announcements.",
  ],
  "/reviews": [
    "You're on Reviews — feedback from buyers and sellers.",
    "Build your reputation by leaving honest reviews after each transaction.",
  ],
  "/profile": [
    "This is your Profile — how other users see you on Sky Drop.",
    "Update your photo, bio, username, and account settings here.",
  ],
  "/post/ai": [
    "This is Sell with Āwhina — tell me what you're selling and I'll draft your listing.",
    "Describe the item and I'll fill in title, price, category, and description.",
  ],
  "/post/listing": [
    "This is Create Listing — the manual form to post something for sale.",
    "Add photos, price, and description, then publish to the marketplace.",
  ],
  "/reports": [
    "This is Reports — flag listings or users that break Sky Drop rules.",
    "Submit a report with details and our team will review it.",
  ],
  "/blocked": [
    "This is Blocked Users — people you've chosen not to hear from.",
    "Unblock someone here if you want to message them again.",
  ],
  "/login": [
    "This is Login — sign in or create your Sky Drop account.",
    "You need an account to list items, message sellers, buy, and manage orders.",
  ],
  "/forgot-password": [
    "This is Reset Password — recover access to your Sky Drop account.",
    "Enter your email and we'll send a link to set a new password.",
  ],
  "/about": [
    "This is About Sky Drop — who we are and what we're building for New Zealand.",
    "A community marketplace with secure Stripe payments for Kiwi buyers and sellers.",
  ],
  "/faqs": [
    "This is FAQs — answers to common questions about buying, selling, and payments.",
    "Search topics or browse sections before you message support.",
  ],
  "/terms": [
    "This is Terms of Service — the rules for using Sky Drop.",
    "Covers listings, payments, disputes, and what we expect from members.",
  ],
  "/privacy": [
    "This is Privacy Policy — how Sky Drop collects, uses, and protects your data.",
    "Read how your information is handled across the platform.",
  ],
  "/buyer-protection": [
    "This is Buyer Protection — safeguards when you purchase on Sky Drop.",
    "Covers Stripe payments, disputes, and how to get help if something goes wrong.",
  ],
  "/seller-guidelines": [
    "This is the Seller Guide — best practices for listing, pricing, and shipping.",
    "Follow these tips to sell faster and keep buyers happy.",
  ],
  "/payments": [
    "This is How Payments Work — Stripe checkout and buyer protections.",
    "Read how money moves between buyers and sellers on Sky Drop.",
  ],
  "/admin": [
    "This is the Admin Dashboard — platform overview for Sky Drop staff.",
    "Monitor users, listings, reports, disputes, and system health.",
  ],
  "/admin/disputes": [
    "This is Admin Disputes — review and resolve buyer-seller payment disputes.",
    "Open cases show amount, parties, and evidence to action refunds.",
  ],
  "/admin/reports": [
    "This is Admin Reports — user-submitted flags on listings and accounts.",
    "Review each report and take moderation action where needed.",
  ],
  "/admin/verification": [
    "This is Admin Verification — review seller identity and verification requests.",
    "Approve or decline verification submissions from here.",
  ],
  "/admin/test-email": [
    "This is Email Preview — test how Sky Drop notification emails render.",
    "Send test emails to verify templates before they go live.",
  ],
  "/admin/knowledge": [
    "This is Admin Knowledge — manage help articles and FAQ content.",
    "Create, edit, or delete knowledge base articles for users.",
  ],
  "/admin/message-flags": [
    "This is Admin Message Flags — review flagged conversations for moderation.",
    "Check messages that were auto-flagged for policy violations.",
  ],
  "/admin/security-dashboard": [
    "This is Security Dashboard — monitor platform security events and threats.",
    "Track suspicious activity, failed logins, and security alerts.",
  ],
  "/admin/system-architecture": [
    "This is System Architecture — overview of Sky Drop's technical infrastructure.",
    "View system components, data flow, and architecture documentation.",
  ],
  "/profile/verification": [
    "This is Verification — prove your identity to unlock seller features.",
    "Complete phone and ID verification to list items and sell on Sky Drop.",
  ],
  "/profile/badges": [
    "This is Badges — earn reputation badges for being a trusted seller.",
    "Complete sales, get reviews, and maintain good standing to unlock badges.",
  ],
  "/profile/payments": [
    "This is Payment Settings — how you receive money from sales.",
    "Set up bank details for Arrange Purchase or connect Stripe for instant card checkout.",
  ],
  "/checkout/success": [
    "Payment successful — your purchase is recorded on Sky Drop.",
    "Check Purchases for order details or open Messages to coordinate with the seller.",
  ],
};

const PREFIX_INTROS: { prefix: string; lines: string[] }[] = [
  {
    prefix: "/post/listing/",
    lines: [
      "This is a listing page — photos, price, description, and seller info.",
      "Message the seller, make an offer, or buy when you're ready.",
    ],
  },
  {
    prefix: "/post/edit/",
    lines: [
      "This is Edit Listing — update photos, price, title, or description.",
      "Save changes to push updates live on the marketplace.",
    ],
  },
  {
    prefix: "/seller/",
    lines: [
      "This is a seller profile — their listings, reviews, and public shop info.",
      "Browse what they have for sale and message them from any listing.",
    ],
  },
  {
    prefix: "/profile/",
    lines: [
      "This is your Profile — how other users see you on Sky Drop.",
      "Update your photo, bio, username, and account settings here.",
    ],
  },
];

const pageIntroCache = new Map<string, string[] | null>();

function lookupAwhinaPageIntro(pathname: string): string[] | null {
  const path = normalizeAwhinaGuidePath(pathname);

  if (path === "/checkout" || path === "/post") return null;

  if (pageIntroCache.has(path)) {
    return pageIntroCache.get(path) ?? null;
  }

  for (const { prefix, lines } of PREFIX_INTROS) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      pageIntroCache.set(path, lines);
      return lines;
    }
  }

  const result = PAGE_INTROS[path] ?? null;
  pageIntroCache.set(path, result);
  return result;
}

/** Portal guide — skips home, browse marketplace, and other excluded routes. */
export function resolveAwhinaPageIntro(pathname: string): string[] | null {
  if (isAwhinaGuideExcluded(pathname)) return null;
  return lookupAwhinaPageIntro(pathname);
}

/** Inline assistant under navbar and browse page headers. */
export function getAwhinaNavbarPageIntro(pathname: string): string[] | null {
  const path = normalizeAwhinaGuidePath(pathname);
  if (!isAwhinaNavbarPath(pathname) && !AWHINA_GUIDE_BROWSE_PATHS.has(path)) return null;
  return lookupAwhinaPageIntro(pathname);
}

/** @deprecated Use getAwhinaNavbarPageIntro */
export function getAwhinaBrowsePageIntro(pathname: string): string[] | null {
  return getAwhinaNavbarPageIntro(pathname);
}

type WatchlistItem = { id: string; title?: string; category?: string };

export function buildWatchlistInsight(
  watchlist: WatchlistItem[],
  popularIds: Set<string>
): AwhinaInsight | null {
  try {
    if (watchlist.length === 0) return null;

    const trending = watchlist.find((item) => popularIds.has(item.id));
    if (trending) {
      return {
        icon: "🔥",
        label: "Hot Listing",
        message: trending.title
          ? `"${trending.title}" is trending right now.`
          : "One of your saved listings is currently trending.",
        actions: [{ type: "link" as const, label: "View Listing", href: `/post/listing/${trending.id}`, primary: true }],
      };
    }

    if (watchlist.length >= 2) {
      return {
        icon: "✨",
        label: AWHINA_NAME,
        message: `You have ${watchlist.length} saved listings.`,
        actions: [
          { type: "link" as const, label: "Browse Similar", href: "/" },
          {
            type: "button" as const,
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
      actions: [{ type: "link" as const, label: "Browse Listings", href: "/", primary: true }],
    };
  } catch (err) {
    console.error("Error building watchlist insight:", err);
    return null;
  }
}

type SellerListing = {
  id: string;
  title?: string;
  views?: number;
  status?: string;
  stockQuantity?: number | string | null;
  promotedUntil?: { toMillis?: () => number };
  [key: string]: unknown;
};

type ListListInsightInput = {
  listings: SellerListing[];
  onBoost?: (listing: SellerListing) => void;
};

export function buildListListInsight({ listings, onBoost }: ListListInsightInput): AwhinaInsight | null {
  try {
    if (listings.length === 0) return null;

    const now = Date.now();
    const active = listings.filter((l) => isListingVisibleInMarketplace(l));

    if (active.length === 0) {
      return {
        icon: "✨",
        label: AWHINA_NAME,
        message: "All your listings have sold or expired — ready to list again?",
        actions: [{ type: "link" as const, label: "New Listing", href: "/post/ai", primary: true }],
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
        actions: [{ type: "button" as const, label: "Boost Listing", onClick: () => onBoost(unboosted), primary: true }],
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
        actions: [{ type: "link" as const, label: "View Listing", href: `/post/listing/${topViews.id}`, primary: true }],
      };
    }

    if (active.length >= 2) {
      return {
        icon: "✨",
        label: AWHINA_NAME,
        message: `You have ${active.length} active listings live on the marketplace.`,
        actions: [
          {
            type: "button" as const,
            label: `Ask ${AWHINA_NAME}`,
            onClick: () => dispatchSkyAiOpen("How can I improve my listings?"),
            primary: true,
          },
        ],
      };
    }

    return null;
  } catch (err) {
    console.error("Error building list list insight:", err);
    return null;
  }
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
  try {
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
        actions: [{ type: "button" as const, label: "View Orders", onClick: onFocusActive, primary: true }],
      };
    }

    const openDispute = purchases.find((p) => p.disputeStatus === "open" || p.disputeStatus === "under_review");
    if (openDispute) {
      return {
        icon: "💡",
        label: "Tip",
        message: `Dispute in progress on "${openDispute.listingTitle}".`,
        actions: [{ type: "button" as const, label: "View Orders", onClick: onFocusActive, primary: true }],
      };
    }

    const active = purchases.filter((p) => !["delivered", "cancelled"].includes(p.status));
    if (active.length >= 2) {
      return {
        icon: "✨",
        label: AWHINA_NAME,
        message: `You have ${active.length} active orders in progress.`,
      };
    }

    return null;
  } catch (err) {
    console.error("Error building purchases insight:", err);
    return null;
  }
}

export function buildSalesInsight(
  sales: { id: string; listingTitle: string; status: string }[],
  onFocusActive?: () => void
): AwhinaInsight | null {
  try {
    if (sales.length === 0) return null;

    const needsUpdate = sales.filter(
      (s) => !["completed", "cancelled", "delivered"].includes(s.status)
    );

    if (needsUpdate.length > 0) {
      return {
        icon: "📦",
        label: AWHINA_NAME,
        message:
          needsUpdate.length === 1
            ? `"${needsUpdate[0].listingTitle}" needs an update.`
            : `${needsUpdate.length} orders need updating — confirm, ship, or mark complete.`,
        actions: [
          {
            type: "button" as const,
            label: `View ${needsUpdate.length} Active`,
            onClick: onFocusActive,
            primary: true,
          },
        ],
      };
    }

    return sales.length > 0
      ? {
          icon: "✅",
          label: AWHINA_NAME,
          message: `All ${sales.length} orders are completed. Nice work!`,
        }
      : null;
  } catch (err) {
    console.error("Error building sales insight:", err);
    return null;
  }
}
