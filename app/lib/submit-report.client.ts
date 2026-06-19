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

export async function submitReportRequest(
  input: ClientReportInput & { reportedUsername?: string; turnstileToken?: string }
): Promise<void> {
  const token = await auth.currentUser?.getIdToken(true);
  if (!token) {
    throw new Error("Please sign in again");
  }

  const reason = input.reason.trim();
  if (!REPORT_REASON_SET.has(reason)) {
    throw new Error("Please select a valid reason");
  }
  if (input.type === "listing" && !input.listingId?.trim()) {
    throw new Error("Listing id is required");
  }

  const res = await fetch("/api/submit-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...input, turnstileToken: input.turnstileToken || "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Failed to submit report");
  }
}
