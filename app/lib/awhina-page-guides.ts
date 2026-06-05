export type AwhinaGuideConfig = {
  lines: string[];
  storageKey: string;
};

function guide(lines: string[], slug: string): AwhinaGuideConfig {
  return { lines: lines.slice(0, 2), storageKey: `awhina-guide-${slug}` };
}

/** Exact-path guides for main tabs and pages */
const EXACT_GUIDES: Record<string, string[]> = {
  "/": [
    "Home — browse listings across New Zealand.",
    "Search, filter, watchlist items, or tap Sell with Āwhina to list.",
  ],
  "/digital": [
    "This is the Digital Store — ebooks, software, templates, and downloadable files.",
    "Buy instant delivery items or list your own digital products for sale.",
    "Filter by category and open any listing to purchase securely through Stripe.",
  ],
  "/services": [
    "This is Services — freelance work, consulting, gigs, and professional help.",
    "Browse what Kiwi providers offer or list a service you provide.",
    "Message providers to discuss scope, timing, and price before you commit.",
  ],
  "/rentals": [
    "This is Rentals — tools, gear, cameras, equipment, and short-term hire.",
    "Find something to borrow or list your own items for others to rent.",
    "Check availability, location, and pricing on each listing card.",
  ],
  "/vehicles": [
    "This is Vehicles — cars, bikes, boats, and other transport for sale.",
    "Filter listings and open one to see photos, price, and seller details.",
    "Message the seller or arrange purchase when you find the right ride.",
  ],
  "/property": [
    "This is Property — homes, rentals, land, and real estate listings.",
    "Browse what's available across New Zealand and contact sellers from each listing.",
  ],
  "/jobs": [
    "This is Jobs — work opportunities posted on Sky Drop.",
    "Browse open roles or manage listings if you are hiring.",
    "Apply or message employers directly from a job post.",
  ],
  "/events": [
    "This is Events — tickets, gigs, meetups, and things happening near you.",
    "Browse upcoming events or list one you are hosting.",
  ],
  "/trade-feed": [
    "This is the Trade Feed — community trades, swaps, and barter-style posts.",
    "See what others want to trade and post your own offer.",
    "Message traders to negotiate and arrange the swap.",
  ],
  "/list-list": [
    "My Listings — manage everything you have posted.",
    "Boost, edit, or delete listings. Active and sold tabs filter your posts.",
  ],
  "/watchlist": [
    "This is your Watchlist — listings you have saved to check later.",
    "Search and sort saved items, remove ones you no longer need, or open a card to buy.",
    "Tap the heart on any listing across Sky Drop to add it here.",
  ],
  "/purchases": [
    "This is Purchases — everything you have bought on Sky Drop.",
    "Track order status, message sellers, and open disputes if something goes wrong.",
    "Completed purchases stay here for your records.",
  ],
  "/sales": [
    "This is Sales — orders from buyers for your listings.",
    "Mark items as shipped or delivered, message buyers, and manage active sales.",
    "Completed and cancelled orders are filtered by the tabs above.",
  ],
  "/dashboard": [
    "This is your Dashboard — a quick overview of your Sky Drop activity.",
    "See listing stats, recent sales, messages, and shortcuts to key seller tools.",
    "Use it as home base when you are buying and selling regularly.",
  ],
  "/dashboard/applications": [
    "This is Job Applications — responses to jobs you have posted.",
    "Review applicants, open their messages, and manage who you want to hire.",
  ],
  "/messages": [
    "This is Messages — your inbox for buyer and seller conversations.",
    "Negotiate offers, arrange pickups, and keep every deal in one thread.",
    "New chats start when you message someone from a listing.",
  ],
  "/profile": [
    "This is your Profile — how other users see you on Sky Drop.",
    "Update your photo, bio, username, and account settings here.",
    "Your listings, reviews, and seller stats show on this page too.",
  ],
  "/notifications": [
    "This is Notifications — alerts for messages, offers, sales, and account activity.",
    "Open any notification to jump straight to the relevant listing or conversation.",
  ],
  "/post/ai": [
    "This is Sell with Āwhina — tell me what you are selling and I will draft your listing.",
    "Describe the item in your own words; I fill in title, price, category, and description.",
    "Add more details anytime and I will update the same draft until you publish.",
  ],
  "/post/listing": [
    "This is Create Listing — the manual form to post something for sale.",
    "Add photos, price, category, and description, then publish to the marketplace.",
    "Prefer help? Use Sell with Āwhina instead and I will draft it for you.",
  ],
  "/reviews": [
    "This is Reviews — feedback left by buyers and sellers after a deal.",
    "Honest reviews build trust across the marketplace.",
    "Leave a review after a completed purchase or sale.",
  ],
  "/reports": [
    "This is Reports — flag listings or users that break Sky Drop rules.",
    "Submit a report with details and our team will review it.",
  ],
  "/disputes": [
    "This is Disputes — raise or track issues with a purchase.",
    "Open a dispute if an item did not arrive, was not as described, or needs a refund.",
    "Keep messages in the purchase thread so we have full context.",
  ],
  "/blocked": [
    "This is Blocked Users — people you have chosen not to hear from.",
    "Unblock someone here if you want to message or trade with them again.",
  ],
  "/login": [
    "This is Login — sign in or create your Sky Drop account.",
    "You need an account to list items, message sellers, buy, and manage orders.",
  ],
  "/forgot-password": [
    "This is Reset Password — recover access to your Sky Drop account.",
    "Enter your email and we will send a link to set a new password.",
  ],
  "/about": [
    "This is About Sky Drop — who we are and what we are building for New Zealand.",
    "A community marketplace with secure Stripe payments and tools for Kiwi buyers and sellers.",
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
  ],
  "/buyer-protection": [
    "This is Buyer Protection — what safeguards exist when you purchase on Sky Drop.",
    "Covers Stripe payments, disputes, and how to get help if something goes wrong.",
  ],
  "/seller-guidelines": [
    "This is the Seller Guide — best practices for listing, pricing, and shipping.",
    "Follow these tips to sell faster and keep buyers happy.",
  ],
  "/escrow": [
    "This is How Payments Work — Stripe checkout, arrange purchase, and buyer protections.",
    "Read how money moves between buyers and sellers on Sky Drop.",
  ],
  "/admin": [
    "This is the Admin Dashboard — platform overview for Sky Drop staff.",
    "Monitor users, listings, reports, disputes, and system health from here.",
  ],
  "/admin/disputes": [
    "This is Admin Disputes — review and resolve buyer-seller payment disputes.",
    "Open cases show amount, parties, and evidence to action refunds or closures.",
  ],
  "/admin/reports": [
    "This is Admin Reports — user-submitted flags on listings and accounts.",
    "Review each report and take moderation action where needed.",
  ],
  "/admin/verification": [
    "This is Admin Verification — review seller identity and verification requests.",
  ],
  "/admin/test-email": [
    "This is Email Preview — test how Sky Drop notification emails render.",
  ],
  "/checkout/success": [
    "Payment successful — your purchase is recorded on Sky Drop.",
    "Check Purchases for order details or open Messages to coordinate with the seller.",
    "Keep the conversation in-app so buyer protection applies.",
  ],
};

