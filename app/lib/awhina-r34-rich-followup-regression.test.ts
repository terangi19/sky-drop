import { beforeEach, describe, expect, it } from "vitest";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const CONVERSATION_ID = "r34-rich-followup-cold-start";
const RICH_REPLY =
  "1999, 145,000 km, manual, silver, petrol, Used - Good, asking $38,000 NZD. " +
  "It has an aftermarket exhaust, intake, coilovers and aftermarket wheels. " +
  "Recently serviced, tidy interior, a few stone chips on the front and no known mechanical faults. " +
  "Located in Auckland.";

function wipe() {
  clearAllListingDraftCacheForTests();
  clearTaskScope(taskScopeKey({ conversationId: CONVERSATION_ID }));
}

describe("R34 rich follow-up regression", () => {
  beforeEach(wipe);

  it("keeps every vehicle fact across a cold serverless turn and never asks for year again", () => {
    const first = processCanonicalAwhina("List my Nissan Skyline R34", {
      conversationId: CONVERSATION_ID,
      pathname: "/post/ai",
    });

    expect(first.handled).toBe(true);
    expect(first.listingFill?.vehicleGeneration).toBe("R34");
    expect(first.sessionState?.task).toBeTruthy();

    const clientTask = first.sessionState?.task || null;
    const listingContext = first.listingFill as never;

    // Simulate Vercel routing the next request to a cold instance. The client
    // context must be sufficient; process memory must not be required.
    wipe();

    const second = processCanonicalAwhina(RICH_REPLY, {
      conversationId: CONVERSATION_ID,
      pathname: "/post/ai",
      listingContext,
      clientTask,
    });

    const fill = second.listingFill as SkyAiListingFill;
    expect(fill.vehicleYear).toBe("1999");
    expect(fill.vehicleOdometer).toBe("145000");
    expect(fill.vehicleTransmission).toBe("Manual");
    expect(fill.vehicleColour).toMatch(/silver/i);
    expect(fill.vehicleFuelType).toBe("Petrol");
    expect(fill.condition).toBe("Used - Good");
    expect(fill.price).toBe("38000");
    expect(fill.location).toBe("Auckland");

    const evidence = (fill.extras || []).join(" ").toLowerCase();
    expect(evidence).toMatch(/exhaust/);
    expect(evidence).toMatch(/intake/);
    expect(evidence).toMatch(/coilover/);
    expect(evidence).toMatch(/wheel/);
    expect(evidence).toMatch(/servic/);
    expect(evidence).toMatch(/stone chip/);
    expect(evidence).toMatch(/interior/);
    expect(evidence).toMatch(/mechanical|fault/);

    expect(second.sessionState?.pendingSlot).not.toBe("year");
    expect(String(second.reply || "")).not.toMatch(/what year is it/i);
  });

  it("replaces the stale two-sentence vehicle placeholder when richer facts arrive", () => {
    const fill: SkyAiListingFill = {
      listingType: "vehicle",
      category: "Cars",
      title: "1999 Nissan Skyline R34",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline",
      vehicleGeneration: "R34",
      vehicleYear: "1999",
      vehicleOdometer: "145000",
      vehicleTransmission: "Manual",
      vehicleColour: "Silver",
      vehicleFuelType: "Petrol",
      condition: "Used - Good",
      price: "38000",
      location: "Auckland",
      extras: [
        "modification:aftermarket exhaust",
        "modification:intake",
        "modification:coilovers",
        "modification:aftermarket wheels",
        "maintenance:recently serviced",
        "condition_detail:tidy interior",
        "condition_detail:a few stone chips on the front",
        "fault:no known mechanical faults",
      ],
      description:
        "Nissan Skyline R34 in Auckland. The car is in good used condition.",
      descriptionSource: "ai",
    };

    const refreshed = finalizeAwhinaListingDescription(fill, { force: true });
    const description = String(refreshed.description || "").toLowerCase();

    expect(description).not.toBe(
      "nissan skyline r34 in auckland. the car is in good used condition."
    );
    expect(description).toMatch(/145[,.]?000|145000/);
    expect(description).toMatch(/manual/);
    expect(description).toMatch(/exhaust|intake|coilover|wheel/);
    expect(description).toMatch(/servic|stone chip|interior|mechanical/);
  });
});
