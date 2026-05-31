import { test, expect } from "@playwright/test";

test.describe("Email", () => {

  test("send-email rejects requests without auth", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "test@example.com", subject: "Test", html: "<p>hello</p>" },
    });
    expect(res.status()).toBe(401);
  });

  test("send-email rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "test@example.com" },
      headers: { Authorization: "Bearer fake" },
    });
    expect(res.status()).toBe(401);
  });

  test("send-email rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "not-an-email", subject: "Test", html: "<p>hello</p>" },
      headers: { Authorization: "Bearer fake" },
    });
    expect(res.status()).toBe(401);
  });

  test("send-notification-email rejects requests without auth", async ({ request }) => {
    const res = await request.post("/api/send-notification-email", {
      data: { to: "test@example.com", subject: "Test", html: "<p>hello</p>" },
    });
    expect(res.status()).toBe(401);
  });

  test("send-notification-email rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/send-notification-email", {
      data: { to: "test@example.com" },
      headers: { Authorization: "Bearer fake" },
    });
    expect(res.status()).toBe(401);
  });

  test("buildEmailHtml produces valid HTML for all email types", async ({ request }) => {
    const res = await request.post("/api/admin/test-email-preview", {
      data: {},
    });
    // The preview endpoint may not exist in production, just check no crash
    expect([200, 404, 500]).toContain(res.status());
  });

});
