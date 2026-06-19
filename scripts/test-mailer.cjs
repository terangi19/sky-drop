require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const nodemailer = require("nodemailer");
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailersend.net",
  port: Number(process.env.SMTP_PORT) || 587,
  auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
});
t.verify().then(() => console.log("SMTP AUTH: OK")).catch((e) => console.log("SMTP AUTH: FAIL -", e.message));
t.sendMail({
  from: { name: "Sky Drop", address: process.env.SMTP_FROM || "noreply@skydrop.co.nz" },
  to: "skyrewi3@gmail.com",
  subject: "MailerSend test " + Date.now(),
  html: "<h1>test</h1>",
}).then((r) => console.log("SENT:", r.messageId)).catch((e) => console.log("FAILED:", e.message));
