const FROM_NAME = "Sky Drop";
const FROM_EMAIL = process.env.SMTP_FROM || "noreply@skydrop.co.nz";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";
  const headers = {
    "List-Unsubscribe": `<mailto:unsubscribe@skydrop.co.nz>, <${baseUrl}/settings>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Reply-To": "support@skydrop.co.nz",
  };

  if (process.env.MAILERSEND_API_KEY) {
    try {
      const { MailerSend } = await import("@mailersend/nodejs");
      const mailerSend = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
      });
      await mailerSend.email.send({
        from: {
          email: FROM_EMAIL,
          name: FROM_NAME,
        },
        to: [{ email: to }],
        subject,
        html,
        headers,
      });
      return;
    } catch (e) {
      console.error("[email-transport] MailerSend error:", e);
      // fall through to SMTP
    }
  }

  const transport = {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  };

  if (!transport.host || !transport.auth.user) {
    console.warn("[email-transport] No email transport configured");
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport(transport);
  await transporter.sendMail({
    from: { name: FROM_NAME, address: FROM_EMAIL },
    to,
    subject,
    html,
    headers,
  });
}
