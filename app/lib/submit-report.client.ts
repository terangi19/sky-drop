import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { REPORT_REASON_SET } from "./report-constants";

export type ClientReportInput = {
  type: "listing" | "user";
  listingId?: string;
  reportedUserId?: string;
  reportedUserEmail?: string;
  reason: string;
  details?: string;
};

export async function submitReportClient(input: ClientReportInput): Promise<void> {
  const user = auth.currentUser;
  if (!user?.uid || !user.email) {
    throw new Error("Please sign in again");
  }

  const reason = input.reason.trim();
  if (!REPORT_REASON_SET.has(reason)) {
    throw new Error("Please select a valid reason");
  }
  if (input.type === "listing" && !input.listingId?.trim()) {
    throw new Error("Listing id is required");
  }

  const reportedUserEmail = String(input.reportedUserEmail || "").trim().toLowerCase();

  await addDoc(collection(db, "reports"), {
    type: input.type,
    listingId: input.type === "listing" ? input.listingId!.trim() : null,
    reportedUserId: input.reportedUserId?.trim() || null,
    reportedUserEmail: reportedUserEmail || null,
    reporterUserId: user.uid,
    reporterUserEmail: user.email,
    reason,
    details: input.details?.trim() || null,
    description: input.details?.trim() || reason,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function submitReportRequest(
  input: ClientReportInput & { reportedUsername?: string; turnstileToken?: string }
): Promise<void> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  let apiError = "Failed to submit report";

  try {
    const res = await fetch("/api/submit-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...input, turnstileToken: input.turnstileToken || "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return;

    apiError = typeof data.error === "string" ? data.error : apiError;
    if (res.status === 429 || res.status === 400) {
      throw new Error(apiError);
    }
  } catch (e) {
    if (e instanceof Error && (e.message.includes("wait") || e.message.includes("valid reason") || e.message.includes("yourself"))) {
      throw e;
    }
    console.warn("[submit-report] API failed, trying client write:", e);
  }

  try {
    await submitReportClient(input);
  } catch (clientErr) {
    console.error("[submit-report] client fallback failed:", clientErr);
    const clientMsg = clientErr instanceof Error ? clientErr.message : "Failed to submit report";
    throw new Error(clientMsg.includes("permission") ? "Could not submit report. Try again after signing in." : apiError || clientMsg);
  }
}
