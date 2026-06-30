/** Central route registry — maps voice phrases to app routes. */

export type RouteEntry = {
  path: string;
  title: string;
  /** Voice phrases that should match this route (lowercase, no nav prefixes). */
  phrases: string[];
  /** Known STT mishearings (e.g., "cells" → "sales"). Auto-merged with phrases. */
  phoneticAliases?: string[];
};

export const ROUTE_REGISTRY: RouteEntry[] = [
  // ── Home ──
  {
    path: "/",
    title: "Home",
    phrases: ["home", "main", "marketplace", "go home"],
    phoneticAliases: ["hoam", "hom"],
  },

  // ── Selling ──
  {
    path: "/post/ai",
    title: "Sell",
    phrases: [
      "sell", "create listing", "new listing", "post", "list item",
      "sell tab", "ai post", "create a listing", "create a new listing",
      "list something", "sell something", "i want to sell", "make a listing",
    ],
    phoneticAliases: ["sel", "sale page", "selling page"],
  },
  {
    path: "/list-list",
    title: "My listings",
    phrases: [
      "my listings", "my posts", "my ads", "manage listings",
      "seller dashboard", "active listings", "my postings", "what i am selling",
    ],
    phoneticAliases: ["my listins", "my listngs", "my listing"],
  },

  // ── Orders ──
  {
    path: "/purchases",
    title: "Purchases",
    phrases: [
      "purchases", "buying", "my orders", "bought items",
      "order history", "my purchases", "what i bought", "items bought",
    ],
    phoneticAliases: ["purchas", "purches", "my order"],
  },
  {
    path: "/sales",
    title: "Sales",
    phrases: [
      "sales", "sold items", "orders", "seller orders",
      "my sales", "sold", "items sold", "orders received",
    ],
    phoneticAliases: ["cells", "sells", "sails", "sale", "sals", "my sells", "my cells"],
  },

  // ── Discovery ──
  {
    path: "/watchlist",
    title: "Watchlist",
    phrases: [
      "watchlist", "favorites", "favourites", "saved items",
      "saved", "bookmarks", "watch list", "my saved items",
    ],
    phoneticAliases: ["watch list", "watchlit", "favourits", "favorits"],
  },
  {
    path: "/search",
    title: "Search",
    phrases: ["search", "browse", "find", "shop", "explore"],
    phoneticAliases: ["serch", "brous", "surch"],
  },

  // ── Communication ──
  {
    path: "/messages",
    title: "Messages",
    phrases: [
      "messages", "inbox", "chats", "conversations",
      "my messages", "direct messages", "open messages",
    ],
    phoneticAliases: ["massages", "messags", "mesages", "inboxs"],
  },
  {
    path: "/notifications",
    title: "Notifications",
    phrases: ["notifications", "alerts", "notif"],
    phoneticAliases: ["notifcations", "notificashuns"],
  },

  // ── Profile ──
  {
    path: "/profile",
    title: "Profile",
    phrases: ["profile", "my profile", "my account", "account", "settings"],
    phoneticAliases: ["profiel", "profil", "prophile"],
  },
  {
    path: "/profile#payment-settings",
    title: "Payments",
    phrases: [
      "payments", "payment", "pay", "billing", "wallet",
      "payout", "payment settings", "transaction history", "my payments",
    ],
    phoneticAliases: ["paymants", "paymints"],
  },
  {
    path: "/profile#security",
    title: "Security",
    phrases: ["security", "password", "login settings", "privacy settings"],
  },
  {
    path: "/profile#verification",
    title: "Verification",
    phrases: ["verification", "verify", "verify account", "id verification"],
  },

  // ── Admin ──
  {
    path: "/admin",
    title: "Admin",
    phrases: ["admin", "admin panel", "administration", "dashboard admin"],
    phoneticAliases: ["admen", "admine"],
  },

  // ── Pages ──
  {
    path: "/faqs",
    title: "FAQs",
    phrases: ["faqs", "faq", "help", "questions"],
  },
  {
    path: "/about",
    title: "About",
    phrases: ["about", "about sky drop"],
  },
  {
    path: "/terms",
    title: "Terms",
    phrases: ["terms", "terms of service", "tos"],
  },
  {
    path: "/privacy",
    title: "Privacy",
    phrases: ["privacy", "privacy policy"],
  },

  // ── Categories ──
  {
    path: "/vehicles",
    title: "Vehicles",
    phrases: ["vehicles", "cars", "car", "auto", "motor", "vehicles for sale"],
    phoneticAliases: ["vihicles", "vehicls", "vecals"],
  },
  {
    path: "/services",
    title: "Services",
    phrases: ["services", "service", "freelance", "gigs", "hire"],
    phoneticAliases: ["servises", "servics", "survices"],
  },
  {
    path: "/rentals",
    title: "Rentals",
    phrases: ["rentals", "rent", "for rent", "lease", "rental"],
    phoneticAliases: ["rentls", "rintals"],
  },
  {
    path: "/digital",
    title: "Digital",
    phrases: ["digital", "digital products", "downloads", "templates"],
    phoneticAliases: ["digitl", "dijital"],
  },

  // ── Reviews & Disputes ──
  {
    path: "/reviews",
    title: "Reviews",
    phrases: ["reviews", "ratings", "feedback"],
    phoneticAliases: ["revews", "revues"],
  },
  {
    path: "/disputes",
    title: "Disputes",
    phrases: ["disputes", "dispute", "dispute center", "open dispute"],
  },
  {
    path: "/reports",
    title: "Reports",
    phrases: ["reports", "report", "report a user", "submit report"],
  },

  // ── Dashboard ──
  {
    path: "/dashboard",
    title: "Dashboard",
    phrases: ["dashboard", "stats", "earnings", "seller hub", "my dashboard"],
    phoneticAliases: ["dashbord", "dashbard"],
  },

  // ── Trust & Safety ──
  {
    path: "/trust",
    title: "Trust & Safety",
    phrases: ["trust", "safety", "trust and safety", "community guidelines"],
  },
  {
    path: "/buyer-protection",
    title: "Buyer protection",
    phrases: ["buyer protection", "safe buying", "scam protection"],
  },
  {
    path: "/seller-guidelines",
    title: "Seller guidelines",
    phrases: ["seller guidelines", "guidelines", "how to sell", "selling rules"],
  },

  // ── Extras ──
  {
    path: "/trade-feed",
    title: "Trade feed",
    phrases: ["trade feed", "live feed", "activity", "market activity"],
  },
  {
    path: "/wanted",
    title: "Wanted",
    phrases: ["wanted", "wanted posts", "requests", "buy requests"],
  },
  {
    path: "/opportunities",
    title: "Opportunities",
    phrases: ["opportunities", "earn", "make money", "side hustle"],
  },
  {
    path: "/escrow",
    title: "Escrow",
    phrases: ["escrow", "secure payment", "held payment"],
  },
  {
    path: "/checkout",
    title: "Checkout",
    phrases: ["checkout", "buy", "complete purchase"],
  },
  {
    path: "/events",
    title: "Events",
    phrases: ["events", "event"],
  },
  {
    path: "/jobs",
    title: "Jobs",
    phrases: ["jobs", "employment", "job"],
  },
];

