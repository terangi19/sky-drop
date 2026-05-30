// Phone auth — tries Firebase SMS, falls back to email code delivery
import { auth } from "./firebase";
import { buildEmailHtml } from "./email";

let _pendingCode: string | null = null;
let _pendingPhone: string | null = null;

const NZ_PREFIXES = ["021", "022", "027", "028", "029"];

export function formatNZPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("642") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("64") && digits.length >= 10) return `+${digits}`;
  for (const prefix of NZ_PREFIXES) {
    if (digits.startsWith(prefix.slice(1)) && digits.length >= 10) return `+642${digits.slice(2)}`;
    if (digits.startsWith(prefix) && digits.length >= 8) return `+64${digits.slice(1)}`;
  }
  if (digits.startsWith("0") && digits.length >= 8) return `+64${digits.slice(1)}`;
  if (!digits.startsWith("+")) return `+${digits}`;
  return digits;
}

export function displayPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("642") && d.length >= 10) {
    return `+64 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  return phone;
}

function errorMessage(e: any): string {
  const msg = e?.message || e?.code || "";
  if (msg.includes("operation-not-allowed") || msg.includes("OPERATION_NOT_ALLOWED"))
    return "Phone auth not enabled in Firebase Console.";
  if (msg.includes("invalid-phone-number") || msg.includes("INVALID_PHONE_NUMBER"))
    return "Invalid phone number. Use format: 021 123 4567";
  if (msg.includes("TOO_MANY_ATTEMPTS") || msg.includes("too-many-requests"))
    return "Too many attempts. Wait a moment and try again.";
  if (msg.includes("invalid-app-credential") || msg.includes("INVALID_APP_CREDENTIAL"))
    return "Phone verification unavailable in dev mode. Code sent via email instead.";
  if (msg.includes("SESSION_EXPIRED") || msg.includes("expired"))
    return "Code expired. Request a new one.";
  if (msg.includes("INVALID_CODE"))
    return "Invalid code. Try again.";
  return msg || "Failed to send code.";
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendPhoneCode(phone: string): Promise<{
  sent: boolean;
  error?: string;
  formattedPhone?: string;
  viaEmail?: boolean;
}> {
  const formatted = formatNZPhone(phone);

  // Try Firebase Phone Auth first
  try {
    const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");

    if ((window as any).__recaptchaVerifier) {
      try { (window as any).__recaptchaVerifier.clear(); } catch {}
    }
    (window as any).__recaptchaVerifier = null;

    const container = document.getElementById("recaptcha-container");
    if (container) container.innerHTML = "";

    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    (window as any).__recaptchaVerifier = verifier;

    const confirmation = await signInWithPhoneNumber(auth, formatted, verifier);
    (window as any).__phoneConfirmation = confirmation;
    _pendingCode = null;
    _pendingPhone = null;

    return { sent: true, formattedPhone: formatted };
  } catch (e: any) {
    // If Firebase Phone Auth fails, fall back to email code delivery
    if (auth?.currentUser?.email) {
      const code = generateCode();
      _pendingCode = code;
      _pendingPhone = formatted;

      try {
        const token = await auth.currentUser.getIdToken();
        const html = buildEmailHtml({
          to: auth.currentUser.email,
          subject: `Your phone verification code: ${code}`,
          title: "Phone Verification Code",
          message: `Your verification code is:\n\n**${code}**\n\nEnter this code in the app to verify your phone number.\n\nPhone: ${displayPhone(formatted)}\n\nThis code expires in 10 minutes.`,
          ctas: [{ label: "Open Sky Drop", url: window.location.origin + "/profile", primary: true }],
        });
        await fetch("/api/send-notification-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: auth.currentUser.email, subject: `Your verification code: ${code}`, html }),
        });
        return { sent: true, formattedPhone: formatted, viaEmail: true };
      } catch {}
    }

    return { sent: false, error: errorMessage(e) };
  }
}

export async function verifyPhoneCode(inputCode: string): Promise<{ ok: boolean; error?: string }> {
  // Firebase path
  const confirmation = (window as any).__phoneConfirmation;
  if (confirmation) {
    try {
      await confirmation.confirm(inputCode);
      (window as any).__phoneConfirmation = null;
      (window as any).__recaptchaVerifier = null;
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  // Email fallback path
  if (_pendingCode && _pendingCode === inputCode.trim()) {
    _pendingCode = null;
    _pendingPhone = null;
    return { ok: true };
  }

  if (_pendingCode) {
    return { ok: false, error: "Invalid code. Check and try again." };
  }

  return { ok: false, error: "No code sent. Click Send Code first." };
}
