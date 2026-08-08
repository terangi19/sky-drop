/**
 * Premium-operator regression gate — exercises processCanonicalAwhina paths.
 * Rejects field-mutation-bot copy, entity misreads, and titles-only compare claims.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey, getTaskScope } from "./awhina-task-scope";
import {
  clearListingDraftSession,
  listingDraftSessionKey,
  parseListingPriceFromMessage,
} from "./awhina-listing-fill-tools";
import {
  buildPremiumListingTitle,
  buildListingDescriptionFromFacts,
  buildCompleteDraftReply,
  buildIncompleteDraftReply,
  buildDraftUpdateReply,
  progressStatesForCanonical,
  progressStatesForRoute,
  shouldAutoNavigate,
  summarizeListingComparison,
  polishAwhinaReplyStyle,
  pickCompareFactsFromPage,
} from "./awhina-product-ux";
import { scoreConversationReply } from "./sky-ai-reply-quality";
import { SKY_AI_LISTING_FILL_SUCCESS } from "./sky-ai-prompts";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

describe("entity torture: year/storage/qty/size/odometer ≠ price", () => {
  const cases: Array<{ msg: string; expectPrice: string | null; never?: string }> = [
    { msg: "selling iPhone 15 Pro 128GB like new $950 Auckland", expectPrice: "950", never: "128" },
    { msg: "selling my 2018 BMW 320i 85000km Auckland $18500", expectPrice: "18500", never: "2018" },
    { msg: "list my 3 seater couch good condition 250 bucks wellington", expectPrice: "250", never: "3" },
    { msg: "want to list my ps5 its brand new 200 bucks pick up auckland", expectPrice: "200" },
    { msg: "selling AirPods Pro 2 brand new 280 dollars auckland", expectPrice: "280" },
    { msg: "selling Samsung 55 inch TV used $400 Auckland", expectPrice: "400", never: "55" },
    { msg: "selling drill 2 pack good condition $80", expectPrice: "80", never: "2" },
  ];

  for (const c of cases) {
    it(`parse: ${c.msg.slice(0, 48)}…`, () => {
      expect(parseListingPriceFromMessage(c.msg)).toBe(c.expectPrice);
    });
  }

  it("canonical one-shot never maps year/storage/odometer to price", () => {
    wipe("torture-bmw");
    const r = processCanonicalAwhina(
      "selling my 2018 BMW 320i 85000km Auckland $18500",
      { conversationId: "torture-bmw", pathname: "/" }
    );
    expect(r.listingFill?.price).toBe("18500");
    expect(r.listingFill?.price).not.toBe("2018");
    expect(r.listingFill?.price).not.toBe("85000");
    expect(r.listingFill?.vehicleYear).toBe("2018");
  });

  it("128GB never becomes price on iPhone sell", () => {
    wipe("torture-iphone");
    const r = processCanonicalAwhina(
      "selling iPhone 15 Pro 128GB like new $950 Auckland pickup",
      { conversationId: "torture-iphone", pathname: "/" }
    );
    expect(r.listingFill?.price).toBe("950");
    expect(JSON.stringify(r.listingFill)).not.toMatch(/"price":"128"/);
  });
});

describe("premium title + description (reusable categories)", () => {
  it("phones / vehicles / furniture / gaming / electronics", () => {
    expect(
      buildPremiumListingTitle({ item: "ps5", condition: "New" })
    ).toMatch(/Brand New.*PlayStation\s*5/i);
    expect(
      buildPremiumListingTitle({ item: "iPhone 15 Pro", condition: "Used - Like New" })
    ).toMatch(/Like New.*iPhone\s*15\s*Pro/i);
    expect(
      buildPremiumListingTitle({
        item: "BMW 320i",
        listingType: "vehicle",
        vehicleYear: "2018",
      })
    ).toMatch(/2018.*BMW/i);
    expect(buildPremiumListingTitle({ item: "3 seater couch", condition: "Used - Good" })).toMatch(
      /couch|sofa/i
    );
    expect(buildPremiumListingTitle({ item: "Samsung TV" })).toMatch(/Samsung/i);
  });

  it("description from known facts only", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Brand New PlayStation 5 Console",
      price: "200",
      condition: "New",
      location: "Auckland",
      pickupAvailable: true,
      category: "Gaming",
    });
    expect(desc).toMatch(/PlayStation\s*5/i);
    expect(desc).toMatch(/\$200|Asking \$200/);
    expect(desc).toMatch(/Auckland/);
    expect(desc).not.toMatch(/controller|dualsense|games included|SSD/i);
    expect(desc).not.toMatch(/Condition:|Message me with any questions/i);
    expect(desc).toMatch(/Feel free to get in touch/i);
  });
});

describe("sell UX copy: no Updated / Started a draft / FB Trade Me", () => {
  it("complete reply is premium ready summary", () => {
    const text = buildCompleteDraftReply({
      title: "Brand New PlayStation 5 Console",
      price: "200",
      condition: "New",
      category: "Gaming",
      location: "Auckland",
      pickupAvailable: true,
      description: "Selling Brand New PlayStation 5 Console. Condition: New. Asking $200.",
    });
    expect(text).toMatch(/listing is ready/i);
    expect(text).not.toMatch(/^Updated:/i);
    expect(text).not.toMatch(/Started a draft/i);
    expect(text).not.toMatch(/Facebook|Trade Me/i);
  });

  it("incomplete + update helpers reject legacy bot phrases", () => {
    expect(buildIncompleteDraftReply({ title: "PS5" }, ["price"])).not.toMatch(
      /Started a draft|Updated:/i
    );
    expect(
      buildDraftUpdateReply({ title: "PS5", price: "450" }, ["price $450"])
    ).not.toMatch(/^Updated:|Started a draft/i);
  });

  it("SKY_AI_LISTING_FILL_SUCCESS has no export menu", () => {
    expect(SKY_AI_LISTING_FILL_SUCCESS).not.toMatch(/Facebook|Trade Me/i);
    expect(SKY_AI_LISTING_FILL_SUCCESS).toMatch(/Publish|photos|listing is ready/i);
  });

  it("canonical incomplete sell never says Started a draft / Updated:", () => {
    wipe("copy-incomplete");
    const r = processCanonicalAwhina("selling PS5", {
      conversationId: "copy-incomplete",
      pathname: "/post/ai",
    });
    expect(r.handled).toBe(true);
    expect(r.reply).not.toMatch(/Started a draft|Updated:/i);
  });

  it("canonical follow-up never says Updated:", () => {
    wipe("copy-follow");
    processCanonicalAwhina("selling PS5", {
      conversationId: "copy-follow",
      pathname: "/post/ai",
    });
    const r = processCanonicalAwhina("price $500", {
      conversationId: "copy-follow",
      pathname: "/post/ai",
    });
    expect(r.reply).not.toMatch(/^Updated:/i);
    expect(r.reply).not.toMatch(/Started a draft/i);
  });
});

describe("conversational state torture + task isolation", () => {
  it("HELP → SELL → BUY resets hard", () => {
    const id = "state-torture-1";
    wipe(id);
    const help = processCanonicalAwhina("is this safe to buy?", {
      conversationId: id,
      pathname: "/",
    });
    expect(help.navigateTo).toBeUndefined();
    expect(getTaskScope(taskScopeKey({ conversationId: id }))?.task).toBe("help");

    const sell = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: id, pathname: "/" }
    );
    expect(sell.listingFill?.price).toBe("200");
    expect(getTaskScope(taskScopeKey({ conversationId: id }))?.task).toBe("selling");

    const buy = processCanonicalAwhina("find me BMW 335i 2007 under 15k", {
      conversationId: id,
      pathname: "/",
    });
    expect(buy.tool).toBe("searchListings");
    expect(buy.listingFill).toBeUndefined();
    expect(buy.navigateTo).toMatch(/year=2007/);
    expect(buy.navigateTo).not.toMatch(/ps5|200(?!\d)/i);
  });

  it("SHOP → relative cheaper stays search; never leaks sell price", () => {
    const id = "state-torture-2";
    wipe(id);
    processCanonicalAwhina("Find me PS5 under 600", { conversationId: id, pathname: "/" });
    const r = processCanonicalAwhina("make it cheaper", { conversationId: id, pathname: "/" });
    expect(r.tool).toBe("searchListings");
    expect(r.listingFill).toBeUndefined();
  });
});

describe("compare: real facts path (not titles-only when facts exist)", () => {
  it("pageListings drive cheapest / mileage — not titles only", () => {
    wipe("cmp-facts");
    const r = processCanonicalAwhina("compare these two", {
      conversationId: "cmp-facts",
      pathname: "/search",
      pageListings: [
        {
          title: "BMW 320i Auckland",
          price: "18000",
          year: 2016,
          mileage: "95000",
          location: "Auckland",
        },
        {
          title: "BMW 320d Hamilton",
          price: "16500",
          year: 2015,
          mileage: "120000",
          location: "Hamilton",
        },
      ],
    });
    expect(r.intent).toBe("compare");
    expect(r.reply).toMatch(/Cheapest|\$16,?500|\$18,?000/i);
    expect(r.reply).toMatch(/mileage|95,?000|120,?000/i);
    expect(r.navigateTo).toBeUndefined();
  });

  it("pickCompareFactsFromPage merges real fields", () => {
    const facts = pickCompareFactsFromPage(
      ["BMW 320i", "BMW 320d"],
      [
        { title: "BMW 320i Sport", price: "18000", mileage: "90000", location: "Auckland" },
        { title: "BMW 320d Touring", price: "16000", mileage: "110000", location: "Wellington" },
      ]
    );
    expect(facts.every((f) => f.price)).toBe(true);
    const text = summarizeListingComparison(facts);
    expect(text).toMatch(/Cheapest/i);
  });

  it("route imports fetchListingFactsForCompare and rebuilds compare reply", () => {
    const src = readFileSync(join(__dirname, "../api/sky-ai/route.ts"), "utf8");
    expect(src).toMatch(/fetchListingFactsForCompare/);
    expect(src).toMatch(/resolveGroundedCompare|fetchListingFactsForCompare/);
    expect(src).toMatch(/progressStatesForCanonical/);
  });
});

describe("SSE progress: honest phases for search/compare/sell", () => {
  it("local nav has no fake progress; search/compare/sell do", () => {
    expect(progressStatesForRoute("local")).toEqual([]);
    expect(progressStatesForCanonical({ intent: "navigation", tool: "navigate" })).toEqual([]);
    expect(progressStatesForCanonical({ intent: "marketplace_search", tool: "searchListings" }).length).toBeGreaterThan(
      0
    );
    expect(progressStatesForCanonical({ intent: "compare" }).length).toBeGreaterThan(0);
    expect(progressStatesForCanonical({ intent: "listing_create", tool: "createListing" }).length).toBeGreaterThan(
      0
    );
  });
});

describe("help vs action nav", () => {
  it("safety / how-to stay in place", () => {
    expect(shouldAutoNavigate({ message: "is this safe to buy?", intent: "education" })).toBe(
      false
    );
    expect(shouldAutoNavigate({ message: "how do I arrange payment?", intent: "help" })).toBe(
      false
    );
    expect(shouldAutoNavigate({ message: "open messages", hasExplicitNavAction: true })).toBe(
      true
    );
  });
});

describe("response quality snapshots reject bad patterns", () => {
  const bad = [
    "Updated: **price $500**, **condition New**.",
    "Started a draft for **PS5**.",
    "Done! I've filled your listing. create listings for Facebook Marketplace or Trade Me.",
  ];
  for (const reply of bad) {
    it(`rejects: ${reply.slice(0, 40)}…`, () => {
      const polished = polishAwhinaReplyStyle(reply);
      const score = scoreConversationReply(polished, { listingFill: { title: "x" } });
      // Either polish removed the smell, or quality score flags it
      const stillBad =
        /^Updated:/i.test(polished) ||
        /Started a draft for/i.test(polished) ||
        /Facebook Marketplace|Trade Me listing/i.test(polished);
      if (stillBad) expect(score.pass).toBe(false);
      else expect(stillBad).toBe(false);
    });
  }

  it("PS5 exact premium path scores clean", () => {
    wipe("snap-ps5");
    const r = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: "snap-ps5", pathname: "/" }
    );
    expect(r.listingFill?.price).toBe("200");
    expect(r.reply).toMatch(/listing is ready/i);
    expect(r.reply).not.toMatch(/Updated:|Started a draft|Facebook|Trade Me/i);
    const score = scoreConversationReply(r.reply || "", { listingFill: r.listingFill });
    expect(score.failures).not.toContain("legacy_updated_prefix");
    expect(score.failures).not.toContain("legacy_export_menu");
  });
});

describe("search quality: non-price numbers stay filters", () => {
  it("BMW 2007 under 15k → year + maxPrice, not price=2007", () => {
    wipe("search-year");
    const r = processCanonicalAwhina("want a BMW 335i 2007 under 15k Auckland", {
      conversationId: "search-year",
      pathname: "/",
    });
    expect(r.tool).toBe("searchListings");
    expect(r.navigateTo).toMatch(/year=2007/);
    expect(r.navigateTo).toMatch(/maxPrice=15000/);
    expect(r.navigateTo).not.toMatch(/maxPrice=2007|price=2007/);
    expect(r.listingFill).toBeUndefined();
  });
});
