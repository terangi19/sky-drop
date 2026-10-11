import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("ProfileAccountClient does not write listings or trade posts", () => {
  const src = readFileSync(path.join(process.cwd(), "app/profile/ProfileAccountClient.tsx"), "utf8");
  const saveStart = src.indexOf("async function saveProfile");
  const saveEnd = src.indexOf("async function changePassword");
  const save = src.slice(saveStart, saveEnd);

  it("saveProfile no longer batch-updates sellerUsername", () => {
    expect(saveStart).toBeGreaterThan(0);
    expect(saveEnd).toBeGreaterThan(saveStart);
    expect(save).not.toMatch(/writeBatch/);
    expect(save).not.toMatch(/["']listings["']/);
    expect(save).not.toMatch(/["']tradePosts["']/);
    expect(save).toMatch(/fetch\("\/api\/save-profile"/);
  });

  it("the client file has no writeBatch of listings or tradePosts", () => {
    expect(src).not.toMatch(/\bwriteBatch\b/);
    expect(src).not.toMatch(/batch\.(update|set|delete)\s*\(/);
  });
});
