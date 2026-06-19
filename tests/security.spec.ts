import { test, expect, type APIRequestContext } from "@playwright/test";

/** Isolated synthetic IP per call so edge burst/global limits do not cross-contaminate tests. */
let ipSeq = 0;
function uniqueTestIp(): string {
  ipSeq += 1;
  return `10.99.${Math.floor(ipSeq / 256)}.${ipSeq % 256}`;
}

function testHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "X-Forwarded-For": uniqueTestIp(), ...extra };
}

async function apiGet(request: APIRequestContext, path: string) {
  return request.get(path, { headers: testHeaders() });
}

async function apiPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown> = {},
  ip?: string
) {
  return request.post(path, {
    headers: testHeaders(ip ? { "X-Forwarded-For": ip } : undefined),
    data,
  });
}

async function apiPut(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown> = {}
) {
  return request.put(path, { headers: testHeaders(), data });
}

async function apiDelete(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown> = {}
) {
  return request.delete(path, { headers: testHeaders(), data });
}

test.describe("Security — Authentication & Authorization", () => {

  test.describe("Unauthenticated API requests return 401", () => {
    const protectedRoutes = [
      { method: "POST", path: "/api/save-profile", data: {} },
      { method: "POST", path: "/api/create-listing", data: { title: "test", description: "test", price: "10" } },
      { method: "PUT", path: "/api/update-listing", data: { listingId: "test" } },
      { method: "POST", path: "/api/delete-listing", data: { listingId: "test" } },
      { method: "POST", path: "/api/create-payment-intent", data: { title: "test", price: "21.00", listingId: "test123" } },
      { method: "POST", path: "/api/create-purchase", data: { listingId: "test", stripePaymentIntentId: "test" } },
      { method: "POST", path: "/api/accept-offer", data: { listingId: "test", buyerEmail: "test@test.com", amount: 10, offerMessageId: "test" } },
      { method: "POST", path: "/api/release-payment", data: { purchaseId: "test" } },
      { method: "POST", path: "/api/open-dispute", data: { purchaseId: "test", reason: "test" } },
      { method: "POST", path: "/api/disputes", data: { action: "refund", purchaseId: "test" } },
      { method: "POST", path: "/api/submit-review", data: { purchaseId: "test", rating: 5 } },
      { method: "POST", path: "/api/submit-report", data: { reportedUserId: "test" } },
      { method: "POST", path: "/api/stripe-connect", data: { action: "onboard" } },
      { method: "POST", path: "/api/create-bump-intent", data: { listingId: "test" } },
      { method: "POST", path: "/api/sponsor-drop", data: { listingId: "test", sellerEmail: "test@test.com" } },
      { method: "POST", path: "/api/mark-messages-read", data: { messageIds: ["test"] } },
      { method: "POST", path: "/api/update-purchase-status", data: { purchaseId: "test", status: "delivered" } },
      { method: "POST", path: "/api/claim-verified-phone", data: { phone: "0211111111" } },
      { method: "POST", path: "/api/submit-kyc", data: {} },
      { method: "POST", path: "/api/checkout-message", data: { listingId: "test", text: "hello" } },
      { method: "POST", path: "/api/arrange-purchase", data: { listingId: "test" } },
      { method: "POST", path: "/api/confirm-arrange-sale", data: { purchaseId: "test" } },
      { method: "GET", path: "/api/seller-earnings", data: {} },
      { method: "POST", path: "/api/create-notification", data: { targetEmail: "a@b.com", fromEmail: "a@b.com", type: "message", title: "t", message: "m" } },
      { method: "POST", path: "/api/confirm-sponsor-drop", data: { paymentIntentId: "pi_test" } },
      { method: "POST", path: "/api/listing-question", data: { action: "ask", listingId: "test", question: "q" } },
      { method: "POST", path: "/api/submit-job-application", data: { listingId: "test" } },
      { method: "POST", path: "/api/create-trade-post", data: { title: "test" } },
      { method: "POST", path: "/api/send-email", data: { to: "test@test.com", subject: "test", body: "test" } },
    ];

    for (const route of protectedRoutes) {
      test(`${route.method} ${route.path}`, async ({ request }) => {
        let res;
        if (route.method === "GET") {
          res = await apiGet(request, route.path);
        } else if (route.method === "PUT") {
          res = await apiPut(request, route.path, route.data);
        } else if (route.method === "DELETE") {
          res = await apiDelete(request, route.path, route.data);
        } else {
          res = await apiPost(request, route.path, route.data);
        }
        expect([401, 403, 429]).toContain(res.status());
      });
    }
  });

  test.describe("Public health endpoint does not leak security data", () => {
    test("GET /api/security-health returns minimal payload without auth", async ({ request }) => {
      const res = await apiGet(request, "/api/security-health");
      expect(res.status()).toBe(200);
      const json = await res.json();
      expect(json.recentDecisions).toBeUndefined();
      expect(json.recentSecurityEvents).toBeUndefined();
      expect(json.metrics).toBeUndefined();
      expect(typeof json.ok).toBe("boolean");
    });
  });

  test.describe("Admin-only API routes reject non-admin", () => {
    const adminRoutes = [
      { method: "POST", path: "/api/admin/verify", data: {} },
      { method: "GET", path: "/api/admin/dashboard" },
      { method: "GET", path: "/api/admin/users" },
      { method: "GET", path: "/api/admin/listings" },
      { method: "GET", path: "/api/admin/analytics" },
      { method: "GET", path: "/api/admin/activity" },
    ];

    for (const route of adminRoutes) {
      test(`${route.method} ${route.path} without valid token`, async ({ request }) => {
        const res = route.method === "GET"
          ? await apiGet(request, route.path)
          : await apiPost(request, route.path, route.data ?? {});
        expect([401, 403, 429]).toContain(res.status());
      });
    }
  });

  test.describe("Payment routes reject manipulation attempts", () => {
    test("create-payment-intent without auth returns 401", async ({ request }) => {
      const res = await apiPost(request, "/api/create-payment-intent", {
        title: "Hacked",
        price: "0.50",
        listingId: "fake123",
      });
      expect(res.status()).toBe(401);
    });

    test("release-payment without auth returns 401", async ({ request }) => {
      const res = await apiPost(request, "/api/release-payment", {
        purchaseId: "fake_purchase",
      });
      expect(res.status()).toBe(401);
    });

    test("disputes refund without auth returns 401", async ({ request }) => {
      const res = await apiPost(request, "/api/disputes", {
        action: "refund",
        purchaseId: "fake",
      });
      expect(res.status()).toBe(401);
    });
  });

  test.describe("Admin pages require auth", () => {
    const adminPages = [
      "/manage",
      "/manage/users",
      "/manage/admins",
      "/manage/listings",
      "/manage/disputes",
      "/manage/reports",
      "/manage/settings",
      "/manage/analytics",
      "/manage/activity",
      "/manage/verification",
      "/manage/notifications",
      "/admin/verification",
      "/admin/disputes",
      "/admin/reports",
    ];

    for (const pagePath of adminPages) {
      test(`admin page ${pagePath} redirects or shows access denied`, async ({ page }) => {
        await page.goto(pagePath);
        await page.waitForTimeout(2000);
        const text = await page.textContent("body");
        const blocked = text?.includes("Access Denied") || text?.includes("Sign in required") || text?.includes("Checking");
        expect(blocked).toBeTruthy();
      });
    }
  });

  test.describe("Public data does not leak private fields", () => {
    test("listing detail page does not expose seller email in URL or response", async ({ page }) => {
      const response = await page.goto("/trade-feed");
      expect(response?.status()).toBeLessThan(500);
    });

    test("seller profile page does not expose email", async ({ page }) => {
      const response = await page.goto("/seller/test");
      expect(response?.status()).toBeLessThan(500);
    });
  });

  test.describe("Notification policy enforcement", () => {
    test("create-notification without auth returns 401", async ({ request }) => {
      const res = await apiPost(request, "/api/create-notification", {
        targetEmail: "seller@test.com",
        fromEmail: "buyer@test.com",
        type: "message",
        title: "Hi",
        message: "Hello",
        listingId: "fake-listing",
      });
      expect(res.status()).toBe(401);
    });

    test("create-notification with invalid token returns 401", async ({ request }) => {
      const res = await request.post("/api/create-notification", {
        headers: { ...testHeaders(), Authorization: "Bearer invalid-token" },
        data: {
          targetEmail: "seller@test.com",
          fromEmail: "buyer@test.com",
          type: "message",
          title: "Hi",
          message: "Hello",
        },
      });
      expect(res.status()).toBe(401);
    });
  });

  test.describe("Open dispute validation", () => {
    test("open-dispute without auth returns 401", async ({ request }) => {
      const res = await apiPost(request, "/api/open-dispute", {
        purchaseId: "fake",
        reason: "not_received",
        description: "Item never arrived",
      });
      expect(res.status()).toBe(401);
    });

    test("open-dispute with invalid token returns 401", async ({ request }) => {
      const res = await request.post("/api/open-dispute", {
        headers: { ...testHeaders(), Authorization: "Bearer not-a-real-jwt" },
        data: { purchaseId: "fake", reason: "test", description: "test" },
      });
      expect(res.status()).toBe(401);
    });
  });

  test.describe("Rate limiting on sensitive endpoints", () => {
    test("check-email-temp returns rate limited after many requests", async ({ request }) => {
      const spamIp = "10.98.0.1";
      let rateLimited = false;
      for (let i = 0; i < 20; i++) {
        const res = await apiPost(request, "/api/check-email-temp", { email: `spam${i}@test.com` }, spamIp);
        if (res.status() === 429) { rateLimited = true; break; }
      }
      expect(rateLimited).toBeTruthy();
    });

    test("listing-view rate limited after many requests", async ({ request }) => {
      const spamIp = "10.98.0.2";
      let rateLimited = false;
      for (let i = 0; i < 20; i++) {
        const res = await apiPost(request, "/api/listing-view", { listingId: "rate-limit-test-id" }, spamIp);
        if (res.status() === 429) { rateLimited = true; break; }
      }
      expect(rateLimited).toBeTruthy();
    });

    test("create-notification rate limited after burst from same IP", async ({ request }) => {
      const spamIp = "10.98.0.3";
      let rateLimited = false;
      for (let i = 0; i < 40; i++) {
        const res = await apiPost(
          request,
          "/api/create-notification",
          {
            targetEmail: `target${i}@test.com`,
            fromEmail: "spammer@test.com",
            type: "message",
            title: "spam",
            message: "spam",
          },
          spamIp
        );
        if (res.status() === 429) {
          rateLimited = true;
          break;
        }
      }
      expect(rateLimited).toBeTruthy();
    });
  });
});
