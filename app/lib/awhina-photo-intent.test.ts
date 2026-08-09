import { describe, it, expect } from "vitest";
import {
  classifyAwhinaPhotoIntent,
  buildIdentifyOnlyReply,
  buildSellOfferReply,
} from "./awhina-photo-intent";

describe("classifyAwhinaPhotoIntent", () => {
  it("sell page always sell", () => {
    expect(classifyAwhinaPhotoIntent("what is this", { onSellPage: true })).toBe("sell");
  });

  it("what is this → identify", () => {
    expect(classifyAwhinaPhotoIntent("what is this?")).toBe("identify");
  });

  it("sell this for 500 → sell", () => {
    expect(classifyAwhinaPhotoIntent("sell this for 500")).toBe("sell");
  });

  it("photo only → ambiguous", () => {
    expect(classifyAwhinaPhotoIntent("")).toBe("ambiguous");
  });

  it("prior selling task + photo → sell", () => {
    expect(classifyAwhinaPhotoIntent("", { priorSellingTask: true })).toBe("sell");
  });
});

describe("photo intent copy", () => {
  it("identify has no sell CTA", () => {
    expect(buildIdentifyOnlyReply("PlayStation 5")).toMatch(/PlayStation 5/);
    expect(buildIdentifyOnlyReply("PlayStation 5").toLowerCase()).not.toMatch(/sell/);
  });

  it("ambiguous offers sell", () => {
    expect(buildSellOfferReply("PlayStation 5").toLowerCase()).toMatch(/sell/);
  });
});
