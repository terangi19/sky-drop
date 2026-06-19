import * as Sentry from "@sentry/nextjs";

export type SecurityEventSeverity = "info" | "warning" | "critical";

export interface SecurityEvent {
  type: string;
  severity: SecurityEventSeverity;
  message: string;
  actorEmail?: string;
  actorUid?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const { type, severity, message, actorEmail, actorUid, ip, metadata } = event;

  // Always log to console
  const prefix = `[security:${severity}]`;
  console.log(`${prefix} ${type}: ${message}`, {
    actorEmail,
    actorUid,
    ip,
    ...metadata,
  });

  // Critical events go to Sentry
  if (severity === "critical") {
    Sentry.captureMessage(message, {
      level: "error",
      tags: { security_event: type, severity },
      extra: { actorEmail, actorUid, ip, ...metadata },
    });
  }

  // Store in Firestore for audit review
  try {
    const { getAdminDb, isAdminInitialized } = await import("./firebase-admin");
    if (isAdminInitialized()) {
      const db = getAdminDb();
      await db.collection("securityEvents").add({
        type,
        severity,
        message,
        actorEmail: actorEmail || null,
        actorUid: actorUid || null,
        ip: ip || null,
        metadata: metadata || {},
        timestamp: new Date(),
      });
    }
  } catch {
    // Firestore logging is best-effort
  }
}

// Convenience wrappers
export function logSecurityInfo(
  type: string,
  message: string,
  opts?: { actorEmail?: string; actorUid?: string; ip?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  return logSecurityEvent({ type, severity: "info", message, ...opts });
}

export function logSecurityWarning(
  type: string,
  message: string,
  opts?: { actorEmail?: string; actorUid?: string; ip?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  return logSecurityEvent({ type, severity: "warning", message, ...opts });
}

export function logSecurityCritical(
  type: string,
  message: string,
  opts?: { actorEmail?: string; actorUid?: string; ip?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  return logSecurityEvent({ type, severity: "critical", message, ...opts });
}
