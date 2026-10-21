import { sendMail } from "./mailer.js";
import { addDays, clinicDateOf, clinicToday } from "./booking.js";
import { insertNotification, setNotificationEmailResult } from "../model/notificationModel.js";

// The notification module. Every patient-facing message in CareNest goes through notifyPatient()
// below, which does two things for one event: writes a row into the patient inbox (the bell in the
// mobile app) and emails the same thing. Each message carries a `dedupeKey`, so a repeated trigger
// (a duplicate Razorpay webhook, the reminder sweep running again a minute later, a verify call
// racing the webhook) writes nothing and sends nothing the second time.
//
// Each event has a pure build* function that returns the message, and a notify* function that
// sends it. Keeping the two apart means the wording, the escaping and - most importantly - the
// dedupeKeys can all be unit-tested without a database or a mail server (see test/notification.test.js).
//
// Nothing in here ever throws at its caller: a booking, payment or signup must never fail because
// the mail server was down. Failures are logged and recorded on the notification row.

const clinicZone = () => process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

// "Sat, 24 Oct 2026 at 10:00 am" in the clinic's own timezone - the same wall clock the patient
// was shown when booking, never the server's timezone. The parts are assembled by hand because
// Intl's own joining for en-IN reads as "Sat, 24 Oct, 2026, 10:00 am".
export const formatWhen = (instant) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: clinicZone(),
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value])
  );
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}`;
};

const money = (amount) => `Rs. ${Number(amount || 0).toFixed(2)}`;

// patient-supplied text (names, notes, reasons) is rendered into an HTML email - without escaping,
// a name containing markup would be injected into every mail we send
export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BRAND = "#1E7F4F";

const visibleRows = (rows = []) =>
  rows.filter(([, value]) => value !== undefined && value !== null && value !== "");

// Shared email shell: CareNest header, one message, an optional callout and an optional detail table.
export const renderEmailHtml = ({ heading, intro, rows = [], callout, outro }) => {
  const detailRows = visibleRows(rows)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:9px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #eef1ef;">${escapeHtml(
          label
        )}</td><td style="padding:9px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #eef1ef;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${BRAND};padding:20px 24px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">CareNest</span>
          <span style="color:#cdebd9;font-size:12px;display:block;margin-top:2px;">Your health, our priority</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 10px;font-size:19px;color:#111827;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 ${visibleRows(rows).length || callout ? "18px" : "0"};font-size:14px;line-height:22px;color:#374151;">${escapeHtml(intro)}</p>
          ${callout ? `<div style="background:#e3f4ea;border-radius:12px;padding:14px 16px;margin-bottom:18px;color:#16663f;font-size:15px;font-weight:600;line-height:22px;">${escapeHtml(callout)}</div>` : ""}
          ${detailRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}</table>` : ""}
          ${outro ? `<p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#6b7280;">${escapeHtml(outro)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafbfa;border-top:1px solid #eef1ef;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:18px;">This is an automated message from CareNest. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
};

// plain-text fallback for mail clients that do not render HTML
export const renderEmailText = ({ heading, intro, rows = [], callout, outro }) =>
  [
    "CareNest",
    "",
    heading,
    "",
    intro,
    callout ? `\n${callout}` : "",
    ...visibleRows(rows).map(([label, value]) => `${label}: ${value}`),
    outro ? `\n${outro}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

// ---- the one way a patient is notified ----
//
// notice = what a build* function below returns:
//   patient   { id, name, email } - who to tell
//   message   { type, title, body, subject, email: { heading, intro, rows, callout, outro } }
//   dedupeKey the event identity; a second notice with the same key is dropped
//   data      extra fields the app can use to deep-link (appointment id, amount, ...)
//   inApp     false for content that must not be stored (the password reset code itself)
//
// Returns the notification row, or null when the dedupeKey showed it was already sent.
export const notifyPatient = async (notice) => {
  if (!notice) return null;
  const { patient, message, dedupeKey, data, inApp = true } = notice;
  try {
    if (!patient?.id || !message) return null;
    const email = patient.email || null;
    const mail = {
      heading: message.email?.heading || message.title,
      intro: message.email?.intro || message.body,
      rows: message.email?.rows || [],
      callout: message.email?.callout,
      outro: message.email?.outro,
    };
    const envelope = {
      to: email,
      subject: message.subject || message.title,
      html: renderEmailHtml(mail),
      text: renderEmailText(mail),
    };

    // No inbox row for sensitive one-time content: the mail still goes out, we just never keep a
    // copy the app (or anyone reading the database) could display.
    if (!inApp) {
      const result = await sendMail(envelope);
      return result.status === "failed" ? null : { emailStatus: result.status };
    }

    const notification = await insertNotification({
      patientId: patient.id,
      type: message.type,
      title: message.title,
      body: message.body,
      data,
      dedupeKey,
      emailTo: email,
    });
    if (!notification) return null; // same dedupeKey already handled - do not send a second email

    if (email) {
      await setNotificationEmailResult(notification.id, await sendMail(envelope));
    }
    return notification;
  } catch (error) {
    console.log(`Notification error (${message?.type}): ${error.message}`);
    return null;
  }
};

// Callers that must not wait for SMTP (payment webhooks, booking confirmation, signup) use this:
// the message goes out in the background and any problem is logged, never surfaced to the patient.
export const notifyInBackground = (promiseFactory) => {
  Promise.resolve()
    .then(promiseFactory)
    .catch((error) => console.log(`Notification error: ${error.message}`));
};

// ---- helpers ----

// an appointment row from appointmentModel (joined with patient + doctor)
const patientOfAppointment = (appointment) => ({
  id: appointment.patientId,
  name: appointment.patientName,
  email: appointment.patientEmail,
});

// a payment row from paymentModel (joined with appointment + patient + doctor)
const patientOfPayment = (payment) => ({
  id: payment.patientId,
  name: payment.patientName,
  email: payment.patientEmail,
});

const firstName = (name) => String(name || "there").trim().split(/\s+/)[0];

// Doctor names are stored with the title already on them ("Dr. Amit Deshmukh"), but a name added
// without it should still read as one - hence the check, instead of always prefixing "Dr. ".
const doctorLabel = (row) => {
  const name = String(row.doctorName || "").trim();
  const titled = /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
  return row.doctorSpecialty ? `${titled} (${row.doctorSpecialty})` : titled;
};

// Appointment notices are keyed by the scheduled time as well as the appointment, so moving an
// appointment legitimately re-arms its reminders and confirmations for the new slot.
const slotKey = (appointment) => `${appointment.id}:${new Date(appointment.scheduledAt).getTime()}`;

// ---- events: a pure build* (testable) plus the notify* that sends it ----

// New patient signed up in the mobile app.
export const buildWelcome = (patient) => ({
  patient,
  dedupeKey: `welcome:${patient.id}`,
  data: { patientCode: patient.code },
  message: {
    type: "welcome",
    subject: "Welcome to CareNest",
    title: "Welcome to CareNest",
    body: `Hi ${firstName(patient.name)}, your CareNest account is ready. You can now book appointments, pay online and track your visits from the app.`,
    email: {
      heading: `Welcome to CareNest, ${firstName(patient.name)}`,
      intro:
        "Your account has been created successfully. You can now book appointments with our doctors, pay securely online and see all your visits in one place.",
      rows: [
        ["Patient ID", patient.code],
        ["Name", patient.name],
        ["Email", patient.email],
        ["Mobile", patient.phone],
      ],
      outro: "Keep your Patient ID handy - our front desk can use it to find your records quickly.",
    },
  },
});

export const notifyWelcome = (patient) => notifyPatient(buildWelcome(patient));

// Payment captured: the booking is confirmed AND this doubles as the payment receipt.
export const buildBookingConfirmed = ({ appointment, payment }) => ({
  patient: patientOfAppointment(appointment),
  dedupeKey: `booking_confirmed:${slotKey(appointment)}`,
  data: {
    appointmentId: appointment.id,
    appointmentCode: appointment.code,
    scheduledAt: appointment.scheduledAt,
    doctorName: appointment.doctorName,
    amount: Number(payment?.amount ?? appointment.fee ?? 0),
    transactionId: payment?.providerPaymentId || payment?.providerOrderId,
  },
  message: {
    type: "booking_confirmed",
    subject: `Appointment confirmed - ${formatWhen(appointment.scheduledAt)}`,
    title: "Appointment confirmed",
    body: `Your payment of ${money(payment?.amount ?? appointment.fee)} was received and your appointment with ${doctorLabel(
      appointment
    )} on ${formatWhen(appointment.scheduledAt)} is confirmed.`,
    email: {
      heading: "Your appointment is confirmed",
      intro: `Hi ${firstName(appointment.patientName)}, we have received your payment and your appointment is booked. Your receipt is below - please keep it for your records.`,
      callout: `${doctorLabel(appointment)} - ${formatWhen(appointment.scheduledAt)}`,
      rows: [
        ["Appointment ID", appointment.code],
        ["Patient ID", appointment.patientCode],
        ["Doctor", doctorLabel(appointment)],
        ["Date and time", formatWhen(appointment.scheduledAt)],
        ["Duration", appointment.durationMinutes ? `${appointment.durationMinutes} minutes` : undefined],
        ["Amount paid", money(payment?.amount ?? appointment.fee)],
        ["Payment method", payment?.method],
        ["Transaction ID", payment?.providerPaymentId || payment?.providerOrderId],
        ["Paid on", formatWhen(payment?.capturedAt || new Date())],
      ],
      outro: "Please arrive 10 minutes early. We will remind you a day before, and again shortly before your slot.",
    },
  },
});

export const notifyBookingConfirmed = (args) => notifyPatient(buildBookingConfirmed(args));

// A payment attempt failed - the slot is only held for a short while, so this one is time-critical.
export const buildPaymentFailed = ({ appointment, payment }) => ({
  patient: patientOfAppointment(appointment),
  dedupeKey: `payment_failed:${payment?.providerPaymentId || payment?.id}`,
  data: { appointmentId: appointment.id, appointmentCode: appointment.code, amount: Number(appointment.fee || 0) },
  message: {
    type: "payment_failed",
    subject: "Payment failed - your appointment is not confirmed yet",
    title: "Payment failed",
    body: `Your payment of ${money(appointment.fee)} for the appointment with ${doctorLabel(
      appointment
    )} on ${formatWhen(appointment.scheduledAt)} did not go through. Please try again from the app to keep this slot.`,
    email: {
      heading: "Your payment did not go through",
      intro: `Hi ${firstName(appointment.patientName)}, we could not complete the payment for your appointment, so it is not confirmed yet. You can retry the payment from the CareNest app.`,
      rows: [
        ["Appointment ID", appointment.code],
        ["Doctor", doctorLabel(appointment)],
        ["Date and time", formatWhen(appointment.scheduledAt)],
        ["Amount", money(appointment.fee)],
        ["Reason", payment?.failureReason],
      ],
      outro: "Unpaid bookings are released automatically, so please complete the payment soon to keep this slot.",
    },
  },
});

export const notifyPaymentFailed = (args) => notifyPatient(buildPaymentFailed(args));

// "tomorrow" only when the appointment really falls on the next clinic day. A reminder delivered
// late (the server was restarted around the moment it was due) must not claim the wrong day.
const dayLabel = (scheduledAt) =>
  clinicDateOf(new Date(scheduledAt)).date === addDays(clinicToday(), 1) ? "tomorrow" : "in 24 hours";

// The reminder schedule (see config/reminders.js).
//   minutes       how long before the appointment this reminder belongs
//   windowMinutes how late it may still be delivered before it is dropped as out of date - so a
//                 catch-up sweep after downtime can not send "in 10 minutes" five minutes late
//   labelFor      overrides `label` when the wording depends on the actual date
export const REMINDER_STEPS = [
  { minutes: 1440, windowMinutes: 120, type: "reminder_1day", label: "tomorrow", labelFor: dayLabel },
  { minutes: 60, windowMinutes: 20, type: "reminder_1hour", label: "in 1 hour" },
  { minutes: 30, windowMinutes: 15, type: "reminder_30min", label: "in 30 minutes" },
  { minutes: 10, windowMinutes: 9, type: "reminder_10min", label: "in 10 minutes" },
];

export const buildReminder = ({ appointment, step }) => {
  const label = step.labelFor ? step.labelFor(appointment.scheduledAt) : step.label;
  return {
    patient: patientOfAppointment(appointment),
    dedupeKey: `${step.type}:${slotKey(appointment)}`,
    data: {
      appointmentId: appointment.id,
      appointmentCode: appointment.code,
      scheduledAt: appointment.scheduledAt,
      doctorName: appointment.doctorName,
      minutesBefore: step.minutes,
    },
    message: {
      type: step.type,
      subject: `Reminder: your appointment is ${label}`,
      title: `Appointment ${label}`,
      body: `Your appointment with ${doctorLabel(appointment)} is ${label}, at ${formatWhen(
        appointment.scheduledAt
      )}. Please be ready and reach the clinic 10 minutes early.`,
      email: {
        heading: `Your appointment is ${label}`,
        intro: `Hi ${firstName(appointment.patientName)}, this is a reminder that your appointment is confirmed and coming up ${label}. Please be ready.`,
        callout: `${doctorLabel(appointment)} - ${formatWhen(appointment.scheduledAt)}`,
        rows: [
          ["Appointment ID", appointment.code],
          ["Doctor", doctorLabel(appointment)],
          ["Date and time", formatWhen(appointment.scheduledAt)],
          ["Duration", appointment.durationMinutes ? `${appointment.durationMinutes} minutes` : undefined],
        ],
        outro: "Please carry your Patient ID and any earlier prescriptions or reports with you.",
      },
    },
  };
};

export const notifyReminder = (args) => notifyPatient(buildReminder(args));

// The admin moved the appointment to a new slot.
export const buildRescheduled = ({ appointment, previousScheduledAt, reason }) => ({
  patient: patientOfAppointment(appointment),
  dedupeKey: `appointment_rescheduled:${slotKey(appointment)}`,
  data: {
    appointmentId: appointment.id,
    appointmentCode: appointment.code,
    scheduledAt: appointment.scheduledAt,
    previousScheduledAt,
    reason,
  },
  message: {
    type: "appointment_rescheduled",
    subject: `Your appointment has been moved to ${formatWhen(appointment.scheduledAt)}`,
    title: "Appointment rescheduled",
    body: `Your appointment with ${doctorLabel(appointment)} has been moved${
      previousScheduledAt ? ` from ${formatWhen(previousScheduledAt)}` : ""
    } to ${formatWhen(appointment.scheduledAt)}.${reason ? ` Reason: ${reason}` : ""}`,
    email: {
      heading: "Your appointment has been rescheduled",
      intro: `Hi ${firstName(appointment.patientName)}, your appointment has been moved to a new time. Your payment stays valid - there is nothing to pay again.`,
      callout: `New time: ${formatWhen(appointment.scheduledAt)}`,
      rows: [
        ["Appointment ID", appointment.code],
        ["Doctor", doctorLabel(appointment)],
        ["Previous time", previousScheduledAt ? formatWhen(previousScheduledAt) : undefined],
        ["New time", formatWhen(appointment.scheduledAt)],
        ["Reason", reason],
      ],
      outro: "Your reminders now follow the new time. If this slot does not suit you, please contact the clinic.",
    },
  },
});

export const notifyRescheduled = (args) => notifyPatient(buildRescheduled(args));

// Status set by the admin: confirmed / completed / cancelled ('pending' has nothing worth telling).
const statusTemplates = {
  confirmed: {
    type: "appointment_confirmed",
    subject: (a) => `Appointment confirmed - ${formatWhen(a.scheduledAt)}`,
    title: "Appointment confirmed",
    heading: "Your appointment is confirmed",
    body: (a) => `Your appointment with ${doctorLabel(a)} on ${formatWhen(a.scheduledAt)} has been confirmed by the clinic.`,
    intro: (a) => `Hi ${firstName(a.patientName)}, the clinic has confirmed your appointment. Please be ready at the time below.`,
    outro: "Please arrive 10 minutes early and carry your Patient ID.",
  },
  completed: {
    type: "appointment_completed",
    subject: () => "Thank you for visiting CareNest",
    title: "Appointment completed",
    heading: "Your visit is complete",
    body: (a) =>
      `Your appointment with ${doctorLabel(a)} on ${formatWhen(a.scheduledAt)} is marked as completed. Thank you for visiting CareNest.`,
    intro: (a) => `Hi ${firstName(a.patientName)}, your consultation has been marked as completed. We hope you had a good experience.`,
    outro: "Any prescription or report from this visit will appear under Health Records in the app.",
  },
  cancelled: {
    type: "appointment_cancelled",
    subject: () => "Your appointment has been cancelled",
    title: "Appointment cancelled",
    heading: "Your appointment has been cancelled",
    body: (a) => `Your appointment with ${doctorLabel(a)} on ${formatWhen(a.scheduledAt)} has been cancelled.`,
    intro: (a) =>
      `Hi ${firstName(a.patientName)}, your appointment has been cancelled. If you paid for it, any refund due is processed separately and you will be notified.`,
    outro: "You can book a new appointment any time from the CareNest app.",
  },
};

export const buildStatusChange = ({ appointment, status }) => {
  const template = statusTemplates[status];
  if (!template) return null;
  return {
    patient: patientOfAppointment(appointment),
    dedupeKey: `${template.type}:${slotKey(appointment)}`,
    data: {
      appointmentId: appointment.id,
      appointmentCode: appointment.code,
      scheduledAt: appointment.scheduledAt,
      status,
    },
    message: {
      type: template.type,
      subject: template.subject(appointment),
      title: template.title,
      body: template.body(appointment),
      email: {
        heading: template.heading,
        intro: template.intro(appointment),
        rows: [
          ["Appointment ID", appointment.code],
          ["Patient ID", appointment.patientCode],
          ["Doctor", doctorLabel(appointment)],
          ["Date and time", formatWhen(appointment.scheduledAt)],
        ],
        outro: template.outro,
      },
    },
  };
};

export const notifyStatusChange = (args) => notifyPatient(buildStatusChange(args));

// A refund actually moved money back (Razorpay refund.processed). refund.amount is in paise.
export const buildRefundProcessed = ({ payment, refund }) => ({
  patient: patientOfPayment(payment),
  dedupeKey: `refund_processed:${refund.id}`,
  data: { appointmentCode: payment.appointmentCode, amount: Number(refund.amount) / 100, refundId: refund.id },
  message: {
    type: "refund_processed",
    subject: `Refund of ${money(Number(refund.amount) / 100)} processed`,
    title: "Refund processed",
    body: `A refund of ${money(Number(refund.amount) / 100)} for appointment ${payment.appointmentCode} has been processed. It usually reaches your account in 5 to 7 working days.`,
    email: {
      heading: "Your refund has been processed",
      intro: `Hi ${firstName(payment.patientName)}, we have processed a refund for your appointment. Depending on your bank, it usually appears in your account within 5 to 7 working days.`,
      callout: `Refund amount: ${money(Number(refund.amount) / 100)}`,
      rows: [
        ["Appointment ID", payment.appointmentCode],
        ["Refund ID", refund.id],
        ["Original payment", money(payment.amount)],
        ["Refunded now", money(Number(refund.amount) / 100)],
        ["Refunded in total", money(payment.refundedAmount)],
        ["Transaction ID", payment.providerPaymentId],
      ],
      outro: "If you do not see the amount after 7 working days, contact your bank with the Refund ID above.",
    },
  },
});

export const notifyRefundProcessed = (args) => notifyPatient(buildRefundProcessed(args));

// The password reset code. Email only (inApp: false) - the code is deliberately never stored, and
// there is no dedupeKey because every request must produce a fresh mail.
export const buildPasswordOtp = ({ patient, otp, validMinutes }) => ({
  patient,
  inApp: false,
  message: {
    type: "password_otp",
    subject: `${otp} is your CareNest password reset code`,
    title: "Password reset code",
    body: `Your CareNest password reset code is ${otp}.`,
    email: {
      heading: "Reset your CareNest password",
      intro: `Hi ${firstName(patient.name)}, use the code below to reset your CareNest password. It is valid for ${validMinutes} minutes.`,
      callout: `Your code: ${otp}`,
      outro:
        "Never share this code with anyone, including CareNest staff. If you did not ask to reset your password, you can ignore this email - your password has not changed.",
    },
  },
});

export const sendPasswordOtp = (args) => notifyPatient(buildPasswordOtp(args));

// Password actually changed (by OTP reset or from inside the app). A security heads-up, so it has
// no dedupeKey: every single change must be reported.
export const buildPasswordChanged = (patient) => ({
  patient,
  data: { changedAt: new Date().toISOString() },
  message: {
    type: "password_changed",
    subject: "Your CareNest password was changed",
    title: "Password changed",
    body: "Your CareNest password was changed successfully. If this was not you, please reset your password immediately and contact the clinic.",
    email: {
      heading: "Your password was changed",
      intro: `Hi ${firstName(patient.name)}, your CareNest password was changed successfully. You can now sign in with your new password.`,
      rows: [["Changed on", formatWhen(new Date())]],
      outro: "If you did not make this change, reset your password immediately and contact the clinic.",
    },
  },
});

export const notifyPasswordChanged = (patient) => notifyPatient(buildPasswordChanged(patient));
