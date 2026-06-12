import { NextRequest } from "next/server";
import { verifyIdToken } from "./firebase-admin";
import { isAdminUser } from "./admin-check.server";

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

  const decoded = await verifyIdToken(authHeader.slice(7));
  if (!decoded.email || !(await isAdminUser(decoded.email, decoded.uid))) {
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
