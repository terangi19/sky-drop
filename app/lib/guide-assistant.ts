/** Rule-based Sky Drop guide — maps questions to pages and auto-navigation. */

export type GuideDestination = {
  id: string;
  title: string;
  path: string;
  keywords: string[];
  blurb: string;
};

export const GUIDE_DESTINATIONS: GuideDestination[] = [
  {
    id: "home",
    title: "Marketplace home",
    path: "/",
    keywords: ["home", "marketplace", "browse", "shop", "main"],
    blurb: "Browse listings across New Zealand.",
  },
  {
    id: "seller-guidelines",
    title: "Seller guidelines",
    path: "/seller-guidelines",
    keywords: ["seller guideline", "guideline", "guidelines", "guide lines", "seller guide", "rules", "how to sell", "selling rules"],
    blurb: "How to list, get paid, and sell safely on Sky Drop.",
  },
  {
    id: "arrange-payment",
    title: "Bank transfer setup (Arrange Purchase)",
    path: "/seller-guidelines#arrange-payment",
    keywords: ["arrange purchase", "bank transfer", "bank details", "pay seller", "bank account setup"],
    blurb: "Set up bank details for Arrange Purchase listings.",
  },
  {
    id: "payment-settings",
    title: "Payment settings (Profile)",
    path: "/profile#payment-settings",
    keywords: ["payment settings", "bank account", "save bank", "stripe connect", "payout", "get paid"],
    blurb: "Add bank details for Arrange Purchase or connect Stripe.",
  },
  {
    id: "profile",
    title: "Your profile",
    path: "/profile",
    keywords: ["profile", "my account", "settings", "username", "bio", "my profile", "go to profile"],
    blurb: "Edit your profile, verification, and payment settings.",
  },
  {
    id: "post-ai",
    title: "Sell — create a listing",
    path: "/post/ai",
    keywords: [
      "post",
      "sell",
      "listing",
      "list item",
      "create listing",
      "sell item",
      "new listing",
      "sell tab",
      "ai post",
      "ai listing",
      "quick sell",
      "sell with ai",
      "photo listing",
      "sell my",
      "i want to sell",
      "create a listing",
      "post a listing",
      "create a new listing",
      "list something",
      "sell something",
    ],
    blurb: "Upload photos and create your listing (Sell tab).",
  },
  {
    id: "faqs",
    title: "FAQs",
    path: "/faqs",
    keywords: ["faq", "faqs", "help", "questions", "how does"],
    blurb: "Answers about buying, selling, and safety.",
  },
  {
    id: "about",
    title: "About Sky Drop",
    path: "/about",
    keywords: ["about", "what is sky drop", "mission"],
    blurb: "What Sky Drop is and how payments work.",
  },
  {
    id: "payments",
    title: "How payments work",
    path: "/payments",
    keywords: ["payments", "stripe checkout", "payment types", "how to pay", "buyer protection"],
    blurb: "Stripe Checkout vs Arrange Purchase explained.",
  },
  {
    id: "messages",
    title: "Messages",
    path: "/messages",
    keywords: ["message", "messages", "chat", "inbox", "talk to seller", "talk to buyer", "my messages", "open messages", "conversations", "dm", "direct messages"],
    blurb: "Chat with buyers and sellers.",
  },
  {
    id: "purchases",
    title: "Purchases",
    path: "/purchases",
    keywords: ["purchase", "purchases", "orders", "bought", "my orders", "dispute", "open dispute", "my purchases", "what i bought", "buying", "items bought", "order history", "my buying"],
    blurb: "Track orders, confirm delivery, and open disputes.",
  },
  {
    id: "sales",
    title: "Sales",
    path: "/sales",
    keywords: ["sales", "my sales", "sold", "seller orders", "what i sold", "my sales page", "sold items", "orders received", "items sold", "my sold"],
    blurb: "Manage orders from buyers.",
  },
  {
    id: "list-list",
    title: "My listings",
    path: "/list-list",
    keywords: ["my listings", "listings", "manage listings", "edit listing", "my items", "what im selling", "my posts", "my postings", "active listings", "seller dashboard", "my ads"],
    blurb: "View and manage your active listings.",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    path: "/dashboard",
    keywords: ["dashboard", "stats", "earnings", "tokens", "my dashboard", "seller hub"],
    blurb: "Your seller hub — stats, earnings, and rewards.",
  },
  {
    id: "watchlist",
    title: "Watchlist",
    path: "/watchlist",
    keywords: ["watchlist", "saved", "saved items", "favourites", "favorites", "my saved items", "what i saved", "watch list", "bookmarks", "my watchlist", "saved listings"],
    blurb: "Items you are watching.",
  },
  {
    id: "login",
    title: "Login",
    path: "/login",
    keywords: ["login", "sign in", "log in"],
    blurb: "Sign in to your account.",
  },
  {
    id: "digital",
    title: "Digital store",
    path: "/digital",
    keywords: ["digital", "download", "templates", "assets"],
    blurb: "Digital products and instant delivery.",
  },
  {
    id: "buyer-protection",
    title: "Buyer protection",
    path: "/buyer-protection",
    keywords: ["buyer protection", "safe buying", "scam"],
    blurb: "How Sky Drop helps protect buyers.",
  },
  {
    id: "trade-feed",
    title: "Trade feed",
    path: "/trade-feed",
    keywords: ["trade feed", "live feed", "activity", "market activity"],
    blurb: "Live marketplace activity and trades.",
  },
  {
    id: "vehicles",
    title: "Vehicles",
    path: "/vehicles",
    keywords: ["vehicles", "cars", "car", "motor", "auto"],
    blurb: "Browse vehicle listings.",
  },
  {
    id: "services",
    title: "Services",
    path: "/services",
    keywords: ["services", "freelance", "hire", "gig", "service", "find a service", "looking for service"],
    blurb: "Browse services listings.",
  },
  {
    id: "rentals",
    title: "Rentals",
    path: "/rentals",
    keywords: ["rentals", "rent", "hire", "lease", "rental", "for rent"],
    blurb: "Browse rental listings.",
  },
  {
    id: "disputes",
    title: "Disputes",
    path: "/disputes",
    keywords: ["disputes", "dispute center", "refund dispute"],
    blurb: "Dispute information and status.",
  },
  {
    id: "reviews",
    title: "Reviews",
    path: "/reviews",
    keywords: ["reviews", "ratings", "feedback"],
    blurb: "Community reviews.",
  },
  {
    id: "notifications",
    title: "Notifications",
    path: "/notifications",
    keywords: ["notifications", "alerts", "notif"],
    blurb: "Your notification inbox.",
  },
  {
    id: "terms",
    title: "Terms of service",
    path: "/terms",
    keywords: ["terms", "tos", "terms of service"],
    blurb: "Platform terms.",
  },
  {
    id: "privacy",
    title: "Privacy policy",
    path: "/privacy",
    keywords: ["privacy", "privacy policy", "data"],
    blurb: "Privacy policy.",
  },
  {
    id: "verify-email",
    title: "Email verification",
    path: "/verify-email",
    keywords: ["verify", "verification", "verify email", "email verification", "confirm email", "verify my email", "email confirm"],
    blurb: "Verify your email address to unlock full access.",
  },
  {
    id: "signup",
    title: "Create account",
    path: "/signup",
    keywords: ["signup", "sign up", "create account", "register", "join", "get started", "new account"],
    blurb: "Create a Sky Drop account.",
  },
  {
    id: "forgot-password",
    title: "Reset password",
    path: "/forgot-password",
    keywords: ["forgot password", "reset password", "change password", "password reset", "lost password"],
    blurb: "Reset your password.",
  },
  {
    id: "checkout",
    title: "Checkout",
    path: "/checkout",
    keywords: ["checkout", "buy", "purchase now", "pay", "complete purchase", "check out"],
    blurb: "Complete your purchase.",
  },
  {
    id: "checkout-success",
    title: "Purchase complete",
    path: "/checkout/success",
    keywords: ["purchase complete", "order success", "payment success", "checkout success", "order confirmed"],
    blurb: "Your purchase was successful.",
  },
  {
    id: "escrow",
    title: "Escrow",
    path: "/escrow",
    keywords: ["escrow", "secure payment", "held payment"],
    blurb: "Learn about escrow-protected payments.",
  },
  {
    id: "reports",
    title: "Reports",
    path: "/reports",
    keywords: ["reports", "report", "submit report", "report a user", "report listing", "flag"],
    blurb: "Submit and manage reports.",
  },
  {
    id: "trust",
    title: "Trust & Safety",
    path: "/trust",
    keywords: ["trust", "safety", "trust and safety", "safe", "secure", "community guidelines"],
    blurb: "Sky Drop's trust and safety information.",
  },
  {
    id: "blocked",
    title: "Blocked users",
    path: "/blocked",
    keywords: ["blocked", "blocked users", "blocks", "block list", "who i blocked"],
    blurb: "Manage users you have blocked.",
  },
  {
    id: "wanted",
    title: "Wanted posts",
    path: "/wanted",
    keywords: ["wanted", "wanted posts", "looking for", "requests", "buy requests", "iso"],
    blurb: "Browse wanted posts from buyers.",
  },
  {
    id: "wanted-create",
    title: "Create wanted post",
    path: "/wanted/create",
    keywords: ["create wanted", "post wanted", "new wanted", "request an item", "iso post"],
    blurb: "Create a wanted post.",
  },
  {
    id: "post",
    title: "Sell",
    path: "/post",
    keywords: ["sell", "create listing", "new listing", "post a listing", "sell page", "list an item", "selling hub"],
    blurb: "Create a new listing.",
  },
  {
    id: "seller-insights",
    title: "Seller insights",
    path: "/seller/insights",
    keywords: ["seller insights", "seller analytics", "sales insights", "seller stats", "my insights", "performance"],
    blurb: "View your seller insights and performance.",
  },
  {
    id: "opportunities",
    title: "Opportunities",
    path: "/opportunities",
    keywords: ["opportunities", "earn", "earning", "make money", "side hustle", "gigs"],
    blurb: "Explore earning opportunities on Sky Drop.",
  },
  {
    id: "dashboard-applications",
    title: "Applications",
    path: "/dashboard/applications",
    keywords: ["applications", "my applications", "job applications", "applied"],
    blurb: "Track your applications.",
  },
  {
    id: "manage",
    title: "Management dashboard",
    path: "/manage",
    keywords: ["manage", "management", "seller dashboard", "seller hub", "management hub", "manage my shop"],
    blurb: "Manage your Sky Drop presence.",
  },
  {
    id: "manage-listings",
    title: "Manage listings",
    path: "/manage/listings",
    keywords: ["manage listings", "manage my listings", "my listings management", "listing manager"],
    blurb: "Manage all your listings from one place.",
  },
  {
    id: "manage-settings",
    title: "Manage settings",
    path: "/manage/settings",
    keywords: ["manage settings", "seller settings", "shop settings", "store settings"],
    blurb: "Configure your seller settings.",
  },
  {
    id: "manage-verification",
    title: "Manage verification",
    path: "/manage/verification",
    keywords: ["manage verification", "seller verification", "verify my shop", "shop verification", "business verification"],
    blurb: "Verify your seller account.",
  },
  {
    id: "manage-activity",
    title: "Manage activity",
    path: "/manage/activity",
    keywords: ["manage activity", "seller activity", "recent activity", "shop activity"],
    blurb: "View your recent seller activity.",
  },
  {
    id: "manage-analytics",
    title: "Manage analytics",
    path: "/manage/analytics",
    keywords: ["manage analytics", "seller analytics", "shop analytics", "sales data", "performance analytics"],
    blurb: "View your seller analytics.",
  },
  {
    id: "manage-disputes",
    title: "Manage disputes",
    path: "/manage/disputes",
    keywords: ["manage disputes", "seller disputes", "my disputes", "open dispute", "dispute management"],
    blurb: "Manage disputes from your shop.",
  },
  {
    id: "manage-reports",
    title: "Manage reports",
    path: "/manage/reports",
    keywords: ["manage reports", "seller reports", "report management"],
    blurb: "View reports related to your shop.",
  },
  {
    id: "manage-notifications",
    title: "Manage notifications",
    path: "/manage/notifications",
    keywords: ["manage notifications", "seller notifications", "notification settings", "alert settings"],
    blurb: "Configure your seller notification preferences.",
  },
  {
    id: "manage-users",
    title: "Manage users",
    path: "/manage/users",
    keywords: ["manage users", "user management", "team members", "staff"],
    blurb: "Manage users on your seller account.",
  },
  {
    id: "manage-admins",
    title: "Manage admins",
    path: "/manage/admins",
    keywords: ["manage admins", "admin management", "team admins", "add admin"],
    blurb: "Manage administrators for your shop.",
  },
];

