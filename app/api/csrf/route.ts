import { NextResponse } from "next/server";
import { getCsrfToken } from "../../lib/csrf";

export async function GET() {
  try {
    const token = await getCsrfToken();
    return NextResponse.json({ csrfToken: token });
  } catch (error) {
    console.error("Failed to generate CSRF token:", error);
    return NextResponse.json({ error: "Failed to generate CSRF token" }, { status: 500 });
  }
}
