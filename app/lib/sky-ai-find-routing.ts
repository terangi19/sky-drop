/**
 * Category inference for find / browse requests.
 * Car parts and accessories must never route to /vehicles.
 */

export type FindBrowseCategory = "physical" | "vehicle" | "service" | "rental" | "digital" | "all";

export type FindBrowseRoute = {
  /** Navigation path including search query when applicable */
  path: string;
  category: FindBrowseCategory;
  /** Human-readable label for replies */
  categoryLabel: string;
  searchTerm: string;
};

const VEHICLE_MAKES =
  /\b(bmw|toyota|mazda|honda|ford|nissan|holden|subaru|mitsubishi|hyundai|kia|volkswagen|vw|audi|mercedes|benz|lexus|isuzu|suzuki|peugeot|renault|volvo|land rover|range rover|jeep|dodge|chevrolet|chevy)\b/i;

const VEHICLE_BODY_WORDS =
  /\b(car|cars|vehicle|vehicles|ute|utes|van|vans|motorcycle|motorbike|motorbikes|bike|bikes|truck|trucks|suv|suvs|4wd|4x4|wagon|wagons|sedan|sedans|hatchback|hatchbacks|boat|boats|camper|caravan|caravans|trailer|trailers)\b/i;

const VEHICLE_MODELS =
  /\b(hilux|ranger|corolla|civic|axela|demio|outlander|pajero|l200|d-max|dmax|navara|amarok|commodore|falcon|forester|impreza|golf|polo|focus|fiesta|mustang|camry|rav4|cx-5|cx5|cx-3|cx3|santa fe|tucson|i30|i20|leaf|x-trail|xtrail|patrol|pulsar|lancer|legacy|outback|wrx|sti|335i|330i|320i|320d|328i|340i|m3|m4|m5|x5|x3|x1|118i|120i|125i|86|brz|supra|yaris|aurion|kluger|highlander|landcruiser|land cruiser|prado|fortuner|everest|mu-x|mux|triton|colorado|civic|accord|cr-v|crv|hr-v|hrv|jazz|fit|odyssey|s2000|nsx|leaf|qashqai|juke|leaf|leaf|leaf)\b/i;

const BMW_MODEL_CODE = /\b[1-8]\d{2}[a-z]?\b/i;

const VEHICLE_PART_TERMS =
  /\b(spoiler|spoilers|bumper|bumpers|bonnet|bonnets|hood|hoods|lip|lips|diffuser|diffusers|wheel|wheels|rim|rims|tyre|tyres|tire|tires|exhaust|turbo|turbos|intercooler|intercoolers|mirror cap|mirror caps|headlight|headlights|taillight|taillights|tail light|tail lights|steering wheel|seat|seats|engine part|engine parts|parts?|accessory|accessories|coilover|coilovers|spring|springs|strut|struts|brake pad|brake pads|rotor|rotors|caliper|caliipers|header|headers|downpipe|downpipes|muffler|mufflers|wing|wings|fender|fenders|guard|guards|panel|panels|grille|grill|badge|badges|shift knob|intake|manifold|clutch|flywheel|driveshaft|prop shaft|suspension|bushing|bushings|mount|mounts|strut bar|roll cage|harness|floor mat|floor mats|roof rack|tow bar|towbar|hitch|bodykit|body kit|splitter|side skirt|side skirts|catalytic|catback|cat back|gearbox|transmission|alternator|starter motor|radiator|oil cooler|oil filter|air filter|spark plug|spark plugs|injector|injectors|camshaft|crankshaft|piston|pistons|gasket|gaskets|oil pan|sump|shock|shocks|sway bar|control arm|ball joint|wheel bearing|hub|hubs|n54|n55|b58|s55|s58|e36|e46|e90|e92|e93|f30|f32|f80|g20|g30|g80)\b/i;

const SERVICE_HINTS =
  /\b(lawn mowing|mow my lawn|mowing|cleaning|cleaner|plumber|plumbing|electrician|handyman|tutor|tutoring|dog walking|pet sitting|massage|photographer|photography|graphic design|web design)\b/i;

const RENTAL_HINTS =
  /\b(rent|rental|flat to rent|apartment|bedroom|tenancy|bond|weekly rent|room for rent|house for rent)\b/i;

const DIGITAL_HINTS = /\b(ebook|e-book|template|software|digital download|invoice bundle|preset pack)\b/i;

const GENERIC_VEHICLE_BROWSE =
  /\b(show me|browse|find)\b[\s\S]{0,30}\b(cars?|vehicles?|utes?|vans?|motorcycles?|motorbikes?|trucks?)\b/i;

export function isVehiclePartQuery(message: string, searchTerm: string): boolean {
  const combined = `${message} ${searchTerm}`.toLowerCase();
  if (VEHICLE_PART_TERMS.test(combined)) return true;
  if (/\b(parts?|accessories?)\b/.test(combined) && VEHICLE_MAKES.test(combined)) return true;
  if (/\b\d{2}\s*inch\b/.test(combined) && /\b(wheel|rim|tyre|tire)\b/.test(combined)) return true;
  return false;
}

