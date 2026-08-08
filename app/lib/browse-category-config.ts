/** Shared Sky Drop marketplace theme — matches the homepage (`/`). */
export const HOME_MARKETPLACE_THEME = {
  accentRgb: "14, 165, 233",
  heroShadow: "shadow-sm",
  radial:
    "bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(14,165,233,0.08),transparent)]",
  badge:
    "inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/[0.07] px-3.5 py-1 text-[11px] font-semibold text-sky-300 mb-3 tracking-wider uppercase",
  titleGradient: "from-white via-sky-100 to-white",
  titleDropShadow: "",
  searchGlow: "from-sky-500/20 via-sky-500/20 to-sky-500/20",
  searchFocus:
    "focus-within:ring-2 focus-within:ring-sky-500/25 focus-within:border-sky-500/35",
  listBtn: "from-sky-500 to-sky-400",
  sellLink:
    "border-sky-400/25 from-sky-500/10 via-sky-500/5 to-sky-500/10 text-sky-200 ring-sky-400/10 hover:border-sky-400/40 hover:bg-sky-500/15",
  barGradient: "from-sky-500 to-sky-400",
  hotBarGradient: "from-sky-500 to-sky-400",
  filterLabel: "text-sky-400/90",
  filterFocus: "focus:border-sky-500/40",
  hotBadge: "bg-sky-500/90",
  recentPrice: "text-white",
  recentHover: "hover:border-sky-500/35 hover:shadow-[var(--shadow-sm)]",
  placeholderGradient: "from-sky-500/10 via-sky-500/5 to-sky-500/10",
  hotCardHover: "hover:border-white/[0.12] hover:shadow-[var(--shadow-md)]",
} as const;

export type BrowseCategoryConfig = {
  listingType: string;
  /** Optional short label for empty states (no emoji). */
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
  trustRow: [string, string, string];
};

export const BROWSE_CATEGORY_CONFIGS: Record<string, BrowseCategoryConfig> = {
  rental: {
    listingType: "rental",
    emoji: "R",
    pageTitle: "Rentals Marketplace",
    subtitle:
      "Rent vehicles, tools, and equipment. Message the owner to arrange pickup and return.",
    searchPlaceholder: "Search rentals, location, category...",
    listCtaShort: "List",
    listCtaLong: "List something for rent",
    sellCta: "List something for rent",
    postAiType: "rental",
    trendingFallback: "Trending rentals across New Zealand",
    itemSingular: "rental",
    itemPlural: "rentals",
    listingsHeading: "Rental Listings",
    emptyTitle: "No rentals yet",
    emptySubtitle: "Be the first to list something for rent.",
    filterMode: "region",
    trustRow: [
      "Browse & filter by region",
      "Message owners directly",
      "Arrange pickup in chat",
    ],
  },
  service: {
    listingType: "service",
    emoji: "S",
    pageTitle: "Services Marketplace",
    subtitle:
      "Find local services across New Zealand — trades, cleaning, tutoring, photography, and more.",
    searchPlaceholder: "Search services, location...",
    listCtaShort: "List",
    listCtaLong: "Offer a service",
    sellCta: "Offer a service",
    postAiType: "service",
    trendingFallback: "Trending services across New Zealand",
    itemSingular: "service",
    itemPlural: "services",
    listingsHeading: "Service Listings",
    emptyTitle: "No services yet",
    emptySubtitle: "Be the first to offer a service.",
    filterMode: "category",
    categories: [
      "All",
      "Trades & Repairs",
      "Cleaning & Maintenance",
      "Tutoring & Lessons",
      "Photography",
      "Personal Training",
      "Events & Catering",
      "Other Services",
    ],
    trustRow: [
      "Browse by category",
      "Discuss scope in chat",
      "Message seller to arrange",
    ],
  },
  job: {
    listingType: "job",
    emoji: "J",
    pageTitle: "Jobs Marketplace",
    subtitle:
      "Find your next role — browse job listings across New Zealand and apply directly.",
    searchPlaceholder: "Search jobs, company, location...",
    listCtaShort: "Post",
    listCtaLong: "Post a Job with Awhina",
    sellCta: "Post a Job with Awhina",
    postAiType: "job",
    trendingFallback: "Trending jobs across New Zealand",
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
    trustRow: [
      "Browse by industry",
      "Apply directly in chat",
      "Verified employer profiles",
    ],
  },
  event: {
    listingType: "event",
    emoji: "E",
    pageTitle: "Events Marketplace",
    subtitle:
      "Find tickets for concerts, festivals, workshops, sports, and local events near you.",
    searchPlaceholder: "Search events, venue, location...",
    listCtaShort: "List",
    listCtaLong: "List an Event with Awhina",
    sellCta: "List an Event with Awhina",
    postAiType: "event",
    trendingFallback: "Trending events across New Zealand",
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
    trustRow: [
      "Browse by category",
      "Message the organiser",
      "Agree tickets in chat",
    ],
  },
  vehicle: {
    listingType: "vehicle",
    emoji: "V",
    pageTitle: "Vehicles Marketplace",
    subtitle:
      "Buy and sell cars, utes, vans, motorcycles, and boats across New Zealand.",
    searchPlaceholder: "Search make, model, location...",
    listCtaShort: "List",
    listCtaLong: "List a vehicle",
    sellCta: "List a vehicle",
    postAiType: "vehicle",
    trendingFallback: "Trending vehicles across New Zealand",
    itemSingular: "vehicle",
    itemPlural: "vehicles",
    listingsHeading: "Vehicle Listings",
    emptyTitle: "No vehicles yet",
    emptySubtitle: "Be the first to list a vehicle for sale.",
    filterMode: "region",
    trustRow: [
      "Browse by region",
      "Message sellers directly",
      "Arrange viewing in chat",
    ],
  },
  property: {
    listingType: "property",
    emoji: "P",
    pageTitle: "Property Marketplace",
    subtitle:
      "Browse property listings for sale across New Zealand.",
    searchPlaceholder: "Search location, property type...",
    listCtaShort: "List",
    listCtaLong: "List a Property with Awhina",
    sellCta: "List a Property with Awhina",
    postAiType: "property",
    trendingFallback: "Trending property across New Zealand",
    itemSingular: "property",
    itemPlural: "properties",
    listingsHeading: "Property Listings",
    emptyTitle: "No property listed yet",
    emptySubtitle: "Be the first to list a property.",
    filterMode: "region",
    trustRow: [
      "Browse by region",
      "Contact agents & sellers",
      "Secure messaging on Sky Drop",
    ],
  },
};

export type BrowseCategoryKey = keyof typeof BROWSE_CATEGORY_CONFIGS;
