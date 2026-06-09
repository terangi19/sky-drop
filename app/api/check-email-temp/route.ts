import { NextRequest, NextResponse } from "next/server";
import { isDisposableEmail } from "../../lib/temp-email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const disposable = isDisposableEmail(email);
    return NextResponse.json({ disposable });
  } catch {
    return NextResponse.json({ disposable: false });
  }
}
