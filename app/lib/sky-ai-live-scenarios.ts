/**
 * Canonical live-eval scenarios — NZ marketplace flows.
 * Used by sky-ai-live-eval.test.ts (local prompts + optional production comparison).
 */

export type LiveEvalScenario = {
  id: string;
  title: string;
  userMessage: string;
  pathname: string;
  /** Require LISTING_FILL in reply (direct) or listingFill (production API) */
  expectListingFill?: boolean;
  /** Must NOT create a listing */
  expectNoListingFill?: boolean;
  requirePricing?: boolean;
  requireNavigate?: boolean;
  maxQuestions?: number;
};

export const LIVE_EVAL_SCENARIOS: LiveEvalScenario[] = [
  {
    id: "sell-bmw-335i",
    title: "Sell a 2007 BMW 335i (minimal opener)",
    userMessage: "Sell my BMW",
    pathname: "/post/ai",
    expectListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "sell-bmw-full",
    title: "Sell BMW with full details",
    userMessage: "I want to sell my BMW 335i 2007 manual black 187000km Auckland $20000",
    pathname: "/post/ai",
    expectListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "find-ps5-auckland",
    title: "Find a PS5 under $600 in Auckland",
    userMessage: "Find me a PS5 under $600 in Auckland",
    pathname: "/",
    expectNoListingFill: true,
    requireNavigate: true,
    maxQuestions: 1,
  },
  {
    id: "one-photo-couch",
    title: "One-photo listing",
    userMessage: "I only have one photo of my couch — sell it for me, good condition, $450 Wellington",
    pathname: "/post/ai",
    expectListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "cancel-draft",
    title: "Cancel / delete draft",
    userMessage: "Actually never mind, delete the draft and start over",
    pathname: "/post/ai",
    expectNoListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "why-cant-buy",
    title: "Why can't I buy this listing?",
    userMessage: "Why can't I buy this?",
    pathname: "/post/listing/abc123",
    expectNoListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "price-iphone",
    title: "Price an iPhone",
    userMessage: "How much should I ask for iPhone 14 Pro 256GB good condition?",
    pathname: "/post/ai",
    requirePricing: true,
    expectNoListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "arrange-purchase",
    title: "Arrange Purchase questions",
    userMessage: "How does Arrange Purchase work when I buy something?",
    pathname: "/",
    expectNoListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "listing-visibility",
    title: "Listing not showing",
    userMessage: "Why isn't my listing showing on the homepage?",
    pathname: "/list-list",
    expectNoListingFill: true,
    maxQuestions: 2,
  },
  {
    id: "find-mower",
    title: "Find a mower under $500",
    userMessage: "Find me a lawn mower under $500",
    pathname: "/",
    expectNoListingFill: true,
    maxQuestions: 1,
  },
  {
    id: "price-laptop",
    title: "Help price a laptop",
    userMessage: "Help me price my MacBook Air M1 256GB good condition",
    pathname: "/post/ai",
    requirePricing: true,
    maxQuestions: 1,
  },
  {
    id: "sell-typo-mazda",
    title: "Messy voice-style sell",
    userMessage: "sel my mazda axela 2015 blu 128k auck $11.5k",
    pathname: "/post/ai",
    expectListingFill: true,
    maxQuestions: 1,
  },
];
