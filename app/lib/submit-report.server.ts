import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getServerDb, isAdminInitialized } from "./firebase-admin";
import { REPORT_REASONS, REPORT_REASON_SET } from "./report-constants";

export { REPORT_REASONS, type ReportReason } from "./report-constants";

const COOLDOWN_MS = 10 * 60 * 1000;

export type SubmitReportInput = {
  type: "listing" | "user";
  reporterUserId: string;
  reporterUserEmail: string;
  reportedUserId?: string;
  reportedUserEmail?: string;
  reportedUsername?: string;
  listingId?: string;
  reason: string;
  details?: string;
};

export type SubmitReportResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status: number };

type ReportDb = ReturnType<typeof getAdminDb>;

function getReportDb(idToken?: string): ReportDb {
  if (isAdminInitialized()) return getAdminDb();
  if (idToken) return getServerDb(idToken) as ReportDb;
  throw new Error("Reporting database unavailable");
}

function normalizeReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (REPORT_REASON_SET.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const option of REPORT_REASONS) {
    if (option.toLowerCase() === lower) return option;
  }
  return null;
}

async function resolveReportedEmail(
  db: ReportDb,
  input: SubmitReportInput
): Promise<string> {
  const direct = String(input.reportedUserEmail || "").trim().toLowerCase();
  if (direct) return direct;

  if (input.type === "listing" && input.listingId?.trim()) {
    try {
      const snap = await db.collection("listings").doc(input.listingId.trim()).get();
      const sellerEmail = String(snap.data()?.sellerEmail || "").trim().toLowerCase();
      if (sellerEmail) return sellerEmail;
    } catch (e) {
      console.warn("[submit-report] could not load listing seller email:", e);
    }
  }

  return "";
}

async function checkCooldown(db: ReportDb, input: SubmitReportInput): Promise<SubmitReportResult | null> {
  try {
    const recentSnap = await db
      .collection("reports")
      .where("reporterUserId", "==", input.reporterUserId)
      .orderBy("createdAt", "desc")
      .limit(25)
      .get();

    const reportedEmail = String(input.reportedUserEmail || "").trim().toLowerCase();
    const listingId = input.listingId?.trim() || "";

    const lastMatch = recentSnap.docs.find((doc) => {
      const data = doc.data();
      if (input.type === "listing") {
        return data.type === "listing" && data.listingId === listingId;
      }
      return (
        data.type === "user" &&
        String(data.reportedUserEmail || "").toLowerCase() === reportedEmail
      );
    });

    if (!lastMatch) return null;

    const createdAt = lastMatch.data().createdAt?.toDate?.() as Date | undefined;
    const lastMs = createdAt?.getTime() ?? lastMatch.data().createdAt?.toMillis?.() ?? 0;
    if (lastMs && Date.now() - lastMs < COOLDOWN_MS) {
      return {
        ok: false,
        error: "Please wait a few minutes before reporting this again",
        status: 429,
      };
    }
  } catch (e) {
    console.warn("[submit-report] cooldown check skipped:", e);
  }
  return null;
}

export async function submitReportAdmin(
  input: SubmitReportInput,
  idToken?: string
): Promise<SubmitReportResult> {
  const reporterUserEmail = input.reporterUserEmail.trim();
  const reason = normalizeReason(input.reason);
  const details = input.details?.trim().slice(0, 2000) || "";

  if (!input.reporterUserId) {
    return { ok: false, error: "Could not determine your account", status: 400 };
  }
  if (!reporterUserEmail) {
    return { ok: false, error: "Could not determine your account email", status: 400 };
  }
  if (!reason) {
    return { ok: false, error: "Please select a valid reason", status: 400 };
  }
  if (input.type === "listing" && !input.listingId?.trim()) {
    return { ok: false, error: "Listing id is required", status: 400 };
  }

  let db: ReportDb;
  try {
    db = getReportDb(idToken);
  } catch {
    return { ok: false, error: "Reporting is temporarily unavailable", status: 503 };
  }

  const reportedUserEmail = await resolveReportedEmail(db, input);
  if (!reportedUserEmail) {
    return { ok: false, error: "Could not determine who to report", status: 400 };
  }
  if (reportedUserEmail === reporterUserEmail.toLowerCase()) {
    return { ok: false, error: "You cannot report yourself", status: 400 };
  }

  const cooldownBlock = await checkCooldown(
    db,
    { ...input, reportedUserEmail }
  );
  if (cooldownBlock) return cooldownBlock;

  try {
    let reportedUsername = input.reportedUsername?.trim().replace(/^@/, "") || null;
    if (!reportedUsername && input.reportedUserId?.trim()) {
      try {
        const p = await db.collection("profiles").doc(input.reportedUserId.trim()).get();
        reportedUsername = p.data()?.username || null;
      } catch { /* optional */ }
    }
    let reporterUsername: string | null = null;
    try {
      const p = await db.collection("profiles").doc(input.reporterUserId).get();
      reporterUsername = p.data()?.username || null;
    } catch { /* optional */ }

    const docRef = await db.collection("reports").add({
      type: input.type,
      listingId: input.type === "listing" ? input.listingId!.trim() : null,
      reportedUserId: input.reportedUserId?.trim() || null,
      reportedUserEmail,
      reportedUsername,
      reporterUserId: input.reporterUserId,
      reporterUserEmail,
      reporterUsername,
      reason,
      details: details || null,
      description: details || reason,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, id: docRef.id };
  } catch (e) {
    console.error("[submit-report] failed to write report:", e);
    return { ok: false, error: "Failed to submit report", status: 500 };
  }
}

export type SubmitUserReportInput = {
  reporterUserId: string;
  reporterUserEmail: string;
  reportedUserId: string;
  reportedUserEmail: string;
  reportedUsername?: string;
  reason: string;
  details?: string;
};

export async function submitUserReportAdmin(
  input: SubmitUserReportInput,
  idToken?: string
): Promise<SubmitReportResult> {
  return submitReportAdmin({ ...input, type: "user" }, idToken);
}
