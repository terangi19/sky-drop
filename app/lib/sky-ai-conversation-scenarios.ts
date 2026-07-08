/**
 * Realistic multi-turn conversation drills for Āwhina stress testing.
 * Validates routing/intent per turn without requiring live OpenAI.
 */

import type { SkyAiIntent } from "./sky-ai-intent";

export type ConversationTurn = {
  user: string;
  pathname?: string;
  /** Prior assistant message for context-aware routing */
  priorAssistant?: string;
  expectedIntent: SkyAiIntent;
  expectListingFill?: boolean;
  expectNoListingFill?: boolean;
  notes?: string;
};

export type ConversationScenario = {
  id: string;
  title: string;
  goal: string;
  turns: ConversationTurn[];
  /** Example reply that SHOULD pass quality scoring (prompt target behaviour) */
  goodReplyExample?: string;
};

export const REAL_USER_CONVERSATIONS: ConversationScenario[] = [
  {
    id: "sell-bmw-multiturn",
    title: "Sell BMW — progressive details",
    goal: "Complete vehicle listing without re-asking known fields",
    turns: [
      { user: "Sell my BMW", pathname: "/post/ai", expectedIntent: "sell_list", expectListingFill: true },
      {
        user: "2007 335i manual black Auckland",
        pathname: "/post/ai",
        priorAssistant: "What year and model?",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
      {
        user: "It's grey actually",
        pathname: "/post/ai",
        priorAssistant: "[[LISTING_FILL]] BMW draft",
        expectedIntent: "sell_list",
        expectListingFill: true,
        notes: "Merge colour into existing draft",
      },
      {
        user: "187000 km and $18500",
        pathname: "/post/ai",
        priorAssistant: "draft exists",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
    ],
    goodReplyExample:
      "Updated your BMW draft — grey, 187,000 km, $18,500. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Add a few photos, then hit Publish. Want me to tweak the description?",
  },
  {
    id: "find-ps5",
    title: "Looking for a PS5",
    goal: "Search guidance without inventing listings",
    turns: [
      {
        user: "Looking for a PS5",
        pathname: "/",
        expectedIntent: "find_buy",
        expectNoListingFill: true,
      },
      {
        user: "Under $600 in Auckland",
        pathname: "/",
        expectedIntent: "find_buy",
        expectNoListingFill: true,
      },
    ],
    goodReplyExample:
      "Search **Gaming** or Tech on the homepage and filter by Auckland — set max price around $600. [[NAV:/]] I can't see live stock from here, but that'll show current PS5 listings. Want tips on spotting a good deal?",
  },
  {
    id: "listing-not-showing",
    title: "Listing visibility troubleshoot",
    goal: "Checklist + one fix step",
    turns: [
      {
        user: "My listing isn't showing",
        pathname: "/list-list",
        expectedIntent: "visibility_issue",
        expectNoListingFill: true,
      },
    ],
    goodReplyExample:
      "Common reasons: email not verified, listing sold/expired, or still processing. Check **My Listings** — is it marked Active? [[NAV:/list-list]] If it's Active and still missing, try editing and saving once. Which listing is it?",
  },
  {
    id: "why-cant-buy",
    title: "Why can't I buy this?",
    goal: "Explain purchase blockers + next step",
    turns: [
      {
        user: "Why can't I buy this?",
        pathname: "/post/listing/abc",
        expectedIntent: "buy_trouble",
        expectNoListingFill: true,
      },
    ],
    goodReplyExample:
      "Usually it's one of these: you're the seller, it's sold, it's **Contact Seller** only (not card checkout), or you need to sign in. Try **Contact Seller** to arrange payment in Messages, or sign in for card checkout. Want me to walk through which button you see?",
  },
  {
    id: "price-laptop",
    title: "Price my laptop",
    goal: "Structured NZD pricing with confidence",
    turns: [
      {
        user: "Help me price my laptop",
        pathname: "/post/ai",
        expectedIntent: "price_value",
        expectNoListingFill: true,
      },
      {
        user: "MacBook Air M1 256GB good condition",
        pathname: "/post/ai",
        expectedIntent: "price_value",
      },
    ],
    goodReplyExample:
      "**Quick sale:** $750 · **Fair market:** $850 · **Optimistic:** $950 · **Confidence:** Medium — M1 Airs hold value well in NZ. Want me to set $850 in your listing?",
  },
  {
    id: "one-photo",
    title: "Only one photo",
    goal: "Coach without blocking progress",
    turns: [
      {
        user: "I only have one photo of my couch",
        pathname: "/post/ai",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
    ],
    goodReplyExample:
      "One photo is fine to start — I'll fill the listing now. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Add more angles later if you can; 3+ photos usually get more messages. Publish when you're ready?",
  },
  {
    id: "category-unknown",
    title: "Don't know category",
    goal: "Infer category, don't interrogate",
    turns: [
      {
        user: "I don't know what category it belongs in — it's a drone with camera",
        pathname: "/post/ai",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
    ],
    goodReplyExample:
      "Drones usually sit under **Tech** — I'll put it there. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Happy with Tech, or prefer Sports?",
  },
  {
    id: "find-mower",
    title: "Find mower under $500",
    goal: "Search + budget filter",
    turns: [
      {
        user: "Find me a mower under $500",
        pathname: "/",
        expectedIntent: "find_buy",
        expectNoListingFill: true,
      },
    ],
    goodReplyExample:
      "Search **Home** or **All** and use the price sort — set your budget around $500. [[NAV:/]] Want petrol or electric?",
  },
  {
    id: "switch-to-rent",
    title: "Changed mind — rent instead",
    goal: "Confirm before wiping sell draft",
    turns: [
      {
        user: "I changed my mind, now I want to rent my granny flat instead",
        pathname: "/post/ai",
        priorAssistant: "[[LISTING_FILL]] physical item draft",
        expectedIntent: "rent_hire",
        notes: "Should switch listing type to rental property",
      },
    ],
    goodReplyExample:
      "Got it — switching to a **rental** listing for your granny flat. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Add weekly rent and bond if you have them. Want me to suggest a typical Hamilton rate?",
  },
  {
    id: "cancel-draft",
    title: "Cancel / delete draft",
    goal: "Clear draft without dead end",
    turns: [
      {
        user: "Sell this... actually never mind, delete the draft",
        pathname: "/post/ai",
        priorAssistant: "[[LISTING_FILL]] draft",
        expectedIntent: "cancel_draft",
        expectNoListingFill: true,
      },
    ],
    goodReplyExample:
      "No worries — clear the form fields on the Sell page or refresh to start fresh. Want to list something else instead?",
  },
  {
    id: "recovery-nonsense",
    title: "Nonsense then recovery",
    goal: "Recover gracefully",
    turns: [
      { user: "asdfgh jkl", pathname: "/", expectedIntent: "general", expectNoListingFill: true },
      {
        user: "sorry — sell my iPhone 13 $450 Wellington",
        pathname: "/post/ai",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
    ],
    goodReplyExample:
      "Filled your iPhone listing — $450, Wellington. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Add photos when you can. Ready to publish?",
  },
  {
    id: "voice-transcript-sell",
    title: "Voice-style transcript",
    goal: "Parse messy speech",
    turns: [
      {
        user: "yeah hi um selling my twenty fifteen mazda axela blue one twenty eight k auckland eleven five hundred",
        pathname: "/post/ai",
        expectedIntent: "sell_list",
        expectListingFill: true,
      },
    ],
    goodReplyExample:
      "Got it — 2015 Mazda Axela, blue, 128,000 km, Auckland, $11,500. [[LISTING_FILL]]{...}[[/LISTING_FILL]] Add photos, then publish?",
  },
];

/** Pricing items for structure validation (not market accuracy — live eval needed for that). */
export const PRICING_STRESS_ITEMS = [
  { item: "iPhone charger cable used", band: "low" },
  { item: "PS5 disc edition excellent", band: "mid" },
  { item: "2015 BMW 335i 190000km", band: "high" },
  { item: "Cracked screen Samsung S22", band: "low" },
  { item: "Charizard holo pokemon card", band: "mid" },
  { item: "Modified WRX stage 2", band: "high" },
  { item: "Lawn mowing per lawn Hamilton", band: "low" },
  { item: "3 bed house rent weekly Hamilton", band: "high" },
  { item: "Canva template pack", band: "low" },
  { item: "Single axle trailer hire daily", band: "mid" },
];