/* ── Prebuilt lookup structures ── */

type MatchEntry = {
  path: string;
  title: string;
  phrase: string;
};

/** All phrases (including phonetic aliases) normalized and mapped to their route. */
let _phraseMap: MatchEntry[] | null = null;

function buildPhraseMap(): MatchEntry[] {
  if (_phraseMap) return _phraseMap;
  const map: MatchEntry[] = [];
  for (const entry of ROUTE_REGISTRY) {
    for (const phrase of entry.phrases) {
      map.push({ path: entry.path, title: entry.title, phrase: normalize(phrase) });
    }
    for (const alias of entry.phoneticAliases ?? []) {
      map.push({ path: entry.path, title: entry.title, phrase: normalize(alias) });
    }
  }
  _phraseMap = map;
  return map;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Score how well a normalized query matches an entry. */
function scoreMatch(query: string, entry: MatchEntry): number {
  const q = normalize(query);
  const p = entry.phrase;

  // Exact phrase match
  if (q === p) return 10;

  // Query starts with phrase or vice versa
  if (q.startsWith(p) || p.startsWith(q)) return 8;

  // Phrase is contained in query or vice versa
  if (q.includes(p) || p.includes(q)) return 6;

  // Individual word overlap
  const qWords = new Set(q.split(" "));
  const pWords = p.split(" ");
  const overlap = pWords.filter((w) => qWords.has(w)).length;
  if (overlap === pWords.length && overlap > 0) return 5;
  if (overlap >= 2) return 4;

  return 0;
}

/**
 * Find the best matching route for a given voice transcript.
 * Returns matched route info or null if nothing is close enough.
 */
export function matchRoute(text: string): { path: string; title: string; score: number } | null {
  const query = normalize(text);
  if (!query || query.length < 2) return null;

  const map = buildPhraseMap();
  let best: { path: string; title: string; score: number } | null = null;

  for (const entry of map) {
    const score = scoreMatch(query, entry);
    if (score > 0 && (!best || score > best.score)) {
      best = { path: entry.path, title: entry.title, score };
    }
  }

  // Require minimum score of 5 for a confident match, 3 for a weak match
  return best && best.score >= 3 ? best : null;
}

/** Search for a phrase match with a minimum confidence threshold. */
export function matchRouteStrict(text: string): { path: string; title: string; score: number } | null {
  const result = matchRoute(text);
  return result && result.score >= 5 ? result : null;
}
