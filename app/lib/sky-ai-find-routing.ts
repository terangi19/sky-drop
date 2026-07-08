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
  const cleaned = message
    .replace(
      /\b(find me|find a|find an|show me|looking for|search for|want to buy|wanna buy|need a|need an|iso|in search of|hunting for|anyone selling|for sale)\b/gi,
      " "
    )
    .replace(/\b(a|an|the|under|near|in|around|within|budget|max|up to)\b/gi, " ")
    .replace(/\$[\d,]+(?:\.\d{2})?/g, " ")
    .replace(/\b[\d,]+\s*k\b/gi, " ")
    .replace(/\b(auckland|wellington|christchurch|hamilton|tauranga|dunedin)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length >= 3) return cleaned;
  return "what you're after";
}
