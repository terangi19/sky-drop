import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseIpFromRequest } from "./app/lib/geo-check";
import {
  API_BURST_MAX,
  API_BURST_WINDOW_MS,
  API_GLOBAL_MAX,
  API_GLOBAL_WINDOW_MS,
  checkEdgeRateLimit,
  STRICT_API_ROUTES,
} from "./app/lib/rate-limit-edge";

/**
 * App-layer abuse resistance. Volumetric network DDoS still needs CDN/WAF
 * (Cloudflare, Vercel Firewall, AWS Shield). For distributed rate limits across
 * serverless instances, add Upstash Redis or Firebase App Check on clients.
 */

const BLOCKED_PATHS = [
  "/about", "/buyer-protection", "/trust", "/faqs",
  "/privacy", "/terms", "/seller-guidelines",
  "/login", "/forgot-password",
  "/profile", "/messages", "/notifications",
  "/purchases", "/sales", "/watchlist",
  "/list-list", "/wanted", "/trade-feed",
  "/vehicles", "/rentals", "/services",
  "/digital", "/property", "/events",
  "/opportunities", "/jobs",
  "/post", "/seller", "/reviews",
  "/reports", "/disputes", "/dashboard",
  "/checkout", "/payments",
  "/manage", "/admin", "/blocked",
];

const RATE_LIMIT_EXEMPT_PREFIXES = [
  "/api/webhooks/stripe",
  "/api/cron",
];

const LARGE_BODY_PREFIXES = ["/api/submit-kyc"];
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const LARGE_MAX_BODY_BYTES = 12 * 1024 * 1024;

function rateLimitResponse(retryAfterSec = 60) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "Cache-Control": "no-store",
      },
    }
  );
}

function checkApiRateLimits(pathname: string, ip: string): NextResponse | null {
  const burst = checkEdgeRateLimit(`api-burst:${ip}`, API_BURST_MAX, API_BURST_WINDOW_MS);
  if (!burst.allowed) {
    return rateLimitResponse(10);
  }

  for (const route of STRICT_API_ROUTES) {
    if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
      const strict = checkEdgeRateLimit(`api-${route.key}:${ip}`, route.max, route.windowMs);
      if (!strict.allowed) {
        return rateLimitResponse(Math.ceil(route.windowMs / 1000));
      }
      return null;
    }
  }

  const global = checkEdgeRateLimit(`api-global:${ip}`, API_GLOBAL_MAX, API_GLOBAL_WINDOW_MS);
  if (!global.allowed) {
    return rateLimitResponse(60);
  }

  return null;
}

function checkBodySizeLimit(request: NextRequest, pathname: string): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    return null;
  }

  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return null;
  }

  const allowLarge = LARGE_BODY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const maxBytes = allowLarge ? LARGE_MAX_BODY_BYTES : DEFAULT_MAX_BODY_BYTES;

  if (contentLength > maxBytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const country = request.geo?.country || "";

  for (const prefix of RATE_LIMIT_EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const ip = parseIpFromRequest(request.headers);

    const bodyLimit = checkBodySizeLimit(request, pathname);
    if (bodyLimit) return bodyLimit;

    const rateLimited = checkApiRateLimits(pathname, ip);
    if (rateLimited) return rateLimited;

    if (!country) return NextResponse.next();
  }

  const isBlocked = BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isBlocked && country && country !== "NZ") {
    return NextResponse.redirect(new URL("/unavailable", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
