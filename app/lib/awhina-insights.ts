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

const PAGE_INTROS: Record<string, string[]> = {

  "/digital": [
    "This is the Digital Store — ebooks, software, templates, and downloads.",
    "Buy instant-delivery items or list your own digital products for sale.",
  ],
  "/services": [
    "This is Services — freelance work, consulting, gigs, and professional help.",
    "Browse providers or list a service you offer and message to agree details.",
  ],
  "/rentals": [
    "This is Rentals — tools, gear, cameras, and short-term equipment hire.",
    "Find something to borrow or list your own items for others to rent.",
  ],
  "/vehicles": [
    "This is Vehicles — cars, bikes, boats, and other transport for sale.",
    "Open a listing for photos, price, and seller details, then message to buy.",
  ],
  "/property": [
    "This is Property — homes, rentals, land, and real estate listings.",
    "Browse what's available and contact sellers from each listing.",
  ],
  "/jobs": [
    "This is Jobs — work opportunities posted on Sky Drop.",
    "Browse open roles or manage applications if you're hiring.",
  ],
  "/events": [
    "This is Events — tickets, gigs, meetups, and things happening near you.",
    "Browse upcoming events or list one you're hosting.",
  ],
  "/trade-feed": [
    "This is the Trade Feed — community trades, swaps, and barter-style posts.",
    "See what others want to trade and message to negotiate a swap.",
  ],
  "/watchlist": [
    "This is your Watchlist — listings you've saved to check later.",
    "Search and sort saved items, or open a card when you're ready to buy.",
  ],
  "/list-list": [
    "This is My Listings — your seller dashboard for everything you've posted.",
    "Boost, edit, or delete listings. Active and sold tabs filter your posts.",
  ],
  "/purchases": [
    "This is My Purchases — everything you've bought on Sky Drop.",
    "Track order status, message sellers, and open disputes if something goes wrong.",
  ],
  "/sales": [
    "This is Sales — orders from buyers for your listings.",
    "Mark items shipped or delivered and message buyers from each order.",
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
  "/profile": [
    "This is your Profile — how other users see you on Sky Drop.",
    "Update your photo, bio, username, and account settings here.",
  ],
  "/notifications": [
    "This is Notifications — alerts for messages, offers, sales, and activity.",
    "Open any notification to jump to the relevant listing or conversation.",
  ],
  "/post/ai": [
    "This is Sell with Āwhina — tell me what you're selling and I'll draft your listing.",
    "Describe the item and I'll fill in title, price, category, and description.",
  ],
  "/post/listing": [
    "This is Create Listing — the manual form to post something for sale.",
    "Add photos, price, and description, then publish to the marketplace.",
  ],
  "/reviews": [
    "This is Reviews — feedback left by buyers and sellers after a deal.",
    "Leave honest reviews after a completed purchase or sale.",
  ],
  "/reports": [
    "This is Reports — flag listings or users that break Sky Drop rules.",
    "Submit a report with details and our team will review it.",
  ],
  "/disputes": [
    "This is Disputes — raise or track issues with a purchase.",
    "Open a dispute if an item didn't arrive or wasn't as described.",
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
  "/escrow": [
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
];

export function resolveAwhinaPageIntro(pathname: string): string[] | null {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (path === "/checkout" || path === "/post") return null;

  for (const { prefix, lines } of PREFIX_INTROS) {
    if (path.startsWith(prefix) && path.length > prefix.length) return lines;
  }

  return PAGE_INTROS[path] ?? null;
}

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
