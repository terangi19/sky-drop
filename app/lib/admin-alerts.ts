import { getAdminDb } from "./firebase-admin";

const ADMIN_EMAIL = "rangitr16@gmail.com";

interface AdminAlertInput {
  type: "webhook_failure" | "payment_release_failure" | "dispute_opened" | "dispute_resolved" | "stripe_error" | "payment_failed" | "dispute_created" | "dispute_closed";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function notifyAdmin(input: AdminAlertInput): Promise<void> {
  try {
    const db = getAdminDb();
    const timestamp = new Date();

    // Write to adminNotifications collection
    await db.collection("adminNotifications").add({
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata || {},
      read: false,
      createdAt: timestamp,
    });

    // Also write to the notifications collection for in-app display
    await db.collection("notifications").add({
      type: input.type,
      targetEmail: ADMIN_EMAIL,
      fromEmail: "system",
      title: input.title,
      message: input.message,
      read: false,
      createdAt: timestamp,
    });

    // Send email
    try {
      const nodemailer = await import("nodemailer");
      const transport = {
        host: process.env.SMTP_HOST || "",
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER || "",
          pass: process.env.SMTP_PASS || "",
        },
      };
      if (transport.host && transport.auth.user) {
        const transporter = nodemailer.default.createTransport(transport);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || "noreply@skydrop.nz",
          to: ADMIN_EMAIL,
          subject: `[Sky Drop] ${input.title}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#ef4444;">${input.title}</h2>
            <p style="color:#374151;">${input.message}</p>
            ${input.metadata ? `<pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;">${JSON.stringify(input.metadata, null, 2)}</pre>` : ""}
            <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Sky Drop Monitoring · ${timestamp.toISOString()}</p>
          </div>`,
        });
      }
    } catch (emailErr) {
      console.error("[admin-alerts] Email send failed:", emailErr);
    }
  } catch (e) {
    console.error("[admin-alerts] Failed to notify admin:", e);
  }
}

export async function writeFailureRecord(collection: string, data: Record<string, unknown>): Promise<void> {
  try {
    await getAdminDb().collection(collection).add({
      ...data,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error(`[admin-alerts] Failed to write to ${collection}:`, e);
  }
}
