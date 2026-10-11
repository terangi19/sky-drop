import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/** PROMPT-15 guard: no counterparty email in the matchmaking feed; read-heavy insight routes are per-uid capped. */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("matchmaking / insights routes", () => {
  it("matchmaking-events response has no *Email fields", () => {
    const src = read("app/api/matchmaking-events/route.ts");
    const pushed = src.match(/events\.push\(\{[\s\S]*?\}\);/g) || [];
    expect(pushed.length).toBe(2);
    for (const block of pushed) expect(block).not.toMatch(/Email/);
  });

  it.each([
    ["app/api/matchmaking-events/route.ts", "matchmaking-events"],
    ["app/api/radar-matches/route.ts", "radar-matches"],
    ["app/api/seller-insights/route.ts", "seller-insights"],
    ["app/api/negotiation-assistant/route.ts", "negotiation-assistant"],
  ])("%s rate limits per uid after token verification", (file, key) => {
    const src = read(file);
    const verifyAt = src.indexOf("verifyIdToken(");
    const rlAt = src.indexOf(`rateLimit(\`${key}:\${decoded.uid}\``);
    expect(verifyAt).toBeGreaterThan(-1);
    expect(rlAt).toBeGreaterThan(verifyAt);
  });

  it("client type no longer expects matchedWithEmail", () => {
    expect(read("app/components/MatchmakingActivity.tsx")).not.toMatch(/matchedWithEmail/);
  });
});
