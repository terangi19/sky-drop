/**
 * Āwhina evaluation scenarios — regression suite for task completion, intent, and tone.
 * Run: npm test -- sky-ai-evaluation
 *
 * Live LLM eval: use scripts/run-sky-ai-eval.cjs (optional) against OPENAI_API_KEY.
 */

export type SkyAiEvalExpectedAction =
  | "listing_fill"
  | "navigate"
  | "price_estimate"
  | "next_step"
  | "clarifying_question"
  | "safety_guidance"
  | "no_hallucinated_listing";

export type SkyAiEvalScenario = {
  id: string;
  category: string;
  userMessage: string;
  pathname?: string;
  draftContext?: string;
  expectedIntent?: string;
  expectedActions: SkyAiEvalExpectedAction[];
  mustNotInclude: string[];
  notes?: string;
};

const DEAD_ENDS = [
  "i can't help",
  "i cannot help",
  "i'm unable to help",
  "please provide more information",
];

function sell(
  id: string,
  category: string,
  userMessage: string,
  extra?: Partial<SkyAiEvalScenario>
): SkyAiEvalScenario {
  return {
    id,
    category,
    userMessage,
    pathname: extra?.pathname ?? "/post/ai",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"],
    mustNotInclude: [...DEAD_ENDS],
    ...extra,
  };
}

function find(
  id: string,
  userMessage: string,
  extra?: Partial<SkyAiEvalScenario>
): SkyAiEvalScenario {
  return {
    id,
    category: "find_buy",
    userMessage,
    pathname: "/",
    expectedIntent: "find_buy",
    expectedActions: ["next_step", "no_hallucinated_listing"],
    mustNotInclude: [...DEAD_ENDS, "here is a listing for"],
    ...extra,
  };
}

function price(
  id: string,
  userMessage: string,
  extra?: Partial<SkyAiEvalScenario>
): SkyAiEvalScenario {
  return {
    id,
    category: "pricing",
    userMessage,
    pathname: extra?.pathname ?? "/post/ai",
    expectedIntent: "price_value",
    expectedActions: ["price_estimate", "next_step"],
    mustNotInclude: DEAD_ENDS,
    ...extra,
  };
}

