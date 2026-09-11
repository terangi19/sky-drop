import { getAdminDb } from "./firebase-admin";
import { isPhoneBlacklisted } from "./ban-store";
import { formatNZPhone, isValidNzMobile, phoneRegistryDocId } from "./phone-format";
import { verifiedFlagAfterUpdate } from "./seller-verified";

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

      const profileSnap = await tx.get(profileRef);
      const existingProfile = profileSnap.data();
      const phonePatch = {
        phone: formatted,
        phoneNumber: formatted,
        phoneVerified: true,
      };

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
          ...phonePatch,
          verified: verifiedFlagAfterUpdate(existingProfile, phonePatch),
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

/** Remove this user's numbers from the uniqueness registry. Does not touch the profile. */
export async function deletePhoneRegistryForUser(uid: string): Promise<void> {
  const db = getAdminDb();
  const prior = await db.collection(COLLECTION).where("uid", "==", uid).get();
  if (prior.empty) return;
  const batch = db.batch();
  for (const doc of prior.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}

/** Unlink every registry number for this user and clear profile verification. */
export async function releaseVerifiedPhoneForUser(uid: string): Promise<void> {
  const db = getAdminDb();
  const profileRef = db.collection("profiles").doc(uid);
  const prior = await db.collection(COLLECTION).where("uid", "==", uid).get();

  await db.runTransaction(async (tx) => {
    const profileSnap = await tx.get(profileRef);
    const existingProfile = profileSnap.data();
    const phonePatch = {
      phone: "",
      phoneNumber: "",
      phoneVerified: false,
      phoneVerifiedAt: null,
    };
    tx.set(
      profileRef,
      {
        ...phonePatch,
        verified: verifiedFlagAfterUpdate(existingProfile, phonePatch),
      },
      { merge: true }
    );
    for (const doc of prior.docs) {
      tx.delete(doc.ref);
    }
  });
}
