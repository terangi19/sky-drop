import { NextResponse } from "next/server";
import { isDisposableEmail } from "./temp-email";

/** Returns a 403 response when the verified token email is disposable; null otherwise. */
export function disposableEmailBlock(email: string | undefined | null): NextResponse | null {
  if (email && isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Temporary email addresses aren't allowed. Use a permanent email." },
      { status: 403 }
    );
  }
  return null;
}