export function isActualVehicleQuery(message: string, searchTerm: string): boolean {
  if (isVehiclePartQuery(message, searchTerm)) return false;

  const combined = `${message} ${searchTerm}`.toLowerCase();

  if (GENERIC_VEHICLE_BROWSE.test(message) && !VEHICLE_PART_TERMS.test(combined)) return true;

  if (/\b(19|20)\d{2}\b/.test(combined) && VEHICLE_MAKES.test(combined)) return true;

  if (VEHICLE_MODELS.test(combined)) return true;

  if (VEHICLE_MAKES.test(combined) && BMW_MODEL_CODE.test(combined)) return true;

  if (VEHICLE_BODY_WORDS.test(combined) && !VEHICLE_PART_TERMS.test(combined)) return true;

  return false;
}

const NZ_CITIES =
  /\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne)\b/i;

const FIND_PRODUCT_ALIASES: Record<string, string> = {
  iphone: "iPhone",
  iphones: "iPhone",
  ps5: "PS5",
  ps4: "PS4",
  xbox: "Xbox",
  macbook: "MacBook",
  ipad: "iPad",
  airpods: "AirPods",
};

/** Parse max-price filter from find messages — supports "under 400", "under $600", "under 10k". */
export function parseFindBudget(message: string): string | undefined {
  const m = message.match(
    /\b(?:under|up to|max|budget|less than|below|max(?:imum)?\s*price)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|K)?\b/i
  );
  if (!m) return undefined;
  let num = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return undefined;
  if (m[2]) num *= 1000;
  return String(Math.round(num));
}

const NZ_CITY_NAMES =
  "auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston north|new plymouth|rotorua|queenstown|invercargill|nelson|whangarei|gisborne";

