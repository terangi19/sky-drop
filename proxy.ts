import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  "/checkout", "/escrow", "/payments",
  "/manage", "/admin", "/blocked",
];

const ALLOWED_API_PREFIXES = [
  "/api/webhooks/stripe",
  "/api/cron",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const country = request.geo?.country || "";

  // ── NZ geo-blocking ──
  for (const prefix of ALLOWED_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }
  if (pathname.startsWith("/api") && !country) return NextResponse.next();

  const isBlocked = BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isBlocked && country && country !== "NZ") {
    return NextResponse.redirect(new URL("/unavailable", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
