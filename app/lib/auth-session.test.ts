import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("firebase auth persistence", () => {
  it("initializes client auth with local persistence before use", () => {
    const file = readFileSync(
      path.join(process.cwd(), "app/lib/firebase.ts"),
      "utf8"
    );

    expect(file).toContain("initializeAuth");
    expect(file).toContain("indexedDBLocalPersistence");
    expect(file).toContain("browserLocalPersistence");
    expect(file).not.toMatch(/auth\.setPersistence/);
  });
});
