import { auth } from "./firebase";
import { isPhoneDevMode } from "./phone-auth";
import { formatNZPhone, isValidNzMobile } from "./phone-format";

export async function claimVerifiedPhoneOnServer(phoneHint?: string): Promise<{
  success: boolean;
  error?: string;
  phone?: string;
}> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "Not signed in" };

  const body: Record<string, string> = {};
  if (isPhoneDevMode()) {
    const devPhone =
      (typeof window !== "undefined" && (window as unknown as { __devFormattedPhone?: string }).__devFormattedPhone) ||
      phoneHint;
    if (devPhone && isValidNzMobile(formatNZPhone(devPhone))) {
      body.phone = formatNZPhone(devPhone);
    }
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch("/api/claim-verified-phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: typeof data.error === "string" ? data.error : "Could not link phone number",
      };
    }
    return { success: true, phone: data.phone };
  } catch {
    return { success: false, error: "Could not link phone number" };
  }
}

export async function checkPhoneAvailable(phone: string): Promise<{
  available: boolean;
  message?: string;
}> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : undefined;
  const res = await fetch("/api/check-phone-availability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ phone, uid: user?.uid }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    available: !!data.available,
    message: data.message,
  };
}
