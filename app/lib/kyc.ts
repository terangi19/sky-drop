import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { createNotification } from "./notifications";

export async function submitKYC(userId: string, file: File): Promise<void> {
  const ext = file.name.split(".").pop();
  const path = `kyc/${userId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await setDoc(doc(db, "profiles", userId), {
    kycStatus: "pending",
    kycDocumentURL: url,
    kycSubmittedAt: Timestamp.now(),
    kycReviewedAt: null,
    kycRejectionReason: null,
  }, { merge: true });
}

export async function approveKYC(profileId: string, reviewerEmail: string): Promise<void> {
  await setDoc(doc(db, "profiles", profileId), {
    kycStatus: "approved",
    kycReviewedAt: Timestamp.now(),
    kycReviewedBy: reviewerEmail,
  }, { merge: true });

  const snap = await getDoc(doc(db, "profiles", profileId));
  const data = snap.data();
  if (data?.email) {
    await createNotification({
      targetEmail: data.email,
      fromEmail: reviewerEmail,
      type: "kyc",
      title: "KYC Approved ✓",
      message: "Your identity verification has been approved. You can now list digital assets.",
    });
  }
}

export async function rejectKYC(profileId: string, reason: string, reviewerEmail: string): Promise<void> {
  await setDoc(doc(db, "profiles", profileId), {
    kycStatus: "rejected",
    kycRejectionReason: reason,
    kycReviewedAt: Timestamp.now(),
    kycReviewedBy: reviewerEmail,
  }, { merge: true });

  const snap = await getDoc(doc(db, "profiles", profileId));
  const data = snap.data();
  if (data?.email) {
    await createNotification({
      targetEmail: data.email,
      fromEmail: reviewerEmail,
      type: "kyc",
      title: "KYC Rejected",
      message: `Your identity verification was rejected. Reason: ${reason}`,
    });
  }
}

export async function canListDigital(profile: any): Promise<{ allowed: boolean; reason?: string }> {
  if (!profile.phoneVerified) return { allowed: false, reason: "Phone not verified" };
  if (profile.proofOfAddress?.status !== "approved") return { allowed: false, reason: "Proof of address not approved" };
  if (profile.kycStatus !== "approved") return { allowed: false, reason: "KYC not approved" };
  const xp = profile.xp || 0;
  const level = Math.floor(xp / 150) + 1;
  if (level < 5) return { allowed: false, reason: "Need Level 5 (750 XP)" };
  return { allowed: true };
}
