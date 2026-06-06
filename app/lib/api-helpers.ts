import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "./firebase-admin";
import { rateLimit } from "./rate-limit";

/** Extract the client IP from standard proxy headers. */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Apply rate limiting using the client IP. Returns a 429 response if exceeded, or `null` if allowed. */
export async function applyRateLimit(
  req: NextRequest,
  key: string,
  maxRequests: number,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const { allowed } = await rateLimit(`${key}:${ip}`, maxRequests, windowMs);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return null;
}

export interface AuthResult {
  uid: string;
  email: string;
  idToken: string;
  decoded: { uid: string; email?: string; email_verified?: boolean; [key: string]: unknown };
}

/**
 * Verify the Bearer token from the Authorization header.
 * Returns the decoded token info on success, or a 401 NextResponse on failure.
 */
export async function authenticateRequest(
  req: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const idToken = authHeader.slice(7);
  try {
    const decoded = await verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email || "",
      idToken,
      decoded,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid or expired token";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/** Type guard: returns true when `authenticateRequest` returned an error response. */
export function isErrorResponse(
  result: AuthResult | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Require a non-empty email from the decoded token.
 * Returns a 400 NextResponse if email is missing, or `null` if present.
 */
export function requireEmail(
  auth: AuthResult,
  label = "user",
): NextResponse | null {
  if (!auth.email) {
    return NextResponse.json(
      { error: `Could not determine ${label} email` },
      { status: 400 },
    );
  }
  return null;
}
