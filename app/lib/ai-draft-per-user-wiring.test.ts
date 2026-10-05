import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/** Source-guards (no jsdom in this repo): the owner binding and publish-clear stay wired. */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("AI draft per-user wiring", () => {
  it("AuthProvider binds the draft owner on every auth change and on cross-tab sign-out", () => {
    const src = read("app/contexts/AuthContext.tsx");
    expect(src).toContain('from "../lib/sky-ai-draft-owner"');
    expect(src).toMatch(/bindListingDraftOwner\(currentUser\?\.uid \?\? null\)/);
    expect(src).toMatch(/signed-out"\) \{\s*bindListingDraftOwner\(null\)/);
  });

  it("/post/ai clears the stored draft after a successful CREATE (not on failure paths)", () => {
    const src = read("app/post/ai/page.tsx");
    const created = src.indexOf('showToast("Listing created!", "success");');
    expect(created).toBeGreaterThan(-1);
    expect(src.slice(created, created + 600)).toContain("clearListingDraftFromSkyAi({ silent: true })");
    // the silent clear must come after the success toast, never before the request resolves
    expect(src.indexOf("clearListingDraftFromSkyAi({ silent: true })")).toBeGreaterThan(src.indexOf('fetch("/api/create-listing"'));
  });

  it("AuthProvider only imports the tiny owner module, not the Āwhina draft merge code", () => {
    const owner = read("app/lib/sky-ai-draft-owner.ts");
    const imports = [...owner.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./awhina-session-persist"]);
  });
});