const NAVIGATE_PATTERNS =
  /\b(take me|go to|open|show me|show|navigate|bring me|send me|guide me|where is|where's|how do i get to|i need|bring up|go into|go to the|head to|get me to|view|let me see|take me into|show me the)\b/i;

/* ── Prefix map for instant partial-match navigation ── */

function compactSpeech(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MIN_PREFIX = 3;
const _prefixMap = new Map<string, GuideDestination>();

function _buildPrefixMap(): void {
  const markCollision = (prefix: string) => _prefixMap.set(prefix, null as unknown as GuideDestination);

  for (const dest of GUIDE_DESTINATIONS) {
    const keys = [dest.id, ...dest.keywords];
    for (const raw of keys) {
      const compact = compactSpeech(raw);
      if (!compact || compact.length < MIN_PREFIX) continue;
      for (let len = MIN_PREFIX; len <= compact.length; len++) {
        const prefix = compact.slice(0, len);
        const existing = _prefixMap.get(prefix);
        if (existing === undefined) {
          _prefixMap.set(prefix, dest);
        } else if (existing !== dest) {
          markCollision(prefix);
        }
      }
    }
  }
}
_buildPrefixMap();

/**
 * Fast path: if the user has spoken at least MIN_PREFIX characters that
 * uniquely identify one destination, return it immediately — no scoring.
 * Returns null for ambiguous prefixes (multiple destinations share them).
 */
export function findByCompactPrefix(compact: string): GuideDestination | null {
  if (!compact || compact.length < MIN_PREFIX) return null;
  // Walk prefix lengths from MIN_PREFIX up to full text. Only return when
  // the ENTIRE utterance is a known prefix — this avoids false matches
  // on partial collisions (e.g. "watchtower" sharing "watc" with "watchlist").
  for (let len = MIN_PREFIX; len <= compact.length; len++) {
    const prefix = compact.slice(0, len);
    const dest = _prefixMap.get(prefix);
    if (dest === undefined) return null;
    if (dest !== null && len === compact.length) return dest;
  }
  return null;
}

export type GuideReply = {
  text: string;
  navigateTo?: string;
  destination?: GuideDestination;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s#-]/g, " ").replace(/\s+/g, " ").trim();
}

export function scoreDestination(query: string, dest: GuideDestination): number {
  const q = normalize(query);
  if (!q) return 0;
  const qCompact = q.replace(/\s+/g, "");
  let score = 0;
  for (const kw of dest.keywords) {
    const k = kw.toLowerCase();
    const kCompact = k.replace(/\s+/g, "");
    if (q.includes(k)) score += k.split(" ").length + 2;
    if (qCompact.includes(kCompact)) score += k.split(" ").length + 3;
  }
  const titleWords = dest.title.toLowerCase().split(/\s+/);
  for (const w of titleWords) {
    if (w.length > 3 && q.includes(w)) score += 1;
  }
  const destIdCompact = dest.id.replace(/-/g, "");
  if (q.includes(dest.id.replace(/-/g, " "))) score += 3;
  if (qCompact === destIdCompact || qCompact.includes(destIdCompact)) score += 4;
  return score;
}

export function findBestDestination(query: string): GuideDestination | null {
  const q = normalize(query);
  if (!q) return null;
  let best: GuideDestination | null = null;
  let bestScore = 0;
  for (const dest of GUIDE_DESTINATIONS) {
    const s = scoreDestination(query, dest);
    if (s > bestScore) {
      bestScore = s;
      best = dest;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function getGuideReply(query: string, currentPath: string): GuideReply {
  const q = query.trim();
  const normalized = normalize(q);

  if (/^(hi|hello|hey|kia ora)\b/.test(normalized)) {
    return {
      text: "Kia ora! I'm Sky AI — ask what I can do, or tell me where to go (seller guidelines, payment settings, sell page).",
    };
  }

  // Special case: if user says "payments" on profile, take them to /payments page, not payment-settings
  // Match "payments" but not "payment settings" or "payment-settings"
  if (/\bpayments?\b/i.test(normalized) && !/\b(payment\s*settings|payment-settings)\b/i.test(normalized) && currentPath === "/profile") {
    const paymentsDest = GUIDE_DESTINATIONS.find((d) => d.id === "payments");
    if (paymentsDest) {
      return {
        text: `Opening **${paymentsDest.title}** now…\n\n${paymentsDest.blurb}`,
        navigateTo: paymentsDest.path,
        destination: paymentsDest,
      };
    }
  }

  const dest = findBestDestination(q);
  const wantsNav =
    NAVIGATE_PATTERNS.test(q) ||
    /\b(how do i get to|how do i open|take me|go to|open|show me|show|bring up|go into|view|head to)\b/i.test(q) ||
    (dest !== null && scoreDestination(q, dest) >= 4 && /\b(how do i|how to|setup|set up|where)\b/i.test(q));

  if (dest && wantsNav) {
    const samePage =
      currentPath === dest.path ||
      (dest.path.includes("#") && currentPath === dest.path.split("#")[0]);

    if (samePage) {
      // If on the same page but with a hash fragment, scroll to the section
      if (dest.path.includes("#") && currentPath === dest.path.split("#")[0]) {
        return {
          text: `Scrolling to **${dest.title}**…\n\n${dest.blurb}`,
          navigateTo: dest.path,
          destination: dest,
        };
      }
      return {
        text: `You're already on **${dest.title}**. ${dest.blurb} Ask if you want another page.`,
        destination: dest,
      };
    }

    return {
      text: `Opening **${dest.title}** now…\n\n${dest.blurb}`,
      navigateTo: dest.path,
      destination: dest,
    };
  }

  if (/\b(events?|jobs?|property|real estate|tickets?|concert|employment|hiring)\b/.test(normalized) &&
    /\b(list|sell|post|create|listing)\b/.test(normalized)) {
    return {
      text: "Sky Drop doesn't support **events, jobs, or property** listings. You can sell **physical items, vehicles, digital products, services, or rentals** on **Sell** (`/post/ai`).",
      navigateTo: "/post/ai",
      destination: GUIDE_DESTINATIONS.find((d) => d.id === "post-ai"),
    };
  }

  if (/\b(digital|download|template|ebook|service|freelance|rent|rental|hire)\b/.test(normalized) &&
    /\b(can i|how do i|list|sell|post|offer)\b/.test(normalized)) {
    const kind = /digital|template|ebook|download/.test(normalized)
      ? "**digital products** on `/digital` — choose **Digital** on Sell"
      : /service|freelance|design|coaching/.test(normalized)
        ? "**services** on `/services` — choose **Service** on Sell"
        : "**rentals** on `/rentals` — choose **Rental** on Sell";
    return {
      text: `Yes — Sky Drop supports ${kind}. Open **Sell** and I can help fill your listing.`,
      navigateTo: "/post/ai",
      destination: GUIDE_DESTINATIONS.find((d) => d.id === "post-ai"),
    };
  }

  if (/stay on sky drop|keep chat|dispute/.test(normalized)) {
    return {
      text: "Keep deals in **Messages** so disputes and reports have a record. Stripe buyers: open disputes from **Purchases** within 7 days.",
      navigateTo: "/faqs",
      destination: GUIDE_DESTINATIONS.find((d) => d.id === "faqs"),
    };
  }

  return {
    text: SKY_AI_GENERIC_FALLBACK,
  };
}

export const SKY_AI_GENERIC_FALLBACK =
  'Tell me what you need — e.g. create a listing, price help, safety tips, or "take me to seller guidelines". Tap a quick button below too.';

export const GUIDE_QUICK_PROMPTS: { label: string; query: string }[] = [
  { label: "Seller guidelines", query: "Take me to seller guidelines" },
  { label: "Bank setup", query: "Arrange purchase bank setup" },
  { label: "Payment settings", query: "Open payment settings" },
  { label: "Sell", query: "Take me to sell / create a listing" },
  { label: "Messages", query: "Go to messages" },
  { label: "FAQs", query: "Open FAQs" },
];
