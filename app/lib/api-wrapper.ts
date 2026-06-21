import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "./api-error-handler";

/**
 * Standardized wrapper for API route handlers with consistent error handling
 */
export async function withApiHandler(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler(req);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Standardized wrapper for authenticated API routes
 */
export async function withAuthApiHandler(
  req: NextRequest,
  handler: (req: NextRequest, token: string) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    return await handler(req, token);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
