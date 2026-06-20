import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export type KycSubmitStep = "verify" | "storage" | "kyc" | "profile";

export class KycSubmitError extends Error {
  readonly step: KycSubmitStep;
  readonly code: string;

  constructor(message: string, step: KycSubmitStep, code = "") {
    super(message);
    this.name = "KycSubmitError";
    this.step = step;
    this.code = code;
  }
}

function firebaseErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: string }).code);
  }
  return "";
}

export function kycSubmitErrorMessage(error: unknown, step?: KycSubmitStep): string {
  if (error instanceof KycSubmitError) return error.message;

  const code = firebaseErrorCode(error);
  const msg = error instanceof Error ? error.message : "";

  if (code === "email_not_verified" || msg.includes("Verify your email")) {
    return "Verify your email first — check your inbox (and spam), then tap Refresh status on Profile.";
  }
  if (code.includes("storage/unauthorized") || code.includes("storage/unauthenticated")) {
    return "Verify your email first — check your inbox (and spam), then tap Refresh status on Profile.";
  }
  if (code.includes("permission-denied")) {
    if (step === "storage") {
      return "Storage blocked — verify your email, then disable ad blockers for firebasestorage.googleapis.com.";
    }
    if (step === "kyc") {
      return "Could not save verification — verify your email and try again.";
    }
    if (step === "profile") {
      return "Photo uploaded but profile update failed — try again or contact support.";
    }
    return "Permission denied — verify your email and disable ad blockers for Sky Drop.";
  }
  if (code.includes("unavailable") || code.includes("network") || msg.includes("ERR_BLOCKED_BY_CLIENT")) {
    return "Connection blocked — disable ad blockers for Sky Drop or whitelist firestore.googleapis.com.";
  }
  if (code === "server_unconfigured") {
    return "Upload failed. Try again.";
  }
  return msg || "Upload failed. Try again.";
}

/** Reload auth and refresh the ID token so Firestore/Storage rules see email_verified. */
export async function refreshEmailVerificationClaim(user: User): Promise<boolean> {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

function isProductionClient(): boolean {
  if (typeof window === "undefined") return process.env.NODE_ENV === "production";
  const host = window.location.hostname;
  return (
    host === "skydrop.co.nz" ||
    host === "www.skydrop.co.nz" ||
    (!host.includes("localhost") && host !== "127.0.0.1" && !host.endsWith(".local"))
  );
}

async function submitKycViaApi(user: User, photoFile: File): Promise<boolean> {
  const token = await user.getIdToken(true);
  const formData = new FormData();
  formData.append("photo", photoFile);

  let res: Response;
  try {
    res = await fetch("/api/submit-kyc", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch (e) {
    if (isProductionClient()) {
      throw new KycSubmitError(kycSubmitErrorMessage(e, "storage"), "storage", firebaseErrorCode(e));
    }
    return false;
  }

  const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };

  if (res.status === 503 && body.code === "server_unconfigured") {
    if (isProductionClient()) {
      throw new KycSubmitError(
        "Verification upload is temporarily unavailable. Please try again in a few minutes or contact support@skydrop.co.nz.",
        "storage",
        "server_unconfigured"
      );
    }
    return false;
  }

  if (!res.ok) {
    const code = body.code || "";
    const message = body.error || kycSubmitErrorMessage(null);
    throw new KycSubmitError(message, code === "email_not_verified" ? "verify" : "storage", code);
  }

  return true;
}

async function submitKycDirect(user: User, photoFile: File): Promise<void> {
  if (!user.uid || !user.email) {
    throw new KycSubmitError("Sign in with an email account to submit verification.", "verify");
  }

  const verified = await refreshEmailVerificationClaim(user);
  if (!verified) {
    throw new KycSubmitError(
      "Verify your email before submitting verification. Check your inbox and spam folder, then tap Refresh status on Profile.",
      "verify"
    );
  }

  const tokenResult = await user.getIdTokenResult();
  if (!tokenResult.claims.email_verified) {
    throw new KycSubmitError(
      "Verify your email before submitting verification. Check your inbox and spam folder, then tap Refresh status on Profile.",
      "verify"
    );
  }

  const email = user.email;
  const ts = Date.now();
  const ext = photoFile.name.split(".").pop() || "jpg";

  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const { storage } = await import("./firebase");
  const photoRef = ref(storage, `kyc/${user.uid}/${ts}_photo.${ext}`);

  let photoUrl: string;
  try {
    await uploadBytes(photoRef, photoFile);
    photoUrl = await getDownloadURL(photoRef);
  } catch (e) {
    throw new KycSubmitError(kycSubmitErrorMessage(e, "storage"), "storage", firebaseErrorCode(e));
  }

  const kycRef = doc(db, "kycSubmissions", user.uid);
  const kycSnap = await getDoc(kycRef);
  const submittedAt = Timestamp.now();

  try {
    if (kycSnap.exists()) {
      await updateDoc(kycRef, {
        idImageUrl: photoUrl,
        selfieImageUrl: photoUrl,
        status: "pending",
        submittedAt,
      });
    } else {
      await setDoc(kycRef, {
        uid: user.uid,
        email,
        idImageUrl: photoUrl,
        selfieImageUrl: photoUrl,
        status: "pending",
        submittedAt,
      });
    }
  } catch (e) {
    throw new KycSubmitError(kycSubmitErrorMessage(e, "kyc"), "kyc", firebaseErrorCode(e));
  }

  const profileRef = doc(db, "profiles", user.uid);
  const profileSnap = await getDoc(profileRef);

  try {
    if (profileSnap.exists()) {
      await updateDoc(profileRef, {
        kycStatus: "pending",
        kycSubmittedAt: submittedAt,
      });
    } else {
      await setDoc(
        profileRef,
        {
          email,
          kycStatus: "pending",
          kycSubmittedAt: submittedAt,
        },
        { merge: true }
      );
    }
  } catch (e) {
    throw new KycSubmitError(kycSubmitErrorMessage(e, "profile"), "profile", firebaseErrorCode(e));
  }
}

export async function submitKycPhoto(user: User, photoFile: File): Promise<void> {
  const production = isProductionClient();

  // Try server API first (Admin SDK). On localhost, fall through to client-side if it fails.
  const usedApi = await submitKycViaApi(user, photoFile).catch((e) => {
    if (production && e instanceof KycSubmitError) throw e;
    if (production) throw new KycSubmitError(kycSubmitErrorMessage(e, "storage"), "storage", firebaseErrorCode(e));
    console.warn("[kyc-submit] API upload failed, falling back to client-side:", e instanceof Error ? e.message : e);
    return false;
  });

  if (usedApi) return;

  if (production) {
    throw new KycSubmitError(
      "Verification upload could not complete. Disable ad blockers for Sky Drop and try again.",
      "storage",
      "api_fallback_blocked"
    );
  }

  // Local dev fallback — writes directly via Firebase client SDK
  await submitKycDirect(user, photoFile);
}

export async function notifyKycSubmitted(user: User, username?: string): Promise<void> {
  try {
    const token = await user.getIdToken();
    await fetch("/api/kyc-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        username: username || user.displayName || "",
      }),
    });
  } catch {
    /* optional admin alert */
  }
}