const PREFIX_GUIDES: { prefix: string; slug: string; lines: string[] }[] = [
  {
    prefix: "/post/listing/",
    slug: "listing-detail",
    lines: [
      "This is a listing page — photos, price, description, and seller info for one item.",
      "Message the seller, make an offer, or buy now when you are ready.",
      "Save to your watchlist with the heart icon to come back later.",
    ],
  },
  {
    prefix: "/post/edit/",
    slug: "edit-listing",
    lines: [
      "This is Edit Listing — update photos, price, title, or description for your post.",
      "Save changes to push updates live on the marketplace.",
    ],
  },
  {
    prefix: "/seller/",
    slug: "seller-profile",
    lines: [
      "This is a seller profile — their listings, reviews, and public shop info.",
      "Browse what they have for sale and message them from any listing.",
    ],
  },
];

function slugFromPath(path: string): string {
  if (path === "/") return "home";
  return path.replace(/^\//, "").replace(/\//g, "-");
}

export function resolveAwhinaGuide(pathname: string): AwhinaGuideConfig | null {
  const path = (pathname.split("?")[0].replace(/\/$/, "") || "/");

  if (path === "/checkout" || path === "/post") return null;

  for (const { prefix, slug, lines } of PREFIX_GUIDES) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      return guide(lines, slug);
    }
  }

  const exact = EXACT_GUIDES[path];
  if (exact) return guide(exact, slugFromPath(path));

  return null;
}
