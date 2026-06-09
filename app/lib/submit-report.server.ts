import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "./firebase-admin";
import { REPORT_REASON_SET } from "./report-constants";

export { REPORT_REASONS, type ReportReason } from "./report-constants";
const COOLDOWN_MS = 10 * 60 * 1000;

export type SubmitUserReportInput = {
  reporterUserId: string;
  reporterUserEmail: string;
  reportedUserId: string;
  reportedUserEmail: string;
  reportedUsername?: string;
  reason: string;
  details?: string;
};

export type SubmitUserReportResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status: number };

export async function submitUserReportAdmin(
  input: SubmitUserReportInput
): Promise<SubmitUserReportResult> {
  const reporterUserEmail = input.reporterUserEmail.trim();
  const reportedUserEmail = input.reportedUserEmail.trim();
  const reason = input.reason.trim();
  const details = input.details?.trim().slice(0, 2000) || "";

  if (!reporterUserEmail) {
    return { ok: false, error: "Could not determine your account email", status: 400 };
  }
  if (!reportedUserEmail) {
    return { ok: false, error: "Reported user email is required", status: 400 };
  }
  if (!reason || !REPORT_REASON_SET.has(reason)) {
    return { ok: false, error: "Please select a valid reason", status: 400 };
  }
  if (reportedUserEmail.toLowerCase() === reporterUserEmail.toLowerCase()) {
    return { ok: false, error: "You cannot report yourself", status: 400 };
  }
  if (!isAdminInitialized()) {
    return { ok: false, error: "Reporting is temporarily unavailable", status: 503 };
  }

  const db = getAdminDb();
  const reports = db.collection("reports");

  try {
    const recent = await reports
      .where("reporterUserId", "==", input.reporterUserId)
      .where("type", "==", "user")
      .where("reportedUserEmail", "==", reportedUserEmail)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!recent.empty) {
      const last = recent.docs[0].data();
      const lastMs = last.createdAt?.toMillis?.() ?? 0;
      if (lastMs && Date.now() - lastMs < COOLDOWN_MS) {
        return {
          ok: false,
          error: "Please wait a few minutes before reporting this again",
          status: 429,
        };
      }
    }
  } catch (e) {
    // Index may still be building — skip cooldown rather than block the report.
    console.warn("[submit-report] cooldown check skipped:", e);
  }

  try {
    const reportedUsername = input.reportedUsername?.trim().replace(/^@/, "") || null;
    const docRef = await reports.add({
      type: "user",
      listingId: null,
      reportedUserId: input.reportedUserId || null,
      reportedUserEmail,
      reportedUsername,
      reporterUserId: input.reporterUserId,
      reporterUserEmail,
      reason,
      details: details || null,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, id: docRef.id };
  } catch (e) {
    console.error("[submit-report] failed to write report:", e);
    return { ok: false, error: "Failed to submit report", status: 500 };
  }
}
