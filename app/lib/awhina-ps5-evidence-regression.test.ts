import { beforeEach, describe, expect, it } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { validateDescriptionQualityContract } from "./awhina-description-quality";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";

const MESSAGE =
  "selling my ps5 slim bro barely use it got 2 controllers but one got stick drift comes with hdmi power cable and spiderman 2 disc paid heaps for it just want gone im in henderson maybe 600 idk what they're worth can you make the listing sound good and tell me what price i should put";

describe("PS5 unpunctuated seller-evidence regression", () => {
  const conversationId = "ps5-overfilter-regression";

  beforeEach(() => {
    clearAllListingDraftCacheForTests();
    clearTaskScope(taskScopeKey({ conversationId }));
  });

  it("retains item facts while excluding intent, commands, and tentative price", () => {
    const result = processCanonicalAwhina(MESSAGE, {
      conversationId,
      pathname: "/post/ai",
    });
    const fill = result.listingFill;
    expect(fill).toBeTruthy();

    const description = String(fill?.description || "");
    expect(fill?.title).toMatch(/PlayStation 5 Slim/i);
    expect(description).toMatch(/barely used|lightly used|very little use/i);
    expect(description).toMatch(/\b2 controllers\b/i);
    expect(description).toMatch(/one controller has stick drift/i);
    expect(description).toMatch(/HDMI cable/i);
    expect(description).toMatch(/power cable/i);
    expect(description).toMatch(/spider.?man 2 disc/i);
    expect(description).toMatch(/Henderson/i);

    expect(description).not.toMatch(
      /just want gone|idk|what they(?:'re| are) worth|make the listing sound good|tell me what price|paid heaps/i
    );
    expect(fill?.price).toBeUndefined();
    expect(description).not.toMatch(/\b600\b/);
    expect(description).not.toMatch(
      /excellent|mint|perfect|reliable|great choice|bargain/i
    );
    expect(validateDescriptionQualityContract(description, fill!).ok).toBe(true);
  });
});
