/** Comprehensive voice command registry — every major Sky Drop feature with natural-language aliases. */

export type RouteEntry = {
  path: string;
  title: string;
  aliases: string[];
  phoneticAliases?: string[];
};

export const ROUTE_REGISTRY: RouteEntry[] = [
  // ── Home ──
  {
    path: "/",
    title: "Home",
    aliases: [
      "home", "main", "marketplace", "go home", "home page",
      "landing", "homepage", "back to home", "main page",
    ],
    phoneticAliases: ["hoam", "hom", "hompage", "mainpage"],
  },

  // ── Sell / Create Listing ──
  {
    path: "/post/ai",
    title: "Sell",
    aliases: [
      "sell", "create listing", "new listing", "post", "list item",
      "sell tab", "ai post", "create a listing", "create a new listing",
      "list something", "sell something", "i want to sell", "make a listing",
      "post something", "start selling", "post an ad", "place an ad",
      "list an item", "sell an item", "add listing", "add a listing",
    ],
    phoneticAliases: ["sel", "sale page", "selling page", "creat listing", "new listng"],
  },

  // ── My Listings ──
  {
    path: "/list-list",
    title: "My Listings",
    aliases: [
      "my listings", "my listing", "my posts", "my ads", "my items",
      "manage listings", "seller dashboard", "active listings",
      "my postings", "what i am selling", "my listings page",
      "listings", "my products", "my inventory",
    ],
    phoneticAliases: ["my listins", "my listngs", "my listing", "listings", "listings page"],
  },

  // ── Purchases ──
  {
    path: "/purchases",
    title: "Purchases",
    aliases: [
      "purchases", "purchase", "buying", "my orders", "bought items",
      "order history", "my purchases", "what i bought", "items bought",
      "orders", "my orders page", "recent purchases",
    ],
    phoneticAliases: ["purchas", "purches", "my order", "purchase history", "purchis"],
  },

  // ── Sales ──
  {
    path: "/sales",
    title: "Sales",
    aliases: [
      "sales", "sold items", "orders", "seller orders",
      "my sales", "sold", "items sold", "orders received",
      "my sold items", "sales page",
    ],
    phoneticAliases: [
      "cells", "sells", "sails", "sale", "sals",
      "my sells", "my cells", "sails page", "sold page",
    ],
  },

  // ── Watchlist ──
  {
    path: "/watchlist",
    title: "Watchlist",
    aliases: [
      "watchlist", "watch list", "favorites", "favourites", "saved items",
      "saved", "bookmarks", "my saved items", "saved listings",
      "wishlist", "my watchlist",
    ],
    phoneticAliases: ["watchlit", "favourits", "favorits", "watch list", "wichlist"],
  },

  // ── Search ──
  {
    path: "/search",
    title: "Search",
    aliases: [
      "search", "browse", "find", "shop", "explore",
      "search page", "browse page", "discover",
    ],
    phoneticAliases: ["serch", "brous", "surch", "sarch", "brwose"],
  },

  // ── Messages ──
  {
    path: "/messages",
    title: "Messages",
    aliases: [
      "messages", "message", "inbox", "chats", "chat",
      "conversations", "conversation", "my messages", "direct messages",
      "open messages", "dm", "dms", "message inbox",
    ],
    phoneticAliases: [
      "massages", "messags", "mesages", "inboxs",
      "mesagges", "messeges", "inbox page",
    ],
  },

  // ── Notifications ──
  {
    path: "/notifications",
    title: "Notifications",
    aliases: [
      "notifications", "notification", "alerts", "alert",
      "notif", "bell", "my notifications",
    ],
    phoneticAliases: ["notifcations", "notificashuns", "notif", "notificashon"],
  },

  // ── Profile ──
  {
    path: "/profile",
    title: "Profile",
    aliases: [
      "profile", "my profile", "my account", "account", "user profile",
      "profile page", "my account page", "account settings",
    ],
    phoneticAliases: ["profiel", "profil", "prophile", "prophile page"],
  },

  // ── Payments / Billing / Wallet ──
  {
    path: "/profile#payment-settings",
    title: "Payments",
    aliases: [
      "payments", "payment", "pay", "billing", "wallet",
      "payout", "payouts", "transactions", "transaction history",
      "payment settings", "my payments", "billing page",
      "payment history", "payment method", "payment methods",
      "my wallet", "bank account", "bank details",
    ],
    phoneticAliases: ["paymants", "paymints", "paymint", "billings", "wallit"],
  },

  // ── Settings ──
  {
    path: "/profile",
    title: "Settings",
    aliases: [
      "settings", "preferences", "my settings", "account settings",
      "configuration", "app settings", "my preferences",
    ],
    phoneticAliases: ["settins", "settngs", "setings", "prefrences"],
  },

  // ── Security ──
  {
    path: "/profile#security",
    title: "Security",
    aliases: [
      "security", "password", "login settings", "privacy",
      "privacy settings", "login", "sign in settings",
      "two factor", "2fa", "authentication",
    ],
    phoneticAliases: ["secrity", "sucurity", "secutity"],
  },

  // ── Verification ──
  {
    path: "/profile#verification",
    title: "Verification",
    aliases: [
      "verification", "verify", "verify account", "id verification",
      "identity", "identity verification", "verified badge",
      "get verified", "become verified",
    ],
    phoneticAliases: ["verifcation", "verificashun", "verefy"],
  },

  // ── Reviews ──
  {
    path: "/reviews",
    title: "Reviews",
    aliases: [
      "reviews", "review", "ratings", "rating", "feedback",
      "my reviews", "my ratings", "seller reviews",
    ],
    phoneticAliases: ["revews", "revues", "revws", "ratins"],
  },

  // ── Admin ──
  {
    path: "/admin",
    title: "Admin",
    aliases: [
      "admin", "admin panel", "administration", "dashboard admin",
      "admin dashboard", "admin page",
    ],
    phoneticAliases: ["admen", "admine", "admn"],
  },

  // ── Analytics / Insights ──
  {
    path: "/seller/insights",
    title: "Analytics",
    aliases: [
      "analytics", "insights", "stats", "statistics", "performance",
      "reports", "seller insights", "my analytics", "my insights",
      "manage analytics",
    ],
    phoneticAliases: ["analitics", "analytix", "insites", "statistics"],
  },

  // ── Offers ──
  {
    path: "/",
    title: "Offers",
    aliases: [
      "offers", "my offers", "buy offers", "sell offers",
      "offers received", "offers sent", "make an offer",
    ],
    phoneticAliases: ["offrs", "offas", "offers page"],
  },

  // ── Auctions ──
  {
    path: "/",
    title: "Auctions",
    aliases: [
      "auctions", "auction", "bidding", "bid", "my auctions",
      "auction page", "live auctions",
    ],
    phoneticAliases: ["awkshuns", "ocshuns", "auktion"],
  },

  // ── Rentals ──
  {
    path: "/rentals",
    title: "Rentals",
    aliases: [
      "rentals", "rental", "rent", "for rent", "lease",
      "rental page", "property rental", "equipment rental",
      "vehicle rental", "rentals page",
    ],
    phoneticAliases: ["rentls", "rintals", "rentals page", "rentel"],
  },

  // ── Services ──
  {
    path: "/services",
    title: "Services",
    aliases: [
      "services", "service", "freelance", "gigs", "gig",
      "hire", "local services", "services page",
      "service provider", "find a service",
    ],
    phoneticAliases: ["servises", "servics", "survices", "servic"],
  },

  // ── Vehicles ──
  {
    path: "/vehicles",
    title: "Vehicles",
    aliases: [
      "vehicles", "vehicle", "cars", "car", "auto",
      "motor", "vehicles for sale", "cars for sale",
      "browse cars", "browse vehicles", "vehicle page",
      "motors", "automotive",
    ],
    phoneticAliases: ["vihicles", "vehicls", "vecals", "vihicle", "vheicles"],
  },

  // ── Digital ──
  {
    path: "/digital",
    title: "Digital",
    aliases: [
      "digital", "digital products", "downloads", "templates",
      "digital goods", "digital download", "digital page",
      "digital items", "digital product",
    ],
    phoneticAliases: ["digitl", "dijital", "dijital page", "digital page"],
  },

  // ── Wanted ──
  {
    path: "/wanted",
    title: "Wanted",
    aliases: [
      "wanted", "wanted posts", "requests", "buy requests",
      "wanted ads", "wanted page", "wanted listings",
      "looking for", "wanted ad",
    ],
    phoneticAliases: ["wonted", "wantd", "wanted page"],
  },

  // ── Help / Support ──
  {
    path: "/faqs",
    title: "Help",
    aliases: [
      "help", "support", "faqs", "faq", "questions",
      "get help", "contact support", "help center",
      "support ticket", "contact us", "customer support",
      "help page", "support page",
    ],
    phoneticAliases: ["halp", "saport", "faqs page", "helpp"],
  },

  // ── Dashboard ──
  {
    path: "/dashboard",
    title: "Dashboard",
    aliases: [
      "dashboard", "stats", "earnings", "seller hub",
      "my dashboard", "seller dashboard", "dashboard page",
      "seller stats",
    ],
    phoneticAliases: ["dashbord", "dashbard", "dash", "dashboad"],
  },

  // ── Trade Feed ──
  {
    path: "/trade-feed",
    title: "Trade Feed",
    aliases: [
      "trade feed", "live feed", "activity", "feed",
      "market activity", "trade activity",
    ],
    phoneticAliases: ["trade feed", "trad feed", "feed page"],
  },

  // ── Opportunities ──
  {
    path: "/opportunities",
    title: "Opportunities",
    aliases: [
      "opportunities", "opportunity", "earn", "make money",
      "side hustle", "earning opportunities",
    ],
    phoneticAliases: ["oportunities", "oppertunities", "oportinities"],
  },

  // ── Escrow ──
  {
    path: "/escrow",
    title: "Escrow",
    aliases: [
      "escrow", "secure payment", "held payment",
      "escrow service", "payment protection",
    ],
  },

  // ── Checkout ──
  {
    path: "/checkout",
    title: "Checkout",
    aliases: [
      "checkout", "buy", "complete purchase",
      "cart", "shopping cart", "purchase page",
    ],
    phoneticAliases: ["check out", "chekout", "check out page"],
  },

  // ── Disputes ──
  {
    path: "/disputes",
    title: "Disputes",
    aliases: [
      "disputes", "dispute", "dispute center",
      "open dispute", "my disputes", "resolution center",
    ],
    phoneticAliases: ["disputs", "dispute page"],
  },

  // ── Reports ──
  {
    path: "/reports",
    title: "Reports",
    aliases: [
      "reports", "report", "report a user",
      "submit report", "report listing",
    ],
    phoneticAliases: ["reports page", "repots"],
  },

  // ── Trust & Safety ──
  {
    path: "/trust",
    title: "Trust & Safety",
    aliases: [
      "trust", "safety", "trust and safety",
      "community guidelines", "safe",
    ],
  },

  // ── Buyer Protection ──
  {
    path: "/buyer-protection",
    title: "Buyer Protection",
    aliases: [
      "buyer protection", "safe buying", "scam protection",
      "buyer protection page",
    ],
  },

  // ── Seller Guidelines ──
  {
    path: "/seller-guidelines",
    title: "Seller Guidelines",
    aliases: [
      "seller guidelines", "guidelines", "how to sell",
      "selling rules", "seller guide",
    ],
  },

  // ── About ──
  {
    path: "/about",
    title: "About",
    aliases: [
      "about", "about sky drop", "about page",
      "what is sky drop",
    ],
  },

  // ── Terms ──
  {
    path: "/terms",
    title: "Terms",
    aliases: [
      "terms", "terms of service", "tos",
      "terms and conditions",
    ],
  },

  // ── Privacy ──
  {
    path: "/privacy",
    title: "Privacy",
    aliases: [
      "privacy", "privacy policy",
      "privacy page",
    ],
  },

  // ── Events ──
  {
    path: "/events",
    title: "Events",
    aliases: [
      "events", "event", "upcoming events",
      "events page", "calendar",
    ],
  },

  // ── Jobs ──
  {
    path: "/jobs",
    title: "Jobs",
    aliases: [
      "jobs", "employment", "job", "work",
      "job listings", "careers", "job page",
    ],
    phoneticAliases: ["job page", "jobbs"],
  },

  // ── Drafts ──
  {
    path: "/post/ai",
    title: "Drafts",
    aliases: [
      "drafts", "my drafts", "saved drafts",
      "draft listings", "my draft listings",
    ],
    phoneticAliases: ["drafts page", "draft"],
  },

  // ── Manage Listings ──
  {
    path: "/manage/listings",
    title: "Manage Listings",
    aliases: [
      "manage listings", "listing management", "moderate listings",
      "admin listings",
    ],
  },

  // ── Manage Users ──
  {
    path: "/manage/users",
    title: "Manage Users",
    aliases: [
      "manage users", "user management", "admin users",
      "users page", "user admin",
    ],
  },

  // ── Manage Reports ──
  {
    path: "/manage/reports",
    title: "Manage Reports",
    aliases: [
      "manage reports", "report management",
      "admin reports", "reports moderation",
    ],
  },

  // ── Manage Disputes ──
  {
    path: "/manage/disputes",
    title: "Manage Disputes",
    aliases: [
      "manage disputes", "dispute management",
      "admin disputes", "dispute moderation",
    ],
  },

  // ── Manage Settings ──
  {
    path: "/manage/settings",
    title: "Manage Settings",
    aliases: [
      "manage settings", "site settings",
      "platform settings", "admin settings",
    ],
  },

  // ── Manage Activity ──
  {
    path: "/manage/activity",
    title: "Manage Activity",
    aliases: [
      "manage activity", "activity log",
      "admin activity", "site activity",
    ],
  },

  // ── Manage Analytics ──
  {
    path: "/manage/analytics",
    title: "Manage Analytics",
    aliases: [
      "manage analytics", "admin analytics",
      "platform analytics", "site analytics",
    ],
  },

  // ── Manage Admins ──
  {
    path: "/manage/admins",
    title: "Manage Admins",
    aliases: [
      "manage admins", "admin management",
      "admin roles", "moderator management",
    ],
  },

  // ── Manage Verification ──
  {
    path: "/manage/verification",
    title: "Manage Verification",
    aliases: [
      "manage verification", "verification requests",
      "verify users", "approve verification",
    ],
  },

  // ── Seller Insights ──
  {
    path: "/seller/insights",
    title: "Seller Insights",
    aliases: [
      "seller insights", "my insights",
      "seller analytics", "my performance",
    ],
  },

  // ── Security Dashboard ──
  {
    path: "/admin/security-dashboard",
    title: "Security Dashboard",
    aliases: [
      "security dashboard", "admin security",
      "security page", "security overview",
    ],
  },
];

