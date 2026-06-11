import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { REPORT_REASON_SET } from "./report-constants";

export type ClientReportInput = {
  type: "listing" | "user";
  listingId?: string;
  reportedUserId?: string;
  reportedUserEmail: string;
  reason: string;
  details?: string;
};

export async function submitReportRequest(input: ClientReportInput & { reportedUsername?: string }): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Please sign in again");
  }

  const res = await fetch("/api/submit-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return;

  if (res.status === 429 || res.status === 400) {
    throw new Error(data.error || "Failed to submit report");
  }

  try {
    await submitReportClient(input);
    return;
  } catch (clientErr) {
    console.error("[submit-report] client fallback failed:", clientErr);
    throw new Error(data.error || "Failed to submit report");
  }
}

/** Client fallback when the API is unavailable (e.g. local dev without Admin SDK). */
export async function submitReportClient(input: ClientReportInput): Promise<void> {
  const user = auth.currentUser;
  if (!user?.uid || !user.email) {
    throw new Error("Please sign in again");
  }
  if (!input.reportedUserEmail.trim()) {
    throw new Error("Reported user email is required");
  }
  if (!REPORT_REASON_SET.has(input.reason.trim())) {
    throw new Error("Please select a valid reason");
  }
  if (input.type === "listing" && !input.listingId?.trim()) {
    throw new Error("listingId is required");
  }

  await addDoc(collection(db, "reports"), {
    type: input.type,
    listingId: input.type === "listing" ? input.listingId!.trim() : null,
    reportedUserId: input.reportedUserId?.trim() || null,
    reportedUserEmail: input.reportedUserEmail.trim().toLowerCase(),
    reporterUserId: user.uid,
    reporterUserEmail: user.email,
    reason: input.reason.trim(),
    details: input.details?.trim() || null,
    description: input.details?.trim() || input.reason.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}
