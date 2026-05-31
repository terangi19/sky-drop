const nodemailer = require("nodemailer");
const t = nodemailer.createTransport({
  host: "smtp.mailersend.net",
  port: 587,
  auth: { user: "MS_qzL9tA@skydrop.co.nz", pass: "mssp.0jLnL4K.v69oxl5r3rkg785k.0qumzQq" },
});
t.sendMail({
  from: { name: "Sky Drop", address: "noreply@skydrop.nz" },
  to: "skyrewi3@gmail.com",
  subject: "MailerSend test",
  html: "<h1>test</h1>",
}).then((r) => console.log("OK:", r.messageId)).catch((e) => console.log("ERR:", e.message));
