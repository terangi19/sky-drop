interface SmtpTransportConfig {
  host: string;
  port: number;
  auth: { user: string; pass: string };
}

/** Build the SMTP transport config from environment variables. */
export function getSmtpConfig(): SmtpTransportConfig {
  return {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  };
}

/** Check whether SMTP is configured (host + user present). */
export function isSmtpConfigured(config?: SmtpTransportConfig): boolean {
  const c = config ?? getSmtpConfig();
  return !!(c.host && c.auth.user);
}

/** Default "from" address for outgoing mail. */
export function getSmtpFrom(): { name: string; address: string } {
  return {
    name: "Sky Drop",
    address: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@skydrop.nz",
  };
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  from?: { name: string; address: string };
}

/**
 * Send an email via SMTP. No-ops if SMTP is not configured.
 * Returns `true` if the mail was sent, `false` if SMTP is unavailable.
 */
export async function sendSmtpEmail(input: SendMailInput): Promise<boolean> {
  const config = getSmtpConfig();
  if (!isSmtpConfigured(config)) return false;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport(config);
  await transporter.sendMail({
    from: input.from ?? getSmtpFrom(),
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  return true;
}
