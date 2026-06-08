/** Shared Sky Drop marketplace theme — matches the homepage (`/`). */
export const HOME_MARKETPLACE_THEME = {
  accentRgb: "14, 165, 233",
  heroShadow: "shadow-[0_0_150px_-20px_rgba(14,165,233,0.12)]",
  radial:
    "bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(14,165,233,0.12),transparent)]",
  titleGradient:
    "hero-title-gradient from-[var(--foreground)] via-sky-500 to-[var(--foreground)]",
  searchGlow: "from-sky-500/40 via-violet-500/40 to-sky-500/40",
  searchFocus: "focus-within:ring-sky-500/30 focus-within:border-sky-500/40",
  listBtn: "from-sky-500 to-sky-400 shadow-sky-500/20",
  sellLink:
    "border-sky-400/25 from-sky-500/10 via-violet-500/10 to-sky-500/10 text-sky-200 ring-sky-400/10 hover:border-sky-400/40 hover:bg-sky-500/15",
  barGradient: "from-sky-500 to-violet-500",
  hotBarGradient: "from-sky-500 to-violet-500",
  filterLabel: "text-sky-400/90",
  filterFocus: "focus:border-sky-500/40",
  hotBadge: "bg-gradient-to-r from-sky-500/90 to-violet-500/90",
  recentPrice: "text-white",
  recentHover:
    "hover:border-sky-500/40 hover:shadow-[0_8px_25px_rgba(14,165,233,0.15)]",
  placeholderGradient: "from-sky-500/10 via-violet-500/10 to-sky-500/10",
  hotCardHover:
    "hover:border-white/[0.12] hover:shadow-[0_0_30px_rgba(14,165,233,0.12),0_0_60px_rgba(14,165,233,0.04)]",
} as const;

export type BrowseCategoryConfig = {
  listingType: string;
  emoji: string;
  pageTitle: string;
  subtitle: string;
  searchPlaceholder: string;
  listCtaShort: string;
  listCtaLong: string;
  sellCta: string;
  postAiType: string;
  trendingFallback: string;
  itemSingular: string;
  itemPlural: string;
  listingsHeading: string;
  emptyTitle: string;
  emptySubtitle: string;
  filterMode: "region" | "category";
  categories?: string[];
  extraSearchFields?: (item: Record<string, unknown>) => string[];
  trustRow: [string, string, string];
};

