import { describe, expect, it } from "vitest";
import { canTransition } from "./purchase-fsm";

describe("purchase-fsm", () => {
  it("allows seller fulfillment path without seller marking delivered", () => {
    expect(canTransition("seller_confirming", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransition("preparing", "shipped")).toBe(true);
  });

  it("allows buyer receipt confirmation from ready or shipped", () => {
    expect(canTransition("ready_for_pickup", "delivered")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
    expect(canTransition("delivered", "completed")).toBe(true);
  });

  it("supports service and rental legacy paths", () => {
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("completed", "delivered")).toBe(true);
    expect(canTransition("rented", "returned")).toBe(true);
    expect(canTransition("returned", "completed")).toBe(true);
  });
});
