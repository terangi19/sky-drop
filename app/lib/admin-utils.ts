export interface AuditLogEntry {
  action: string;
  actorEmail: string;
  actorUid?: string;
  targetUserId?: string;
  purchaseId?: string;
  listingId?: string;
  disputeId?: string;
  orderId?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

import { getAdminDb } from "./firebase-admin";

export async function writeAuditLog(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
  try {
    await getAdminDb().collection("adminAuditLog").add({
      ...entry,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
}