export const BROWSE_CATEGORY_CONFIGS: Record<string, BrowseCategoryConfig> = {
  vehicle: {
    listingType: "vehicle",
    emoji: "🚗",
    pageTitle: "Vehicles Marketplace",
    subtitle:
      "Browse cars, trucks, motorbikes, and more. Buy or bid on vehicles across New Zealand.",
    searchPlaceholder: "Search make, model, title, location...",
    listCtaShort: "List",
    listCtaLong: "List a Vehicle with Awhina",
    sellCta: "Sell a Vehicle with Awhina",
    postAiType: "vehicle",
    trendingFallback: "🔥 Trending vehicles across New Zealand",
    itemSingular: "vehicle",
    itemPlural: "vehicles",
    listingsHeading: "Vehicle Listings",
    emptyTitle: "No vehicles listed yet",
    emptySubtitle: "Be the first to list a vehicle.",
    filterMode: "region",
    extraSearchFields: (item) =>
      [
        item.vehicleMake,
        item.vehicleModel,
        item.make,
        item.model,
        item.vehicleBodyType,
        item.vehicleFuelType,
        item.vehicleTransmission,
        item.fuelType,
        item.transmission,
        item.vehicleColour,
        item.year,
        item.vehicleYear,
      ].filter(Boolean) as string[],
    trustRow: [
      "🔍 Browse & filter by region",
      "💰 Buy or bid with confidence",
      "🛡️ Buyer protection included",
    ],
  },
  rental: {
    listingType: "rental",
    emoji: "🔑",
    pageTitle: "Rentals Marketplace",
    subtitle:
      "Rent homes, rooms, vehicles, tools, and equipment. Message the owner to arrange pickup and return.",
    searchPlaceholder: "Search rentals, location, category...",
    listCtaShort: "List",
    listCtaLong: "List a Rental with Awhina",
    sellCta: "List a Rental with Awhina",
    postAiType: "rental",
    trendingFallback: "🔥 Trending rentals across New Zealand",
    itemSingular: "rental",
    itemPlural: "rentals",
    listingsHeading: "Rental Listings",
    emptyTitle: "No rentals yet",
    emptySubtitle: "Be the first to list a rental.",
    filterMode: "region",
    trustRow: [
      "🔍 Browse & filter by region",
      "💬 Message owners directly",
      "🛡️ Secure booking through Sky Drop",
    ],
  },
  service: {
    listingType: "service",
    emoji: "🛠️",
    pageTitle: "Services Marketplace",
    subtitle:
      "Hire freelancers for web development, design, writing, video, music, and more across New Zealand.",
    searchPlaceholder: "Search services, skills, location...",
    listCtaShort: "List",
    listCtaLong: "List a Service with Awhina",
    sellCta: "Offer a Service with Awhina",
    postAiType: "service",
    trendingFallback: "🔥 Trending services across New Zealand",
    itemSingular: "service",
    itemPlural: "services",
    listingsHeading: "Service Listings",
    emptyTitle: "No services listed yet",
    emptySubtitle: "Be the first to offer a service.",
    filterMode: "category",
    categories: [
      "All",
      "Web Development",
      "Design & Creative",
      "Writing & Translation",
      "Video & Animation",
      "Music & Audio",
      "Consulting",
      "Photography",
      "Tutoring",
    ],
    trustRow: [
      "🔍 Browse by category",
      "💬 Discuss scope in chat",
      "🛡️ Pay securely with Card Checkout",
    ],
  },
  digital: {
    listingType: "digital",
    emoji: "📥",
    pageTitle: "Digital Marketplace",
    subtitle:
      "Buy and sell templates, e-books, art, software, gaming assets, and instant digital downloads.",
    searchPlaceholder: "Search digital products, category...",
    listCtaShort: "List",
    listCtaLong: "List a Digital Product with Awhina",
    sellCta: "Sell Digital with Awhina",
    postAiType: "digital",
    trendingFallback: "🔥 Trending digital products across New Zealand",
    itemSingular: "listing",
    itemPlural: "listings",
    listingsHeading: "Digital Listings",
    emptyTitle: "No digital products yet",
    emptySubtitle: "Be the first to list a digital product.",
    filterMode: "category",
    categories: [
      "All",
      "Templates & Assets",
      "E-books & Guides",
      "Art & Photography",
      "Software & Audio",
      "Gaming & 3D",
    ],
    trustRow: [
      "🔍 Browse by category",
      "⚡ Instant digital delivery",
      "🛡️ Buyer protection included",
    ],
  },
  property: {
    listingType: "property",
    emoji: "🏠",
    pageTitle: "Property Marketplace",
    subtitle:
      "Find homes, apartments, land, and commercial property across New Zealand. Buy, auction, or enquire.",
    searchPlaceholder: "Search property, location, type...",
    listCtaShort: "List",
    listCtaLong: "List Property with Awhina",
    sellCta: "List Property with Awhina",
    postAiType: "property",
    trendingFallback: "🔥 Trending property across New Zealand",
    itemSingular: "property",
    itemPlural: "properties",
    listingsHeading: "Property Listings",
    emptyTitle: "No property listed yet",
    emptySubtitle: "Be the first to list a property.",
    filterMode: "region",
    extraSearchFields: (item) =>
      [item.propertyType, item.bedrooms, item.bathrooms, item.landArea].filter(
        Boolean
      ) as string[],
    trustRow: [
      "🔍 Browse & filter by region",
      "💬 Contact sellers directly",
      "🛡️ Secure payments through Sky Drop",
    ],
  },
  job: {
    listingType: "job",
    emoji: "💼",
    pageTitle: "Jobs Marketplace",
    subtitle:
      "Find your next role — browse job listings across New Zealand and apply directly.",
    searchPlaceholder: "Search jobs, company, location...",
    listCtaShort: "Post",
    listCtaLong: "Post a Job with Awhina",
    sellCta: "Post a Job with Awhina",
    postAiType: "job",
    trendingFallback: "🔥 Trending jobs across New Zealand",
    itemSingular: "job",
    itemPlural: "jobs",
    listingsHeading: "Job Listings",
    emptyTitle: "No jobs listed yet",
    emptySubtitle: "Be the first to post a job.",
    filterMode: "category",
    categories: [
      "All",
      "IT & Tech",
      "Sales & Marketing",
      "Accounting & Finance",
      "Construction & Trades",
      "Healthcare & Education",
      "Hospitality & Tourism",
      "Other",
    ],
    extraSearchFields: (item) =>
      [item.company, item.employmentType].filter(Boolean) as string[],
    trustRow: [
      "🔍 Browse by industry",
      "💬 Apply directly in chat",
      "🛡️ Verified employer profiles",
    ],
  },
  event: {
    listingType: "event",
    emoji: "🎟",
    pageTitle: "Events Marketplace",
    subtitle:
      "Find tickets for concerts, festivals, workshops, sports, and local events near you.",
    searchPlaceholder: "Search events, venue, location...",
    listCtaShort: "List",
    listCtaLong: "List an Event with Awhina",
    sellCta: "List an Event with Awhina",
    postAiType: "event",
    trendingFallback: "🔥 Trending events across New Zealand",
    itemSingular: "event",
    itemPlural: "events",
    listingsHeading: "Event Listings",
    emptyTitle: "No events listed yet",
    emptySubtitle: "Be the first to list an event.",
    filterMode: "category",
    categories: [
      "All",
      "Concerts & Gigs",
      "Festivals",
      "Sports",
      "Workshops & Classes",
      "Community",
      "Food & Drink",
      "Other",
    ],
    extraSearchFields: (item) =>
      [item.venue, item.eventTime].filter(Boolean) as string[],
    trustRow: [
      "🔍 Browse by category",
      "🎟 Buy tickets securely",
      "🛡️ Buyer protection included",
    ],
  },
};
