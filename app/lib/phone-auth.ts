import { auth } from "./firebase";
import { formatNZPhone, isValidNzMobile } from "./phone-format";

export { formatNZPhone, isValidNzMobile } from "./phone-format";

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") console.log(...args);
}

export function isPhoneDevMode(): boolean {
  return typeof window !== "undefined" && window.location.hostname === "localhost";
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length <= 4) return phone;
  return `***${d.slice(-4)}`;
}

function clearPhoneVerificationState() {
  const w = window as any;
  w.__phoneConfirmation = null;
  w.__phoneVerificationId = null;
  w.__devPhoneCode = null;
  w.__devFormattedPhone = null;
}

export function phoneAuthErrorCode(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code) return code;
  const msg = String((e as { message?: string })?.message || "").toLowerCase();
  if (msg.includes("too-many-requests")) return "auth/too-many-requests";
  if (msg.includes("captcha-check-failed")) return "auth/captcha-check-failed";
  if (msg.includes("invalid-app-credential")) return "auth/invalid-app-credential";
  if (msg.includes("invalid-phone-number")) return "auth/invalid-phone-number";
  if (msg.includes("invalid-verification-code")) return "auth/invalid-verification-code";
  if (msg.includes("code-expired") || msg.includes("expired")) return "auth/code-expired";
  return "";
}

function errorMessage(e: any): string {
  const code = phoneAuthErrorCode(e);
  const msg = (e?.message || code || "").toLowerCase();
  if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed"))
    return "Phone authentication is not enabled in Firebase. Enable Phone sign-in in Firebase Console → Authentication.";
  if (code === "auth/invalid-phone-number" || msg.includes("invalid-phone-number"))
    return "Invalid phone number. Use a valid NZ mobile like 021 123 4567.";
  if (code === "auth/too-many-requests")
    return "Too many SMS requests from this device or number. Firebase may still be blocking from earlier attempts — wait 15–60 minutes, then try again.";
  if (code === "auth/invalid-app-credential" || msg.includes("invalid-app-credential"))
    return "SMS could not be sent (app verification failed). Check Firebase authorized domains and reCAPTCHA settings.";
  if (code === "auth/captcha-check-failed")
    return "Security check failed. Refresh the page and try again. If it keeps failing, disable ad blockers or try another browser.";
  if (msg.includes("recaptcha"))
    return "Security check failed. Refresh the page and try again. If it keeps failing, disable ad blockers or try another browser.";
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
  return e?.message || "Failed to send code.";
}

let _verifier: any = null;

function resetRecaptchaVerifier() {
  if (_verifier) {
    try {
      _verifier.clear();
    } catch {}
    _verifier = null;
  }
  const el = document.getElementById("recaptcha-container");
  if (el) el.innerHTML = "";
}

/** Firebase requires a fresh invisible reCAPTCHA verifier for each SMS request. */
async function createRecaptchaVerifier() {
  resetRecaptchaVerifier();
  if (!document.getElementById("recaptcha-container")) {
    throw new Error("reCAPTCHA container missing from page");
  }
  devLog("[phone-auth] Creating new reCAPTCHA verifier");
  const { RecaptchaVerifier } = await import("firebase/auth");
  _verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible",
    callback: () => devLog("[phone-auth] reCAPTCHA solved"),
    "expired-callback": () => {
      devLog("[phone-auth] reCAPTCHA expired");
      resetRecaptchaVerifier();
    },
  });
  await _verifier.render();
  devLog("[phone-auth] reCAPTCHA verifier rendered");
  return _verifier;
}

export async function sendPhoneCode(phone: string): Promise<{
  sent: boolean;
  error?: string;
  errorCode?: string;
  formattedPhone?: string;
  devMode?: boolean;
}> {
  const formatted = formatNZPhone(phone);
  devLog("[phone-auth] sendPhoneCode called", { raw: phone, formatted });

  if (!formatted || !isValidNzMobile(formatted)) {
    console.warn("[phone-auth] Invalid NZ mobile number", { phone, formatted });
    return {
      sent: false,
      error:
        "Enter a valid NZ mobile number starting with 021, 022, 027, 028, or 029 (e.g. 021 123 4567).",
    };
  }

  if (isPhoneDevMode()) {
    devLog("[phone-auth] Dev mode — using 000000");
    (window as any).__devPhoneCode = "000000";
    (window as any).__devFormattedPhone = formatted;
    return { sent: true, formattedPhone: formatted, devMode: true };
  }

  try {
    const { PhoneAuthProvider, signInWithPhoneNumber } = await import("firebase/auth");
    devLog("[phone-auth] Firebase modules loaded, creating reCAPTCHA verifier");
    const verifier = await createRecaptchaVerifier();
    devLog("[phone-auth] reCAPTCHA verifier ready");

    if (auth.currentUser) {
      devLog("[phone-auth] User is logged in — calling provider.verifyPhoneNumber", { formatted });
      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(formatted, verifier);
      devLog("[phone-auth] verifyPhoneNumber succeeded", { verificationId });
      resetRecaptchaVerifier();
      (window as any).__phoneVerificationId = verificationId;
      (window as any).__phoneConfirmation = null;
      return { sent: true, formattedPhone: formatted };
    }

    devLog("[phone-auth] No session — calling signInWithPhoneNumber", { formatted });
    const confirmation = await signInWithPhoneNumber(auth, formatted, verifier);
    devLog("[phone-auth] signInWithPhoneNumber succeeded", { confirmation: !!confirmation });
    resetRecaptchaVerifier();
    (window as any).__phoneConfirmation = confirmation;
    (window as any).__phoneVerificationId = null;

    return { sent: true, formattedPhone: formatted };
  } catch (e: any) {
    console.error("[phone-auth] ERROR — full error object:", e);
    console.error("[phone-auth] ERROR code:", e?.code);
    console.error("[phone-auth] ERROR message:", e?.message);
    console.error("[phone-auth] ERROR name:", e?.name);
    if (e?.customData) console.error("[phone-auth] ERROR customData:", e.customData);
    resetRecaptchaVerifier();
    clearPhoneVerificationState();
    return { sent: false, error: errorMessage(e), errorCode: phoneAuthErrorCode(e) || undefined };
  }
}

export async function verifyPhoneCode(inputCode: string): Promise<{
  ok: boolean;
  error?: string;
  errorCode?: string;
}> {
  const code = inputCode.trim();
  devLog("[phone-auth] verifyPhoneCode called", { codeLength: code.length });

  if (isPhoneDevMode()) {
    if ((window as any).__devPhoneCode && code === (window as any).__devPhoneCode) {
      clearPhoneVerificationState();
      devLog("[phone-auth] Dev mode code verified");
      return { ok: true };
    }
    return { ok: false, error: "Invalid code. On localhost use 000000 (no SMS is sent)." };
  }

  const verificationId = (window as any).__phoneVerificationId as string | undefined;
  const confirmation = (window as any).__phoneConfirmation;
  devLog("[phone-auth] verify state", { hasVerificationId: !!verificationId, hasConfirmation: !!confirmation });

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
    console.error("[phone-auth] verifyPhoneCode ERROR", e);
    console.error("[phone-auth] verify CODE", e?.code);
    console.error("[phone-auth] verify MESSAGE", e?.message);
    return { ok: false, error: errorMessage(e), errorCode: phoneAuthErrorCode(e) || undefined };
  }
}
