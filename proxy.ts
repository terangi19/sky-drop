import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "admin-session";

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

async function verifySessionCookie(token: string): Promise<boolean> {
  try {
    const secret = process.env.COOKIE_SECRET;
    if (!secret) return false;
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return false;
    const payloadB64 = token.slice(0, dotIdx);
    const sigHex = token.slice(dotIdx + 1);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const signature = new Uint8Array(sigHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(payloadB64));
    if (!valid) return false;
    const decoded = JSON.parse(atob(payloadB64));
    return decoded.admin === true && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const country = request.geo?.country || "";

  // ── Admin session check ──
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token || !(await verifySessionCookie(token))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

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
