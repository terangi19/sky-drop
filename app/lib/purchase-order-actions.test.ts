import { describe, expect, it } from "vitest";
import {
  getBuyerNextAction,
  getSellerNextAction,
  getSellerWaitingMessage,
  isSellerWaitingForBuyer,
} from "./purchase-order-actions";

describe("purchase-order-actions", () => {
  it("seller progresses pickup order through preparing to ready_for_pickup", () => {
    expect(getSellerNextAction({ status: "seller_confirming", deliveryMethod: "pickup" })).toMatchObject({
      status: "preparing",
    });
    expect(getSellerNextAction({ status: "preparing", deliveryMethod: "pickup" })).toMatchObject({
      status: "ready_for_pickup",
      label: "Mark Ready for Pickup",
    });
  });

  it("seller ships from preparing for shipping orders", () => {
    expect(getSellerNextAction({ status: "preparing", deliveryMethod: "shipping" })).toMatchObject({
      status: "shipped",
      needsTracking: true,
    });
  });

  it("seller never gets mark delivered after ready or shipped", () => {
    expect(getSellerNextAction({ status: "ready_for_pickup", deliveryMethod: "pickup" })).toBeNull();
    expect(getSellerNextAction({ status: "shipped", deliveryMethod: "shipping" })).toBeNull();
    expect(isSellerWaitingForBuyer({ status: "ready_for_pickup" })).toBe(true);
    expect(isSellerWaitingForBuyer({ status: "shipped" })).toBe(true);
    expect(getSellerWaitingMessage({ status: "shipped" })).toContain("confirm receipt");
  });

  it("buyer confirms receipt from ready_for_pickup or shipped", () => {
    expect(getBuyerNextAction({ status: "ready_for_pickup", deliveryMethod: "pickup" })).toMatchObject({
      status: "delivered",
      label: "Confirm Receipt",
    });
    expect(getBuyerNextAction({ status: "shipped", deliveryMethod: "shipping" })).toMatchObject({
      status: "delivered",
    });
  });

  it("blocks actions on refunded or disputed orders", () => {
    expect(getSellerNextAction({ status: "shipped", disputeStatus: "open" })).toBeNull();
    expect(getBuyerNextAction({ status: "refunded", deliveryMethod: "shipping" })).toBeNull();
  });
});
