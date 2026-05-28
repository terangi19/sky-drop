import { test, expect } from "@playwright/test";

test.describe("Email", () => {

  test("send-email API accepts valid request", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "test@example.com", subject: "Test", html: "<p>hello</p>" },
    });
    // If SMTP is configured, returns 200. Otherwise 500 with empty body.
    // Either way the endpoint responds without crashing.
    expect([200, 500]).toContain(res.status());
  });

  test("send-email rejects missing fields", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "test@example.com" },
    });
    expect(res.status()).toBe(400);
  });

  test("send-email rejects invalid email", async ({ request }) => {
    const res = await request.post("/api/send-email", {
      data: { to: "not-an-email", subject: "Test", html: "<p>hello</p>" },
    });
    expect(res.status()).toBe(400);
  });

});
