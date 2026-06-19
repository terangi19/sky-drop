import { getAdminDb } from "./firebase-admin";
import {
  isEmailLike,
  publicHandleFromProfile,
  publicNameFromProfile,
  type PublicProfileFields,
} from "./public-display";

export async function adminGetProfileByEmail(
  email: string
): Promise<(PublicProfileFields & { uid?: string }) | null> {
  if (!email) return null;
  const snap = await getAdminDb()
    .collection("profiles")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data() as PublicProfileFields;
  // Attach the document ID (UID) so callers can access subcollections like bankDetails
  return { ...data, uid: snap.docs[0].id };
}

export async function adminGetPublicHandle(
  email: string,
  fallback = "Buyer"
): Promise<string> {
  const profile = await adminGetProfileByEmail(email);
  return publicHandleFromProfile(profile, fallback);
}

export async function adminGetPublicName(
  email: string,
  fallback = "Buyer"
): Promise<string> {
  const profile = await adminGetProfileByEmail(email);
  return publicNameFromProfile(profile, fallback);
}

export async function adminGetPublicHandles(
  emails: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(emails.filter((e) => e && isEmailLike(e)))];
  const map: Record<string, string> = {};
  await Promise.all(
    unique.map(async (email) => {
      map[email] = await adminGetPublicHandle(email);
    })
  );
  return map;
}

export function resolveBuyerNameForStorage(
  inputName: string | undefined,
  profile: PublicProfileFields | null,
  buyerEmail: string
): string {
  if (inputName && !isEmailLike(inputName)) {
    return publicNameFromProfile({ username: inputName }, "Buyer");
  }
  return publicNameFromProfile(profile, "Buyer");
}
