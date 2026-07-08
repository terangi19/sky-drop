import { describe, expect, it } from "vitest";
import {
  inferFindBrowseCategory,
  isActualVehicleQuery,
  isVehiclePartQuery,
  resolveFindBrowseRoute,
} from "./sky-ai-find-routing";
import { tryFindBrowseReply } from "./sky-ai-task-replies";

describe("sky-ai find routing", () => {
  it("routes car parts to physical search, not vehicles", () => {
    const cases = [
      "Find me a BMW spoiler",
      "Find 19 inch BMW rims",
      "Find an N54 turbo",
      "Show me BMW E92 parts for sale",
      "Looking for a Honda Civic bumper",
    ];
    for (const message of cases) {
      expect(isVehiclePartQuery(message, message), message).toBe(true);
      expect(isActualVehicleQuery(message, message), message).toBe(false);
      const route = resolveFindBrowseRoute(message);
      expect(route.category, message).toBe("physical");
      expect(route.path, message).toMatch(/^\/search\?q=/);
      expect(route.path, message).not.toContain("/vehicles");
    }
  });

  it("routes whole vehicles to vehicle search", () => {
    const cases = [
      "Find a BMW 335i",
      "Find a Hilux under $20000",
      "Find me a Toyota Corolla in Auckland",
      "Show me cars under $10000",
    ];
    for (const message of cases) {
      expect(isActualVehicleQuery(message, message), message).toBe(true);
      const route = resolveFindBrowseRoute(message);
      expect(route.category, message).toBe("vehicle");
      expect(route.path, message).toMatch(/^(\/search\?q=|\/vehicles)/);
      expect(route.path, message).not.toBe("/vehicles");
    }
  });

  it("uses uncertain make-only queries for all-listings search", () => {
    const route = resolveFindBrowseRoute("Find a BMW");
    expect(route.category).toBe("physical");
    expect(route.path).toMatch(/^\/search\?q=/);
    expect(route.path).not.toContain("/vehicles");
  });

  it("tryFindBrowseReply navigates to search for BMW spoiler", () => {
    const reply = tryFindBrowseReply("Find me a BMW spoiler");
    expect(reply).toBeTruthy();
    expect(reply!.navigateTo).toMatch(/^\/search\?q=/);
    expect(reply!.navigateTo).not.toContain("/vehicles");
    expect(reply!.text).toContain("Physical Items");
    expect(reply!.text).toContain("BMW spoiler");
  });

  it("tryFindBrowseReply navigates to vehicle search for BMW 335i", () => {
    const reply = tryFindBrowseReply("Find a BMW 335i");
    expect(reply).toBeTruthy();
    expect(reply!.navigateTo).toMatch(/^\/search\?q=/);
    expect(reply!.text).toContain("Vehicles");
  });

  it("infers physical category for gaming items", () => {
    expect(inferFindBrowseCategory("Find me a PS5 under $600", "PS5")).toBe("physical");
  });
});
