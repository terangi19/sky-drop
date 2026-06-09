import { getAdminDb } from "./firebase-admin";
import { isPhoneBlacklisted } from "./ban-store";
import { formatNZPhone, isValidNzMobile, phoneRegistryDocId } from "./phone-format";

const COLLECTION = "phoneRegistry";

export type PhoneClaimResult =
  | { ok: true; phone: string }
  | { ok: false; error: string; status: number };

export async function isPhoneRegisteredToOtherUser(
  phone: string,
  uid: string
): Promise<boolean> {
  const db = getAdminDb();
  const key = phoneRegistryDocId(formatNZPhone(phone));
  const snap = await db.collection(COLLECTION).doc(key).get();
  if (!snap.exists) return false;
  const owner = String(snap.data()?.uid || "");
  return !!owner && owner !== uid;
}

export async function claimVerifiedPhoneForUser(opts: {
  uid: string;
  phone: string;
  email?: string | null;
}): Promise<PhoneClaimResult> {
  const formatted = formatNZPhone(opts.phone);
  if (!isValidNzMobile(formatted)) {
    return { ok: false, error: "Enter a valid NZ mobile number (e.g. 021 123 4567).", status: 400 };
  }

  if (await isPhoneBlacklisted(formatted)) {
    return {
      ok: false,
      error: "This phone number cannot be used. Contact support.",
      status: 403,
    };
  }

  const db = getAdminDb();
  const key = phoneRegistryDocId(formatted);
  const registryRef = db.collection(COLLECTION).doc(key);
  const profileRef = db.collection("profiles").doc(opts.uid);

  try {
    await db.runTransaction(async (tx) => {
      const registrySnap = await tx.get(registryRef);
      if (registrySnap.exists) {
        const owner = String(registrySnap.data()?.uid || "");
        if (owner && owner !== opts.uid) {
          throw new Error("PHONE_TAKEN");
        }
      }

      tx.set(
        registryRef,
        {
          uid: opts.uid,
          phone: formatted,
          email: opts.email || null,
          verifiedAt: new Date(),
        },
        { merge: true }
      );

      tx.set(
        profileRef,
        {
          phone: formatted,
          phoneNumber: formatted,
          phoneVerified: true,
          verified: true,
        },
        { merge: true }
      );
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "PHONE_TAKEN") {
      return {
        ok: false,
        error:
          "This phone number is already linked to another Sky Drop account. Each number can only be used once.",
        status: 409,
      };
    }
    throw e;
  }

  // Release any other numbers previously tied to this user
  const prior = await db.collection(COLLECTION).where("uid", "==", opts.uid).get();
  const batch = db.batch();
  for (const doc of prior.docs) {
    if (doc.id !== key) batch.delete(doc.ref);
  }
  if (!prior.empty) await batch.commit();

  return { ok: true, phone: formatted };
}
