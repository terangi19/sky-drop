const FROM_NAME = "Sky Drop";
const FROM_EMAIL = process.env.SMTP_FROM || "noreply@skydrop.app";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
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
  });
}
