import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/** PROMPT-16 guard: these routes never put caught error text into a response body. */
const ROUTES = [
  "app/api/accept-offer/route.ts",
  "app/api/pay-offer/route.ts",
  "app/api/release-payment/route.ts",
  "app/api/create-payment-intent/route.ts",
  "app/api/create-purchase/route.ts",
  "app/api/sky-ai/conversations/[id]/route.ts",
  "app/api/admin/message-flags/route.ts",
  "app/api/admin/announcement/route.ts",
  "app/api/admin/features/route.ts",
];
const LEAK = [
  /error:\s*e(rr)?\s*instanceof\s*Error\s*\?\s*e(rr)?\.message/,
  /error:\s*msg\b/,
  /error:\s*message\b/,
  /error:\s*`[^`]*\$\{msg\}/,
  /error:\s*e\?\.message\s*\|\|/,
  /status\s*=\s*e\?\.status\s*\|\|\s*e\?\.code/,
];

describe("no caught error text in responses", () => {
  it.each(ROUTES)("%s", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    for (const re of LEAK) expect(src, `${file} matches ${re}`).not.toMatch(re);
  });
});