/* ── Precomputed lookup structures ── */
type FlatEntry = { path: string; title: string; phrase: string };

let _flatMap: FlatEntry[] | null = null;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function buildFlatMap(): FlatEntry[] {
  if (_flatMap) return _flatMap;
  const map: FlatEntry[] = [];
  for (const entry of ROUTE_REGISTRY) {
    for (const alias of entry.aliases) {
      map.push({ path: entry.path, title: entry.title, phrase: normalize(alias) });
    }
    for (const alias of entry.phoneticAliases ?? []) {
      map.push({ path: entry.path, title: entry.title, phrase: normalize(alias) });
    }
  }
  _flatMap = map;
  return map;
}

/** Score how well a normalized query matches a phrase. */
export function scorePhraseMatch(query: string, phrase: string): number {
  if (!query || !phrase) return 0;

  if (query === phrase) return 10;

  if (query.startsWith(phrase) || phrase.startsWith(query)) return 8;

  if (query.includes(phrase) || phrase.includes(query)) return 6;

  const qWords = new Set(query.split(" "));
  const pWords = phrase.split(" ");
  const overlap = pWords.filter((w) => qWords.has(w)).length;
  if (overlap === pWords.length && overlap > 0 && pWords.length >= 2) return 5;
  if (overlap >= 2) return 4;

  return 0;
}

/** Find the best matching route for a query. Returns null if nothing close. */
export function matchRouteFromRegistry(
  text: string,
  minScore = 3
): { path: string; title: string; score: number } | null {
  const query = normalize(text);
  if (!query || query.length < 2) return null;

  const map = buildFlatMap();
  let best: { path: string; title: string; score: number } | null = null;

  for (const entry of map) {
    const score = scorePhraseMatch(query, entry.phrase);
    if (score > 0 && (!best || score > best.score)) {
      best = { path: entry.path, title: entry.title, score };
    }
  }

  return best && best.score >= minScore ? best : null;
}

/** Match with strict threshold. */
export function matchRouteStrict(text: string): { path: string; title: string; score: number } | null {
  return matchRouteFromRegistry(text, 5);
}
