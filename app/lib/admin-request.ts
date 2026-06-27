import { NextRequest } from "next/server";
import { verifyIdToken } from "./firebase-admin";
import { isAdminUser } from "./admin-check.server";
import { logSecurityWarning } from "./security-log";
import { rateLimit } from "./rate-limit";

export class AdminAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireAdminFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AdminAuthError(401, "Unauthorized");
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  // Stricter rate limit: 10 requests per minute per IP across all admin routes.
  // Prevents brute force attacks if admin credentials are compromised.
  const { allowed } = await rateLimit(`admin:${ip}`, 10, 60_000);
  if (!allowed) {
    await logSecurityWarning("rate_limit_admin", "Admin rate limit exceeded", { ip });
    throw new AdminAuthError(429, "Too many requests");
  }

  let decoded;
  try {
    decoded = await verifyIdToken(authHeader.slice(7));
  } catch (err) {
    await logSecurityWarning("admin_auth_failed", "Invalid token on admin route", {
      ip,
      metadata: { error: String(err) },
    });
    throw new AdminAuthError(401, "Unauthorized");
  }

  if (!decoded.email || !(await isAdminUser(decoded.email, decoded.uid))) {
    await logSecurityWarning("admin_access_denied", `Non-admin attempted admin route`, {
      actorEmail: decoded.email,
      actorUid: decoded.uid,
      ip,
      metadata: { path: req.nextUrl?.pathname },
    });
    throw new AdminAuthError(403, "Admin only");
  }

  return decoded;
}

export function serializeTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.getTime();
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}
