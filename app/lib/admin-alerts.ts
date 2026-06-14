export async function getAdminAlertRecipient(): Promise<string> {
  try {
    const { getAdminDb } = await import("./firebase-admin");
    const snap = await getAdminDb().collection("config").doc("adminRoles").get();
    if (snap.exists) {
      const admins = snap.data()?.admins as Array<{ email: string }> | undefined;
      if (admins && admins.length > 0) return admins[0].email;
    }
  } catch {}
  if (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) {
    return process.env.ADMIN_EMAILS.split(",")[0].trim();
  }
  return "admin@skydrop.nz";
}

export async function getAdminEmails(): Promise<string[]> {
  try {
    const { getAdminDb } = await import("./firebase-admin");
    const snap = await getAdminDb().collection("config").doc("adminRoles").get();
    if (snap.exists) {
      const admins = snap.data()?.admins as Array<{ email: string }> | undefined;
      if (admins && admins.length > 0) return admins.map(a => a.email);
    }
  } catch {}
  if (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) {
    return process.env.ADMIN_EMAILS.split(",").map(e => e.trim()).filter(Boolean);
  }
  return ["admin@skydrop.nz"];
}

export async function notifyKycSubmittedToAdmins(opts: {
  uid: string;
  email: string;
  username?: string;
}): Promise<void> {
  try {
    const { getAdminDb } = await import("./firebase-admin");
    const db = getAdminDb();
    const now = new Date();
    const email = opts.email || "Unknown";
    const username = opts.username || "—";

    await db.collection("adminNotifications").add({
      type: "kyc_submitted",
      title: "New KYC Submission",
      message: `${email} (@${username}) submitted ID documents for verification.`,
      metadata: { uid: opts.uid, email: opts.email, username: opts.username },
      read: false,
      createdAt: now,
    });

    const adminEmails = await getAdminEmails();
    for (const adminEmail of adminEmails) {
      await db.collection("notifications").add({
        type: "kyc_submitted",
        targetEmail: adminEmail,
        fromEmail: "system",
        title: "New KYC Submission",
        message: `${email} submitted ID documents.`,
        metadata: { uid: opts.uid, email: opts.email, username: opts.username },
        read: false,
        createdAt: now,
      });
    }
  } catch (e) {
    console.error("[admin-alerts] Failed to notify KYC submission:", e);
  }
}

export async function notifyAdmin(opts: {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { getAdminDb } = await import("./firebase-admin");
    const db = getAdminDb();
    const now = new Date();
    await db.collection("adminNotifications").add({
      type: opts.type,
      title: opts.title,
      message: opts.message,
      metadata: opts.metadata || {},
      read: false,
      createdAt: now,
    });
    const adminEmails = await getAdminEmails();
    for (const adminEmail of adminEmails) {
      await db.collection("notifications").add({
        type: opts.type,
        targetEmail: adminEmail,
        fromEmail: "system@skydrop.nz",
        title: opts.title,
        message: opts.message,
        metadata: opts.metadata || {},
        read: false,
        createdAt: now,
      });
    }
  } catch (e) {
    console.error("[admin-alerts] Failed to notify admin:", e);
  }
}

export async function writeFailureRecord(collection: string, data: Record<string, unknown>): Promise<void> {
  try {
    const { getAdminDb } = await import("./firebase-admin");
    await getAdminDb().collection(collection).add({
      ...data,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error(`[admin-alerts] Failed to write to ${collection}:`, e);
  }
}