const CORE_SCENARIOS: SkyAiEvalScenario[] = [
  sell("sell-bmw-01", "vehicle", "I want to sell my BMW 335i 2007 manual black 187000km Auckland $20000"),
  sell("sell-mazda-shorthand", "vehicle", "2015 Mazda Axela blue 128000km Auckland $11500"),
  sell("sell-modified-bmw", "vehicle", "Selling my modified E92 335i stage 2, loud exhaust, 150k km, Wellington"),
  sell("sell-damaged-iphone", "physical", "Cracked screen iPhone 13 128GB still works $350 Hamilton"),
  sell("sell-ps5", "physical", "PS5 disc edition 2 controllers 3 games excellent condition $650 Christchurch"),
  sell("sell-couch", "physical", "Brown leather couch good condition pickup Mount Maunganui $400"),
  sell("sell-pokemon-cards", "physical", "Pokemon card collection base set holos mixed condition"),
  sell("sell-lawn-service", "service", "Lawn mowing service Hamilton $45 per lawn fixed price"),
  sell("sell-web-design", "digital", "WordPress website design for small businesses quote required"),
  sell("sell-canva-pack", "digital", "Canva social media template pack 50 templates $29 instant download"),
  sell("sell-house-rent", "rental", "3 bedroom house for rent Hamilton $650 per week bond 4 weeks pets no"),
  sell("sell-trailer-hire", "rental", "Single axle trailer hire $40 a day $200 bond Dunedin"),
  sell("sell-van-rent", "rental", "Toyota HiAce van for hire $120 daily Auckland"),
  sell("sell-wanted-post", "wanted", "Looking for a PS5 under $600 Auckland can pickup", {
    expectedIntent: "find_buy",
    expectedActions: ["listing_fill", "next_step"],
  }),
  sell("sell-puppy-wanted", "wanted", "ISO golden retriever puppy Canterbury budget $2500"),

  find("find-ps5", "Find me a PS5 under $600 in Auckland"),
  find("find-bmw-parts", "Show me BMW E92 parts for sale"),
  find("find-lawn", "I'm looking for someone to mow my lawn in Hamilton"),
  find("find-flat", "Looking for a 2 bedroom flat to rent in Wellington under $500 a week"),

  price("price-iphone", "How much should I ask for iPhone 14 Pro 256GB good condition?"),
  price("price-bmw", "What's a fair price for a 2007 BMW 335i with 190000km?"),
  price("price-pokemon", "Price my Pokemon card lot — charizard holo and about 200 cards"),
  price("price-lawn", "What should I charge for lawn mowing in Auckland?"),

  {
    id: "edit-listing-01",
    category: "account",
    userMessage: "How do I edit my listing?",
    pathname: "/",
    expectedIntent: "edit_listing",
    expectedActions: ["navigate", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "delete-listing-01",
    category: "account",
    userMessage: "Delete my listing",
    pathname: "/list-list",
    expectedIntent: "delete_listing",
    expectedActions: ["next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "visibility-01",
    category: "troubleshoot",
    userMessage: "Why isn't my listing showing on the homepage?",
    pathname: "/list-list",
    expectedIntent: "visibility_issue",
    expectedActions: ["next_step", "clarifying_question"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "negotiate-01",
    category: "buy",
    userMessage: "Can I offer $500 on this listing?",
    pathname: "/post/listing/abc",
    expectedIntent: "message_negotiate",
    expectedActions: ["next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "scam-01",
    category: "safety",
    userMessage: "Seller wants me to pay on WhatsApp is this a scam?",
    pathname: "/",
    expectedIntent: "safety_scam",
    expectedActions: ["safety_guidance", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "context-grey-01",
    category: "context",
    userMessage: "It's grey",
    pathname: "/post/ai",
    draftContext: "2007 BMW 335i",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"],
    mustNotInclude: DEAD_ENDS,
    notes: "Should merge colour into BMW draft",
  },
  {
    id: "context-price-drop",
    category: "context",
    userMessage: "Drop it to $18,500",
    pathname: "/post/ai",
    draftContext: "BMW 335i $20000",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "typo-01",
    category: "robustness",
    userMessage: "sel my mazda axela 2015 blu 128k auck $11.5k",
    pathname: "/post/ai",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "voice-transcript-01",
    category: "robustness",
    userMessage: "selling my two thousand fifteen mazda axela blue one hundred twenty eight thousand k's eleven five hundred",
    pathname: "/post/ai",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "topic-switch-01",
    category: "context",
    userMessage: "Actually forget the car — I want to sell my PS5 instead",
    pathname: "/post/ai",
    draftContext: "BMW listing draft",
    expectedIntent: "sell_list",
    expectedActions: ["clarifying_question", "next_step"],
    mustNotInclude: DEAD_ENDS,
    notes: "Should ask confirm before wiping BMW draft",
  },
  {
    id: "payments-01",
    category: "help",
    userMessage: "What's the difference between Buy Now and contacting the seller?",
    pathname: "/",
    expectedActions: ["next_step"],
    mustNotInclude: DEAD_ENDS,
  },
  {
    id: "nav-messages",
    category: "navigate",
    userMessage: "Take me to my messages",
    pathname: "/",
    expectedIntent: "navigate_help",
    expectedActions: ["navigate", "next_step"],
    mustNotInclude: DEAD_ENDS,
  },
];

/** Expand vehicle sell variants across makes/regions. */
function expandVehicleScenarios(): SkyAiEvalScenario[] {
  const makes = [
    ["Toyota", "Corolla", "2018", "89000", "Auckland", "14500"],
    ["Ford", "Ranger", "2019", "120000", "Hamilton", "42000"],
    ["Honda", "Civic", "2016", "105000", "Wellington", "16000"],
    ["Subaru", "WRX", "2014", "140000", "Christchurch", "22000"],
    ["Nissan", "Leaf", "2020", "45000", "Tauranga", "28000"],
    ["Mitsubishi", "Outlander", "2017", "98000", "Dunedin", "19500"],
    ["Hyundai", "i30", "2019", "67000", "Palmerston North", "17500"],
    ["Kia", "Sportage", "2021", "55000", "Nelson", "32000"],
    ["Holden", "Commodore", "2015", "150000", "Invercargill", "12000"],
    ["Mazda", "CX-5", "2017", "112000", "Rotorua", "24000"],
  ] as const;
  return makes.map(([make, model, year, km, city, price], i) =>
    sell(`sell-vehicle-gen-${i}`, "vehicle", `Selling ${year} ${make} ${model} ${km}km ${city} $${price}`)
  );
}

/** Spelling / casing variants for robustness. */
function expandTypoScenarios(): SkyAiEvalScenario[] {
  const bases = [
    "sellin my iphone 12 128gb $450 auckland",
    "WANT TO SELL PS5 $600",
    "list my couch good condishn $200",
    "offering lawn mowing servise hamilton",
    "rent out my granny flat $450 pw bond 2 weeks",
  ];
  return bases.map((userMessage, i) => ({
    id: `typo-gen-${i}`,
    category: "robustness",
    userMessage,
    pathname: "/post/ai",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step"] as SkyAiEvalExpectedAction[],
    mustNotInclude: [...DEAD_ENDS],
  }));
}

/** Service & trade scenarios. */
function expandServiceScenarios(): SkyAiEvalScenario[] {
  const services = [
    "House cleaning 3 bedroom home $180 fixed Auckland",
    "Mobile mechanic call out Wellington hourly $85",
    "Math tutoring NCEA Level 2 $60 per hour",
    "Wedding photography package quote required Christchurch",
    "Dog walking service $25 per walk Petone",
    "Electrician small jobs quote required Tauranga",
    "Personal training 1 on 1 $70 per session",
    "Graphic design logo design quote required",
  ];
  return services.map((userMessage, i) =>
    sell(`sell-service-gen-${i}`, "service", userMessage)
  );
}

/** Find / buy phrasing variants. */
function expandFindScenarios(): SkyAiEvalScenario[] {
  const queries = [
    "find me a cheap laptop for uni under $800",
    "show me cars under 10k near Hamilton",
    "need a fridge second hand Auckland",
    "anyone selling a kayak?",
    "hunting for vintage vinyl records NZ",
    "want to buy baby stroller good condition",
    "ISO Toyota Hilux under 25k",
    "search for rental property 2 bed Wellington",
  ];
  return queries.map((userMessage, i) => find(`find-gen-${i}`, userMessage));
}

/** Pricing scenarios. */
function expandPriceScenarios(): SkyAiEvalScenario[] {
  const queries = [
    "how much is my MacBook Air M1 worth",
    "good price for 2010 Toyota Corolla 200000km",
    "should I ask $50 or $80 for lawn mowing",
    "value of damaged Samsung S22 screen cracked",
    "pricing my rental property 4 bed Hamilton",
    "what's a quick sale price for PS5 digital edition",
  ];
  return queries.map((userMessage, i) => price(`price-gen-${i}`, userMessage));
}

/** Incomplete info — should still progress. */
function expandIncompleteScenarios(): SkyAiEvalScenario[] {
  const partials = [
    "I want to sell my BMW",
    "Selling a couch",
    "List my house for rent",
    "I do plumbing",
    "iPhone for sale",
    "Modified car for sale",
    "Rent my camera gear",
    "Digital templates pack",
  ];
  return partials.map((userMessage, i) => ({
    id: `incomplete-gen-${i}`,
    category: "recovery",
    userMessage,
    pathname: "/post/ai",
    expectedIntent: "sell_list",
    expectedActions: ["listing_fill", "next_step", "clarifying_question"] as SkyAiEvalExpectedAction[],
    mustNotInclude: DEAD_ENDS,
    notes: "Should infer what it can and ask one question max",
  }));
}

/** Safety & trust scenarios. */
function expandSafetyScenarios(): SkyAiEvalScenario[] {
  const msgs = [
    "Is it safe to meet a buyer at night?",
    "Buyer wants bank transfer before pickup",
    "This price seems too good to be true",
    "How do I report a listing?",
    "Someone asked me to pay outside Sky Drop",
  ];
  return msgs.map((userMessage, i) => ({
    id: `safety-gen-${i}`,
    category: "safety",
    userMessage,
    pathname: "/",
    expectedIntent: userMessage.includes("report") ? "safety_scam" : "general",
    expectedActions: ["safety_guidance", "next_step"] as SkyAiEvalExpectedAction[],
    mustNotInclude: DEAD_ENDS,
  }));
}

/** Digital product sell variants. */
function expandDigitalScenarios(): SkyAiEvalScenario[] {
  const items = [
    "Notion second brain template pack $25",
    "Lightroom preset bundle wedding photos $19",
    "Ebook keto recipes PDF $12",
    "Figma UI kit SaaS dashboard $45",
    "Ableton sample pack drum and bass $30",
    "WordPress plugin custom work quote required",
    "SEO audit service remote NZ quote required",
    "3D printed miniatures STL files pack $15",
    "Procreate brush set $8 instant download",
    "Spreadsheet budget tracker Excel $10",
    "Video editing preset pack Premiere $22",
    "Online coaching package 4 sessions quote required",
    "TikTok content template bundle Canva $18",
    "Resume template pack $9",
    "Gaming mod asset pack Unity $35",
  ];
  return items.map((userMessage, i) => sell(`sell-digital-gen-${i}`, "digital", userMessage));
}

export const SKY_AI_EVAL_SCENARIOS: SkyAiEvalScenario[] = [
  ...CORE_SCENARIOS,
  ...expandVehicleScenarios(),
  ...expandTypoScenarios(),
  ...expandServiceScenarios(),
  ...expandFindScenarios(),
  ...expandPriceScenarios(),
  ...expandIncompleteScenarios(),
  ...expandSafetyScenarios(),
  ...expandDigitalScenarios(),
];

export const SKY_AI_EVAL_CATEGORIES = [
  ...new Set(SKY_AI_EVAL_SCENARIOS.map((s) => s.category)),
];

export function getScenariosByCategory(category: string): SkyAiEvalScenario[] {
  return SKY_AI_EVAL_SCENARIOS.filter((s) => s.category === category);
}

/** Score a model reply against scenario expectations (heuristic — for CI & offline eval). */
export function scoreSkyAiEvalReply(
  scenario: SkyAiEvalScenario,
  reply: string
): { pass: boolean; failures: string[] } {
  const lower = reply.toLowerCase();
  const failures: string[] = [];

  for (const bad of scenario.mustNotInclude) {
    if (lower.includes(bad.toLowerCase())) {
      failures.push(`dead_end_phrase:${bad}`);
    }
  }

  if (scenario.expectedActions.includes("listing_fill") && !/\[\[listing_fill\]\]/i.test(reply)) {
    failures.push("missing_listing_fill");
  }
  if (scenario.expectedActions.includes("navigate") && !/\[\[nav:/i.test(reply)) {
    failures.push("missing_navigate");
  }
  if (
    scenario.expectedActions.includes("next_step") &&
    !/\b(want me|would you like|next|try |open |add photo|publish|go to |search |browse |contact seller|arrange purchase|\?|\[\[nav:|\[\[listing_fill\]\])/i.test(
      lower
    )
  ) {
    failures.push("missing_next_step");
  }
  if (
    scenario.expectedActions.includes("price_estimate") &&
    !/\b(quick sale|fair market|optimistic|confidence|\$\d)/i.test(reply)
  ) {
    failures.push("missing_price_estimate");
  }
  if (
    scenario.expectedActions.includes("no_hallucinated_listing") &&
    /\b(listing id|seller john|here is the exact listing)\b/i.test(lower)
  ) {
    failures.push("possible_hallucinated_listing");
  }

  return { pass: failures.length === 0, failures };
}
