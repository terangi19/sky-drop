import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "admin-session";

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
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = new Uint8Array(sigHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const payload = encoder.encode(payloadB64);
    const valid = await crypto.subtle.verify("HMAC", key, signature, payload);

    if (!valid) return false;

    const decoded = JSON.parse(atob(payloadB64));
    return decoded.admin === true && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token || !(await verifySessionCookie(token))) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
