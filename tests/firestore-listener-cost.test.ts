import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

function readSrc(path: string): string {
  return readFileSync(path, "utf8");
}

describe("P0 Firestore listener cost guards", () => {
  it("Navbar does not hold messages/notifications/blocked onSnapshot listeners", () => {
    const src = readSrc("app/components/Navbar.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toContain("/api/unread-counts");
    expect(src).toMatch(/getDocs/);
  });

  it("useListings fetches with getDocs and keeps existing limits", () => {
    const src = readSrc("app/useListings.ts");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/GLOBAL_LISTINGS_LIMIT/);
    expect(src).toMatch(/limit\(sellerEmail \? 100 : GLOBAL_LISTINGS_LIMIT\)/);
  });

  it("post/listing browse uses getDocs instead of realtime listings snapshots", () => {
    const src = readSrc("app/post/listing/page.tsx");
    expect(src).not.toMatch(/\bonSnapshot\s*\(/);
    expect(src).toMatch(/getDocs/);
    expect(src).toMatch(/limit\(50\)/);
  });

  it("messages page still uses realtime listeners", () => {
    const src = readSrc("app/messages/page.tsx");
    expect(src).toMatch(/\bonSnapshot\b/);
  });
});
