import { auth } from "./firebase";

const NZ_PREFIXES = ["021", "022", "027", "028", "029"];

export function isPhoneDevMode(): boolean {
  return typeof window !== "undefined" && window.location.hostname === "localhost";
}

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

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 4) return phone;
  return `***${d.slice(-4)}`;
}

function clearPhoneVerificationState() {
  const w = window as any;
  if (w.__recaptchaVerifier) {
    try {
      w.__recaptchaVerifier.clear();
    } catch {}
  }
  w.__recaptchaVerifier = null;
  w.__phoneConfirmation = null;
  w.__phoneVerificationId = null;
  w.__devPhoneCode = null;
  w.__devFormattedPhone = null;
}

function errorMessage(e: any): string {
  const code = e?.code || "";
  const msg = e?.message || code || "";
  if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed"))
    return "Phone authentication is not enabled in Firebase. Enable Phone sign-in in Firebase Console → Authentication.";
  if (code === "auth/invalid-phone-number" || msg.includes("invalid-phone-number"))
    return "Invalid phone number. Use a valid NZ number like 021 123 4567.";
  if (code === "auth/too-many-requests" || msg.includes("too-many-requests"))
    return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/invalid-app-credential" || msg.includes("invalid-app-credential"))
    return "SMS could not be sent (app verification failed). Check Firebase authorized domains and reCAPTCHA settings.";
  if (code === "auth/captcha-check-failed" || msg.includes("captcha"))
    return "Security check failed. Refresh the page and try again.";
  if (code === "auth/code-expired" || msg.includes("expired"))
    return "Code expired. Request a new one.";
  if (code === "auth/invalid-verification-code" || msg.includes("invalid-verification-code"))
    return "Invalid code. Check the SMS and try again.";
  if (code === "auth/credential-already-in-use")
    return "This phone number is already linked to another Sky Drop account.";
  if (code === "auth/provider-already-linked")
    return "This account already has a phone number linked. Try signing out and back in.";
  if (code === "auth/requires-recent-login")
    return "Please sign out, sign in again, then verify your phone.";
  if (code === "auth/account-exists-with-different-credential")
    return "This phone is tied to a different sign-in method. Contact support if you need help.";
  return msg || "Failed to send code.";
}

async function createRecaptchaVerifier() {
  const { RecaptchaVerifier } = await import("firebase/auth");
  clearPhoneVerificationState();
  const container = document.getElementById("recaptcha-container");
  if (container) container.innerHTML = "";
  const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
  (window as any).__recaptchaVerifier = verifier;
  return verifier;
}

export async function sendPhoneCode(phone: string): Promise<{
  sent: boolean;
  error?: string;
  formattedPhone?: string;
  devMode?: boolean;
}> {
  const formatted = formatNZPhone(phone);

  if (!formatted.startsWith("+642") || formatted.length < 11) {
    return { sent: false, error: "Enter a valid NZ mobile number (e.g. 021 123 4567)." };
  }

  // Local dev — no SMS; use code 000000
  if (isPhoneDevMode()) {
    (window as any).__devPhoneCode = "000000";
    (window as any).__devFormattedPhone = formatted;
    return { sent: true, formattedPhone: formatted, devMode: true };
  }

  try {
    const { PhoneAuthProvider, signInWithPhoneNumber } = await import("firebase/auth");
    const verifier = await createRecaptchaVerifier();

    // Logged-in users (profile): link phone to existing account — do NOT signInWithPhoneNumber
    if (auth.currentUser) {
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(formatted, verifier);
      (window as any).__phoneVerificationId = verificationId;
      (window as any).__phoneConfirmation = null;
      return { sent: true, formattedPhone: formatted };
    }

    // No session (login/sign-up): standard phone sign-in flow
    const confirmation = await signInWithPhoneNumber(auth, formatted, verifier);
    (window as any).__phoneConfirmation = confirmation;
    (window as any).__phoneVerificationId = null;

    return { sent: true, formattedPhone: formatted };
  } catch (e: any) {
    clearPhoneVerificationState();
    return { sent: false, error: errorMessage(e) };
  }
}

export async function verifyPhoneCode(inputCode: string): Promise<{ ok: boolean; error?: string }> {
  const code = inputCode.trim();

  if (isPhoneDevMode()) {
    if ((window as any).__devPhoneCode && code === (window as any).__devPhoneCode) {
      clearPhoneVerificationState();
      return { ok: true };
    }
    return { ok: false, error: "Invalid code. On localhost use 000000 (no SMS is sent)." };
  }

  const verificationId = (window as any).__phoneVerificationId as string | undefined;
  const confirmation = (window as any).__phoneConfirmation;

  if (!verificationId && !confirmation) {
    return { ok: false, error: "No code sent. Tap Send code first." };
  }

  try {
    const { PhoneAuthProvider, linkWithCredential } = await import("firebase/auth");

    if (verificationId && auth.currentUser) {
      const credential = PhoneAuthProvider.credential(verificationId, code);
      try {
        await linkWithCredential(auth.currentUser, credential);
      } catch (e: any) {
        // Phone already linked to this account — still treat as verified for profile
        if (e?.code !== "auth/provider-already-linked") throw e;
      }
      clearPhoneVerificationState();
      return { ok: true };
    }

    if (confirmation) {
      await confirmation.confirm(code);
      clearPhoneVerificationState();
      return { ok: true };
    }

    return { ok: false, error: "No code sent. Tap Send code first." };
  } catch (e: any) {
    return { ok: false, error: errorMessage(e) };
  }
}
