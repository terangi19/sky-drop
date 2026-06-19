import { getAdminDb, isAdminInitialized } from './firebase-admin';
import { logSecurityCritical } from './security-log';

export interface AuditLogEntry {
  timestamp: Date;
  adminEmail: string;
  adminUid: string;
  action: string;
  target?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

const AUDIT_LOG_COLLECTION = 'auditLogs';

/**
 * Log an admin action to Firestore for compliance and security
 */
export async function logAdminAction(entry: AuditLogEntry): Promise<void> {
  if (!isAdminInitialized()) {
    console.warn('[Audit Log] Admin SDK not initialized, skipping audit log');
    return;
  }

  try {
    const db = getAdminDb();
    const logRef = db.collection(AUDIT_LOG_COLLECTION);
    
    await logRef.add({
      ...entry,
      timestamp: entry.timestamp || new Date(),
    });
    
    // Also log to security log for critical actions
    const criticalActions = [
      'ban_user',
      'unban_user',
      'delete_listing',
      'delete_user',
      'admin_promotion',
      'admin_demotion',
      'kyc_approve',
      'kyc_reject',
      'admin_override',
    ];
    
    if (criticalActions.includes(entry.action)) {
      await logSecurityCritical(
        `admin_action_${entry.action}`,
        `Admin performed critical action: ${entry.action}`,
        {
          actorEmail: entry.adminEmail,
          actorUid: entry.adminUid,
          metadata: {
            ...entry.details,
            targetId: entry.targetId,
          },
        }
      );
    }
  } catch (error) {
    console.error('[Audit Log] Failed to write audit log:', error);
    // Don't throw - audit log failures shouldn't break the main operation
  }
}

/**
 * Query audit logs for a specific admin
 */
export async function getAuditLogsForAdmin(
  adminEmail: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  if (!isAdminInitialized()) {
    return [];
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(AUDIT_LOG_COLLECTION)
      .where('adminEmail', '==', adminEmail)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date(),
    })) as AuditLogEntry[];
  } catch (error) {
    console.error('[Audit Log] Failed to query audit logs:', error);
    return [];
  }
}

/**
 * Query audit logs for a specific target (user, listing, etc.)
 */
export async function getAuditLogsForTarget(
  targetId: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  if (!isAdminInitialized()) {
    return [];
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(AUDIT_LOG_COLLECTION)
      .where('targetId', '==', targetId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date(),
    })) as AuditLogEntry[];
  } catch (error) {
    console.error('[Audit Log] Failed to query audit logs:', error);
    return [];
  }
}

/**
 * Query recent audit logs across all admins
 */
export async function getRecentAuditLogs(limit: number = 50): Promise<AuditLogEntry[]> {
  if (!isAdminInitialized()) {
    return [];
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(AUDIT_LOG_COLLECTION)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snap.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date(),
    })) as AuditLogEntry[];
  } catch (error) {
    console.error('[Audit Log] Failed to query audit logs:', error);
    return [];
  }
}
