/** Phonetic matching for voice commands — handles common STT mishearings and fuzzy matching. */

/* ── Direct phonetic substitution map ── */
// Maps what STT often hears → what the user likely meant
/** Never phonetically rewrite these — "sales" contains "sale" but means Sales page. */
const PROTECTED_COMPACTS = new Set([
  "sales",
  "sails",
  "sals",
  "mysales",
  "salespage",
  "solditems",
  "mysold",
]);

const PHONETIC_SUBSTITUTIONS: Record<string, string[]> = {
  // Sell page — STT often hears "sells" or "cells" for "sell" (not Sales)
  cells: ["sell"],
  sells: ["sell"],
  sals: ["sales"],
  sails: ["sales"],
  sail: ["sell"],
  sale: ["sell"],

  // Profile
  profiel: ["profile"],
  profil: ["profile"],
  prophile: ["profile"],
  profile: ["profile"],
  prof: ["profile"],

  // Messages
  massages: ["messages"],
  messags: ["messages"],
  mesages: ["messages"],
  inboxs: ["messages"],
  mesagges: ["messages"],
  messeges: ["messages"],

  // Payments
  paymants: ["payments"],
  paymints: ["payments"],
  paymint: ["payments"],
  billings: ["payments"],
  wallit: ["wallet", "payments"],

  // Purchases
  purchas: ["purchases"],
  purches: ["purchases"],
  purchis: ["purchases"],
  purch: ["purchases"],

  // Watchlist
  watchlit: ["watchlist"],
  watchlist: ["watchlist"],
  favourits: ["favorites", "favourites", "watchlist"],
  favorits: ["favorites", "favourites", "watchlist"],
  wichlist: ["watchlist"],
  wishlist: ["watchlist"],

  // Listings
  listins: ["listings"],
  listngs: ["listings"],
  listing: ["listings"],

  // Vehicles
  vihicles: ["vehicles"],
  vehicls: ["vehicles"],
  vecals: ["vehicles"],
  vihicle: ["vehicles"],
  vheicles: ["vehicles"],

  // Services
  servises: ["services"],
  servics: ["services"],
  survices: ["services"],
  servic: ["services"],

  // Rentals
  rentls: ["rentals"],
  rintals: ["rentals"],
  rentel: ["rentals"],
  rentals: ["rentals"],

  // Notifications
  notifcations: ["notifications"],
  notificashuns: ["notifications"],
  notif: ["notifications"],
  notificashon: ["notifications"],

  // Dashboard
  dashbord: ["dashboard"],
  dashbard: ["dashboard"],
  dash: ["dashboard"],
  dashboad: ["dashboard"],

  // Admin
  admen: ["admin"],
  admine: ["admin"],
  admn: ["admin"],

  // Digital
  digitl: ["digital"],
  dijital: ["digital"],

  // Reviews
  revews: ["reviews"],
  revues: ["reviews"],
  revws: ["reviews"],
  ratins: ["ratings", "reviews"],

  // Search
  serch: ["search"],
  brous: ["browse"],
  surch: ["search"],
  sarch: ["search"],
  brwose: ["browse"],

  // Home
  hoam: ["home"],
  hom: ["home"],
  hompage: ["home"],
  mainpage: ["home"],

  // Awhina / Sky Drop
  athena: ["awhina"],
  awina: ["awhina"],
  ahina: ["awhina"],
  awhina: ["awhina"],

  // Settings
  settins: ["settings"],
  settngs: ["settings"],
  setings: ["settings"],
  prefrences: ["preferences", "settings"],

  // Security
  secrity: ["security"],
  sucurity: ["security"],
  secutity: ["security"],

  // Verification
  verifcation: ["verification"],
  verificashun: ["verification"],
  verefy: ["verify", "verification"],

  // Help
  halp: ["help"],
  saport: ["support", "help"],
  helpp: ["help"],

  // Analytics
  analitics: ["analytics"],
  analytix: ["analytics"],
  insites: ["insights", "analytics"],

  // Opportunities
  oportunities: ["opportunities"],
  oppertunities: ["opportunities"],
  oportinities: ["opportunities"],

  // Auctions
  awkshuns: ["auctions"],
  ocshuns: ["auctions"],
  auktion: ["auction", "auctions"],

  // Checkout
  chekout: ["checkout"],

  // Disputes
  displuts: ["disputes"],

  // Offers
  offrs: ["offers"],
  offas: ["offers"],

  // Events
  evnts: ["events"],

  // Jobs
  jobbs: ["jobs"],

  // Drafts
  drafst: ["drafts"],

  // Stats
  statss: ["stats", "statistics"],
};

/* ── Character-level normalization ── */
const PHONETIC_PATTERNS: [RegExp, string][] = [
  [/\bc\b/g, "s"],          // isolated 'c' → 's' (e.g., "cells" → "sells")
  [/ck/g, "k"],              // 'ck' → 'k'
  [/ph/g, "f"],              // 'ph' → 'f'
  [/kn/g, "n"],              // 'kn' → 'n'
  [/gh/g, ""],               // silent 'gh'
  [/(.)\1+/g, "$1"],         // collapse repeated chars ("sss" → "s")
  [/[aeiou]{2,}/g, "a"],     // collapse vowel clusters to single 'a'
  [/[^a-z0-9]/g, ""],        // strip non-alpha
];

/**
 * Normalize text phonetically — strips vowels, collapses repeats,
 * so "cells" and "sales" become more similar.
 */
export function phoneticNormalize(text: string): string {
  let t = text.toLowerCase().trim();
  for (const [pattern, replacement] of PHONETIC_PATTERNS) {
    t = t.replace(pattern, replacement as string);
  }
  return t.trim();
}

/**
 * Compute a simple phonetic similarity score (0–1).
 * 1.0 = exact match after phonetic normalization.
 */
export function phoneticSimilarity(a: string, b: string): number {
  const na = phoneticNormalize(a);
  const nb = phoneticNormalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen > 0 ? 1 - dist / maxLen : 0;
}

/** Basic Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Resolve a potentially misheard phrase to what the user likely meant.
 * Returns the corrected phrase, or the original if no correction found.
 */
export function resolvePhonetic(text: string): string {
  const normalized = text.toLowerCase().trim();
  const compact = normalized.replace(/[^a-z0-9]/g, "");

  if (PROTECTED_COMPACTS.has(compact)) {
    return text;
  }

  const substitution = PHONETIC_SUBSTITUTIONS[compact];
  if (substitution && substitution.length > 0) {
    return substitution[0];
  }

  return text;
}

/**
 * Check if two phrases are likely the same despite STT differences.
 */
export function isPhoneticMatch(a: string, b: string): boolean {
  return phoneticSimilarity(a, b) >= 0.7;
}
