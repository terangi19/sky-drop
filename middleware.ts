import { NextRequest, NextResponse } from "next/server";

const NZ_ONLY_PAGES = [
  "/",
  "/about",
  "/buyer-protection",
  "/trust",
  "/faqs",
  "/privacy",
  "/terms",
  "/seller-guidelines",
  "/login",
  "/forgot-password",
  "/profile",
  "/messages",
  "/notifications",
  "/purchases",
  "/sales",
  "/watchlist",
  "/list-list",
  "/wanted",
  "/trade-feed",
  "/vehicles",
  "/rentals",
  "/services",
  "/digital",
  "/property",
  "/events",
  "/opportunities",
  "/jobs",
  "/post",
  "/seller",
  "/reviews",
  "/reports",
  "/disputes",
  "/dashboard",
  "/checkout",
  "/escrow",
  "/payments",
  "/manage",
  "/admin",
  "/blocked",
];

export function middleware(request: NextRequest) {
  const country = request.geo?.country || "";
  const url = request.nextUrl.pathname;

  const isNzoOnly = NZ_ONLY_PAGES.some((p) => url === p || url.startsWith(p + "/"));
  const isApiOrStatic = url.startsWith("/_next") || url.startsWith("/api") || url.startsWith("/favicon");

  if (isApiOrStatic) return NextResponse.next();

  if (isNzoOnly && country && country !== "NZ") {
    return NextResponse.redirect(new URL("/blocked", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
