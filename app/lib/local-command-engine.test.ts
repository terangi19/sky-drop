import { describe, expect, it } from "vitest";
import { matchLocalCommand } from "./local-command-engine";

describe("local voice marketplace refinements", () => {
  it("supports search location follow-ups", () => {
    const cmd = matchLocalCommand("show only Auckland", "/search");
    expect(cmd?.type).toBe("page");
    expect(cmd?.status).toMatch(/Auckland/i);
  });

  it("supports price cap follow-ups", () => {
    const cmd = matchLocalCommand("only under $300", "/search");
    expect(cmd?.type).toBe("page");
    expect(cmd?.status).toMatch(/\$300/);
  });

  it("supports better deals follow-ups", () => {
    const cmd = matchLocalCommand("find better deals", "/search");
    expect(cmd?.type).toBe("page");
  });

  it("supports auction-only follow-ups", () => {
    const cmd = matchLocalCommand("actually show auctions", "/search");
    expect(cmd?.type).toBe("page");
    expect(cmd?.status).toMatch(/auctions/i);
  });

  it("supports similar listings on listing page", () => {
    const cmd = matchLocalCommand("show similar listings", "/post/listing/abc");
    expect(cmd?.type).toBe("page");
  });

  it("supports offer preparation on listing page", () => {
    const cmd = matchLocalCommand("offer $250", "/post/listing/abc");
    expect(cmd?.type).toBe("page");
    expect(cmd?.status).toMatch(/\$250/);
  });
});
