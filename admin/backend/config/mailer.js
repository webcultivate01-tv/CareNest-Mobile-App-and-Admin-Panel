import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Email delivery for the notification module (config/notifications.js).
//
// SMTP settings come from .env (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS). With Gmail use an
// App Password, not the account password. When SMTP is NOT configured nothing is sent: the mail is
// logged to the console and reported as "skipped", so a developer machine without mail credentials
// still works and a booking / signup never fails because of email.

const FROM_NAME = process.env.MAIL_FROM_NAME || "CareNest";

export const isMailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

// one shared connection pool, created on first use
let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // port 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 3,
    });
  }
  return transporter;
};

// Sends one mail. NEVER throws - the caller gets { status, error } and carries on, because no
// appointment, payment or signup should break just because the mail server is unreachable.
// status: "sent" | "failed" | "skipped" (no SMTP configured) | "none" (no address to send to)
export const sendMail = async ({ to, subject, html, text }) => {
  if (!to) return { status: "none" };
  if (!isMailConfigured()) {
    console.log(`[mail skipped - no SMTP configured] to=${to} subject=${subject}`);
    return { status: "skipped" };
  }
  try {
    await getTransporter().sendMail({
      from: `"${FROM_NAME}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return { status: "sent" };
  } catch (error) {
    console.log(`Mail error to=${to} subject="${subject}": ${error.message}`);
    return { status: "failed", error: error.message };
  }
};
