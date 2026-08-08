import { describe, expect, it } from "vitest";
import {
  notifCategoryForType,
  profileAllowsNotificationDelivery,
  profileAllowsNotificationEmail,
  profileAllowsNotificationType,
  isInQuietHours,
} from "./notification-prefs";

describe("notification-prefs", () => {
  it("maps message and listing types to categories", () => {
    expect(notifCategoryForType("message")).toBe("messages");
    expect(notifCategoryForType("offer")).toBe("messages");
    expect(notifCategoryForType("bid")).toBe("listing_activity");
    expect(notifCategoryForType("saved_search_match")).toBe("wanted_saved");
    expect(notifCategoryForType("platform_update")).toBe("platform");
    expect(notifCategoryForType("security")).toBe("always");
  });

  it("respects category toggles", () => {
    const profile = {
      notifMessages: false,
      notifListingActivity: true,
      notifWatchlist: false,
      notifPlatform: true,
    };
    expect(profileAllowsNotificationType(profile, "message")).toBe(false);
    expect(profileAllowsNotificationType(profile, "bid")).toBe(true);
    expect(profileAllowsNotificationType(profile, "saved_search_match")).toBe(false);
    expect(profileAllowsNotificationType(profile, "platform")).toBe(true);
    expect(profileAllowsNotificationType(profile, "security")).toBe(true);
  });

  it("fails open when profile missing", () => {
    expect(profileAllowsNotificationType(null, "message")).toBe(true);
    expect(profileAllowsNotificationEmail(undefined)).toBe(true);
  });

  it("applies quiet hours for non-critical types", () => {
    const profile = {
      notifQuietHours: true,
      notifQuietHoursStart: "22:00",
      notifQuietHoursEnd: "08:00",
      notifMessages: true,
    };
    const late = new Date("2026-08-09T23:30:00");
    expect(isInQuietHours(profile, late)).toBe(true);
    expect(profileAllowsNotificationDelivery(profile, "message", late)).toBe(false);
    expect(profileAllowsNotificationDelivery(profile, "security", late)).toBe(true);
  });
});