function titleCaseCity(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function parseFindCity(message: string): string | undefined {
  const match = message.match(
    new RegExp(
      `\\b(?:in|near|around|within|location(?:\\s+is)?|located(?:\\s+in)?|based(?:\\s+in)?)\\s+(${NZ_CITY_NAMES})\\b`,
      "i"
    )
  );
  if (!match) return undefined;
  return titleCaseCity(match[1]);
}

/** Vehicle model year 1900–2099 — never treat as price by itself. */
export function parseVehicleYear(message: string): string | undefined {
  const years = [...message.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => m[1]);
  for (const y of years) {
    const n = Number(y);
    if (n >= 1900 && n <= 2099) return y;
  }
  return undefined;
}

export function parseVehicleMake(message: string): string | undefined {
  const m = message.match(VEHICLE_MAKES);
  if (!m) return undefined;
  const raw = m[1];
  if (/^bmw$/i.test(raw)) return "BMW";
  if (/^vw$/i.test(raw)) return "Volkswagen";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function parseVehicleModel(message: string): string | undefined {
  const m = message.match(VEHICLE_MODELS);
  if (!m) return undefined;
  return m[1];
}

/** True when a 4-digit number is a plausible calendar/vehicle year, not a dollar amount. */
export function looksLikeVehicleYearToken(token: string, message?: string): boolean {
  if (!/^(19|20)\d{2}$/.test(token)) return false;
  if (!message) return true;
  // Explicit price context around this year token → not a year-as-price guard
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const priceCtx = new RegExp(
    `(?:\\$\\s*${escaped}|\\b(?:price|budget|under|up to|max|for)\\s*\\$?\\s*${escaped}\\b)`,
    "i"
  );
  // "$2007" or "price 2007" is price; bare "2007" next to make/model is year
  if (priceCtx.test(message) && /\$/.test(message)) return false;
  if (/\b(?:price|make it|set(?:\s+it)?|change(?:\s+it)?)\s*\$?\s*/i.test(message) &&
      new RegExp(`\\b${escaped}\\b`).test(message) &&
      !VEHICLE_MAKES.test(message) &&
      !VEHICLE_MODELS.test(message)) {
    return false;
  }
  return true;
}

export function normalizeFindSearchTerm(term: string): string {
  const lower = term.toLowerCase();
  for (const [key, value] of Object.entries(FIND_PRODUCT_ALIASES)) {
    if (lower === key) return value;
    if (lower.startsWith(`${key} `)) return value + term.slice(key.length);
  }
  if (/\bbmw\b/i.test(term)) {
    return term.replace(/\bbmw\b/i, "BMW");
  }
  return term;
}

export function buildFindSearchPath(options: {
  q: string;
  maxPrice?: string;
  location?: string;
}): string {
  const params = new URLSearchParams();
  const term = options.q.trim();
  if (term) params.set("q", term);
  if (options.maxPrice) params.set("maxPrice", options.maxPrice);
  if (options.location) params.set("location", options.location);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function inferFindBrowseCategory(message: string, searchTerm: string): FindBrowseCategory {
  const lower = message.toLowerCase();

  if (isVehiclePartQuery(message, searchTerm)) return "physical";
  if (isActualVehicleQuery(message, searchTerm)) return "vehicle";
  if (RENTAL_HINTS.test(lower)) return "rental";
  if (SERVICE_HINTS.test(lower)) return "service";
  if (DIGITAL_HINTS.test(lower)) return "digital";
  if (/\b(ps5|playstation|xbox|gaming|switch|laptop|phone|iphone|couch|furniture|drill|tool|mower|fridge|kayak)\b/i.test(lower)) {
    return "physical";
  }
  if (VEHICLE_MAKES.test(lower)) return "physical";
  return "all";
}

function categoryLabel(category: FindBrowseCategory): string {
  switch (category) {
    case "physical":
      return "Physical Items";
    case "vehicle":
      return "Vehicles";
    case "service":
      return "Services";
    case "rental":
      return "Rentals";
    case "digital":
      return "Digital Products";
    default:
      return "All listings";
  }
}

function categoryBrowsePath(category: FindBrowseCategory): string {
  switch (category) {
    case "vehicle":
      return "/vehicles";
    case "service":
      return "/services";
    case "rental":
      return "/rentals";
    case "digital":
      return "/digital";
    default:
      return "/";
  }
}

export function resolveFindBrowseRoute(
  message: string,
  options?: { budget?: string; city?: string; searchTerm?: string }
): FindBrowseRoute {
  const searchTerm = options?.searchTerm?.trim() || extractFindSearchTerm(message);
  const category = inferFindBrowseCategory(message, searchTerm);
  const label = categoryLabel(category);

  const hasSpecificTerm = searchTerm.length >= 3 && searchTerm !== "what you're after";

  if (hasSpecificTerm) {
    return {
      path: buildFindSearchPath({
        q: searchTerm,
        maxPrice: options?.budget,
        location: options?.city,
      }),
      category,
      categoryLabel: label,
      searchTerm,
    };
  }

  if (category === "vehicle" && GENERIC_VEHICLE_BROWSE.test(message)) {
    const path = options?.budget
      ? buildFindSearchPath({ q: "cars", maxPrice: options.budget, location: options?.city })
      : "/vehicles";
    return { path, category, categoryLabel: label, searchTerm };
  }

  return {
    path: categoryBrowsePath(category),
    category,
    categoryLabel: label,
    searchTerm,
  };
}

export function extractFindSearchTerm(message: string): string {
  // Preserve quoted product text while stripping dialogue control tokens
  const preserved: string[] = [];
  const withQuotes = message.replace(/"([^"]+)"|'([^']+)'/g, (_m, d, s) => {
    const idx = preserved.length;
    preserved.push(d || s || "");
    return `__Q${idx}__`;
  });
  const cleaned = withQuotes
    .replace(
      /\b(find me|find a|find an|show me|looking for|search for|want to buy|wanna buy|wanna|want a|want an|i want a|i want an|i want|need someone(?:\s+to)?|need a|need an|i need a|i need an|i need|iso|in search of|hunting for|anyone selling|for sale)\b/gi,
      " "
    )
    // Dialogue acknowledgements are control tokens — never search keywords
    .replace(
      /(^|\s)(yes|yep|yeah|yup|ya|ok|okay|sure|alright|all\s+right|sounds\s+good|go\s+ahead|please|cool)(?=\s|$|[.,!?])/gi,
      " "
    )
    .replace(/\b(find|search|show|list)\s+listings?\b/gi, " ")
    .replace(/\blistings?\b/gi, " ")
    .replace(
      /\b(?:under|up to|max|budget|less than|below|max(?:imum)?\s*price)\s*\$?\s*[\d,]+(?:\.\d+)?\s*k?\b/gi,
      " "
    )
    .replace(
      new RegExp(
        `\\b(?:location(?:\\s+is)?|located(?:\\s+in)?|based(?:\\s+in)?)\\s+(${NZ_CITY_NAMES})\\b`,
        "gi"
      ),
      " "
    )
    .replace(/\b(a|an|the|near|in|around|within|and|with|for)\b/gi, " ")
    // Keep model codes; strip bare years from query display (year goes to filters)
    .replace(/\b((?:19|20)\d{2})\b/g, " ")
    .replace(/\$[\d,]+(?:\.\d{2})?/g, " ")
    .replace(/\b[\d,]+\s*k\b/gi, " ")
    .replace(NZ_CITIES, " ")
    .replace(/__Q(\d+)__/g, (_m, i) => {
      const text = preserved[Number(i)] || "";
      return text ? ` ${text} ` : " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length >= 2) return normalizeFindSearchTerm(cleaned);
  return "what you're after";
}

/** Parse navigation URL params from a find search path. */
export function parseFindSearchPath(path: string): {
  q?: string;
  maxPrice?: string;
  location?: string;
} {
  if (!path.startsWith("/search")) return {};
  try {
    const params = new URL(path, "https://skydrop.co.nz").searchParams;
    return {
      q: params.get("q") || undefined,
      maxPrice: params.get("maxPrice") || undefined,
      location: params.get("location") || undefined,
    };
  } catch {
    return {};
  }
}
