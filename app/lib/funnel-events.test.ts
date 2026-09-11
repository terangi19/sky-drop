import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ db: {} }));

const addDoc = vi.fn(() => Promise.resolve({ id: "evt" }));
vi.mock("firebase/firestore", () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  collection: vi.fn(() => ({ path: "funnelEvents" })),
  serverTimestamp: vi.fn(() => "ts"),
}));

import { trackFunnelEvent } from "./funnel-events";

describe("trackFunnelEvent", () => {
  const prevPublic = process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;

  afterEach(() => {
    addDoc.mockClear();
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;
    else process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = prevPublic;
  });

  it("does not write funnelEvents when the beta flag is off", () => {
    delete process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;
    trackFunnelEvent({ event: "signup_started", userId: "u1" });
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "false";
    trackFunnelEvent({ event: "signup_started", userId: "u1" });
    expect(addDoc).not.toHaveBeenCalled();
  });

  it("writes when the public flag is exactly true", () => {
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "true";
    trackFunnelEvent({ event: "signup_started", userId: "u1" });
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it("skips writes without a userId even when enabled", () => {
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "true";
    trackFunnelEvent({ event: "signup_started", userId: "" });
    expect(addDoc).not.toHaveBeenCalled();
  });
});
