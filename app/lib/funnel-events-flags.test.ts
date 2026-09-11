import { afterEach, describe, expect, it } from "vitest";
import { isFunnelEventsEnabled } from "./funnel-events-flags";

describe("funnel-events-flags", () => {
  const prevPublic = process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;
    else process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = prevPublic;
  });

  it("defaults off when unset", () => {
    delete process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED;
    expect(isFunnelEventsEnabled()).toBe(false);
  });

  it("enables only on exact true", () => {
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "true";
    expect(isFunnelEventsEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "false";
    expect(isFunnelEventsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_FUNNEL_EVENTS_ENABLED = "1";
    expect(isFunnelEventsEnabled()).toBe(false);
  });
});
