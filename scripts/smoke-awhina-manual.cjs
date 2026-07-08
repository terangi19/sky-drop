/**
 * Manual smoke flows — mirrors UI messages on /post/ai and homepage.
 * Usage: node scripts/smoke-awhina-manual.cjs [baseUrl]
 */
const { readFileSync, existsSync } = require("fs");
const { join } = require("path");

const base = process.argv[2] || "http://localhost:3000";

function loadEnv() {
  const p = join(__dirname, "..", ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const FLOWS = [
  {
    id: "sell-bmw",
    pathname: "/post/ai",
    wrapSell: true,
    user: "Sell my 2007 BMW 335i manual black Auckland 187000km $18500",
    expectListingFill: true,
  },
  {
    id: "find-ps5",
    pathname: "/",
    user: "Find me a PS5 under $600 in Auckland",
    expectNoListingFill: true,
  },
  {
    id: "price-iphone",
    pathname: "/post/ai",
    user: "Price my iPhone 15 Pro 256GB good condition",
    requirePricing: true,
  },
  {
    id: "one-photo",
    pathname: "/post/ai",
    wrapSell: true,
    user: "I only have one photo of my couch — sell it Wellington $450 good condition",
    expectListingFill: true,
  },
  {
    id: "why-cant-buy",
    pathname: "/post/listing/test123",
    user: "Why can't I buy this listing?",
    expectNoListingFill: true,
  },
  {
    id: "cancel-draft",
    pathname: "/post/ai",
    user: "Cancel my draft and start over",
    expectNoListingFill: true,
  },
  {
    id: "rent-mower",
    pathname: "/post/ai",
    wrapSell: true,
    user: "Rent out my lawn mower daily $45 Hamilton",
    expectListingFill: true,
  },
  {
    id: "arrange-purchase",
    pathname: "/",
    user: "How does Arrange Purchase work when I buy something?",
    expectNoListingFill: true,
  },
];

function wrapSellMessage(msg) {
  return `[LISTING CREATION REQUEST]\nThe user is on the Sell page. Parse everything below as listing data and respond ONLY with LISTING_FILL JSON. Generate a complete listing (title, description, all relevant fields). Do not give general chat advice.\n\n${msg}`;
}

function score(reply, listingFill, flow) {
  const issues = [];
  const lower = reply.toLowerCase();
  if (/please provide more|could you tell me more about what you're selling/i.test(reply)) {
    issues.push("stall_interrogation");
  }
  if ((reply.match(/\?/g) || []).length > 2) issues.push("over_questioning");
  if (/let me know if you'd like changes/i.test(lower)) issues.push("passive_close");
  if (flow.expectListingFill && !listingFill) issues.push("missing_listing_fill");
  if (flow.expectListingFill && /i didn't catch that/i.test(reply)) issues.push("empty_ai_reply");
  if (flow.expectNoListingFill && listingFill) issues.push("unexpected_listing_fill");
  if (flow.requirePricing && !/\b(quick sale|fair market|optimistic|confidence)/i.test(reply)) {
    issues.push("pricing_format_missing");
  }
  if (flow.id === "find-ps5" && listingFill) issues.push("find_created_listing");
  if (!/\b(want me|want to list|publish|search|browse|contact seller|arrange purchase|add photo|open |try |which button|something else|\?)\b/i.test(lower) && !listingFill) {
    issues.push("missing_next_step");
  }
  return issues;
}

async function runFlow(flow) {
  const message = flow.wrapSell ? wrapSellMessage(flow.user) : flow.user;
  const res = await fetch(`${base}/api/sky-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, pathname: flow.pathname, history: [], stream: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.code || `HTTP ${res.status}`);
  const issues = score(data.reply || "", data.listingFill, flow);
  return { flow, data, issues, ok: issues.length === 0 };
}

(async () => {
  console.log(`Smoke base: ${base}\n`);
  let pass = 0;
  let fail = 0;
  for (const flow of FLOWS) {
    try {
      const r = await runFlow(flow);
      if (r.ok) {
        pass++;
        console.log(`PASS  ${flow.id}  [${r.data.source}]  ${(r.data.reply || "").slice(0, 120)}...`);
      } else {
        fail++;
        console.log(`FAIL  ${flow.id}  issues=${r.issues.join(",")}`);
        console.log(`      reply: ${(r.data.reply || "").slice(0, 200)}`);
      }
    } catch (e) {
      fail++;
      console.log(`FAIL  ${flow.id}  ${e.message}`);
    }
  }
  console.log(`\n${pass}/${FLOWS.length} passed`);
  process.exit(fail ? 1 : 0);
})();
