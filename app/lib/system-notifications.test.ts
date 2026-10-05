import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  writes: [] as Array<{ path: string; doc: Record<string, unknown> }>,
  profileDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}));

function makeCollection(path: string) {
  return {
    add: async (doc: Record<string, unknown>) => {
      h.writes.push({ path, doc });
      return { id: "n1" };
    },
    where: () => ({
      limit: () => ({
        get: async () => ({ empty: h.profileDocs.length === 0, docs: h.profileDocs }),
      }),
    }),
    doc: (id: string) => ({
      collection: (sub: string) => makeCollection(`${path}/${id}/${sub}`),
    }),
  };
}

vi.mock("./firebase-admin", () => ({
  isAdminInitialized: () => true,
  getAdminDb: () => ({ collection: (name: string) => makeCollection(name) }),
}));

import { createSystemNotification } from "./system-notifications";

const input = {
  targetEmail: "Buyer@Example.com",
  fromEmail: "seller@example.com",
  type: "saved_search_match",
  title: "New listing matches your search",
  message: 'New Phones: "iPhone"',
  listingId: "L1",
  listingTitle: "iPhone",
  listingImage: "img",
};

describe("createSystemNotification", () => {
  beforeEach(() => {
    h.writes.length = 0;
    h.profileDocs = [];
  });

  it("writes exactly one top-level notifications doc and nothing under users/{uid}/notifications", async () => {
    h.profileDocs = [{ id: "uid-buyer", data: () => ({}) }];
    await createSystemNotification(input);
    expect(h.writes.map((w) => w.path)).toEqual(["notifications"]);
    expect(h.writes[0].doc).toMatchObject({
      type: "saved_search_match",
      targetEmail: "buyer@example.com",
      fromEmail: "seller@example.com",
      read: false,
      listingId: "L1",
    });
  });

  it("still writes the notification when the target has no profile", async () => {
    await createSystemNotification(input);
    expect(h.writes.map((w) => w.path)).toEqual(["notifications"]);
  });

  it("still honours notification preferences (notifWatchlist=false blocks saved_search_match)", async () => {
    h.profileDocs = [{ id: "uid-buyer", data: () => ({ notifWatchlist: false }) }];
    await createSystemNotification(input);
    expect(h.writes).toEqual([]);
  });

  it("still skips self-notifications", async () => {
    await createSystemNotification({ ...input, fromEmail: "BUYER@example.com" });
    expect(h.writes).toEqual([]);
  });
});
