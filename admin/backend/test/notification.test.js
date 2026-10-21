import assert from "node:assert/strict";
import { test } from "node:test";

// the clinic timezone decides every date shown in an email, so pin it for these tests
process.env.CLINIC_TIMEZONE = "Asia/Kolkata";

const {
  REMINDER_STEPS,
  buildBookingConfirmed,
  buildPasswordOtp,
  buildPaymentFailed,
  buildReminder,
  buildRescheduled,
  buildStatusChange,
  buildRefundProcessed,
  buildWelcome,
  escapeHtml,
  formatWhen,
  renderEmailHtml,
  renderEmailText,
} = await import("../config/notifications.js");

// the clinic calendar helpers the reminder wording depends on
const { addDays, clinicToday, clinicTime } = await import("../config/booking.js");

// a paid appointment row as appointmentModel returns it (joined with patient + doctor)
const appointment = {
  id: 42,
  code: "CNAP-042",
  patientId: 7,
  patientCode: "CNP-007",
  patientName: "Tejas Mehar",
  patientEmail: "patient@example.com",
  doctorName: "Asha Rao",
  doctorSpecialty: "Cardiology",
  scheduledAt: "2026-10-24T04:30:00.000Z", // 10:00 am in Asia/Kolkata
  durationMinutes: 15,
  fee: "500.00",
};

const payment = {
  id: 3,
  patientId: 7,
  patientName: "Tejas Mehar",
  patientEmail: "patient@example.com",
  appointmentCode: "CNAP-042",
  amount: "500.00",
  refundedAmount: "500.00",
  method: "upi",
  providerPaymentId: "pay_abc123",
  providerOrderId: "order_abc123",
  capturedAt: "2026-10-21T06:00:00.000Z",
};

// ---- dates are shown in the clinic's timezone, not the server's ----

test("formatWhen renders the clinic wall-clock time, not UTC", () => {
  // 04:30 UTC is 10:00 am in Asia/Kolkata (+05:30)
  assert.equal(formatWhen(appointment.scheduledAt), "Sat, 24 Oct 2026 at 10:00 am");
});

test("formatWhen follows CLINIC_TIMEZONE rather than the machine timezone", () => {
  const original = process.env.CLINIC_TIMEZONE;
  process.env.CLINIC_TIMEZONE = "UTC";
  assert.equal(formatWhen(appointment.scheduledAt), "Sat, 24 Oct 2026 at 04:30 am");
  process.env.CLINIC_TIMEZONE = original;
});

// ---- every message carries the right identity, wording and payload ----

test("welcome is keyed per patient so it can only ever be sent once", () => {
  const notice = buildWelcome({ id: 7, name: "Tejas Mehar", email: "patient@example.com", code: "CNP-007", phone: "9876543210" });
  assert.equal(notice.dedupeKey, "welcome:7");
  assert.equal(notice.message.type, "welcome");
  assert.match(notice.message.body, /Hi Tejas/);
  assert.equal(notice.patient.email, "patient@example.com");
});

test("booking confirmation doubles as the payment receipt", () => {
  const notice = buildBookingConfirmed({ appointment, payment });
  assert.equal(notice.message.type, "booking_confirmed");
  assert.equal(notice.data.transactionId, "pay_abc123");
  assert.equal(notice.data.amount, 500);

  const html = renderEmailHtml(notice.message.email);
  for (const expected of ["CNAP-042", "CNP-007", "pay_abc123", "Rs. 500.00", "upi", "15 minutes"]) {
    assert.ok(html.includes(expected), `receipt is missing ${expected}`);
  }
});

test("booking confirmation falls back to the appointment fee when no payment row is given", () => {
  const notice = buildBookingConfirmed({ appointment, payment: undefined });
  assert.equal(notice.data.amount, 500);
  assert.match(notice.message.body, /Rs\. 500\.00/);
});

test("payment failure is keyed by the Razorpay payment id, so each failed attempt is reported once", () => {
  const notice = buildPaymentFailed({ appointment, payment: { ...payment, failureReason: "Insufficient funds" } });
  assert.equal(notice.dedupeKey, "payment_failed:pay_abc123");
  assert.ok(renderEmailText(notice.message.email).includes("Insufficient funds"));
});

// ---- reminders ----

test("the reminder schedule is 1 day, 1 hour, 30 minutes and 10 minutes before the slot", () => {
  assert.deepEqual(
    REMINDER_STEPS.map((s) => s.minutes),
    [1440, 60, 30, 10]
  );
  assert.deepEqual(
    REMINDER_STEPS.map((s) => s.type),
    ["reminder_1day", "reminder_1hour", "reminder_30min", "reminder_10min"]
  );
});

test("every reminder step has a catch-up window shorter than its own lead time", () => {
  for (const step of REMINDER_STEPS) {
    assert.ok(step.windowMinutes > 0, `${step.type} has no window`);
    // a window as long as the lead time would let a stale reminder fire at the appointment itself
    assert.ok(step.windowMinutes < step.minutes, `${step.type} window is too wide`);
  }
});

test("the reminder windows never overlap, so two steps can not both claim the same moment", () => {
  for (let i = 1; i < REMINDER_STEPS.length; i++) {
    const earlier = REMINDER_STEPS[i - 1];
    const later = REMINDER_STEPS[i];
    // earlier step fires while the slot is (minutes - window .. minutes) away; that range must
    // stay above the next step's upper bound
    assert.ok(
      earlier.minutes - earlier.windowMinutes >= later.minutes,
      `${earlier.type} can still fire once ${later.type} is due`
    );
  }
});

test("each reminder step gets its own dedupeKey, so all four are delivered for one appointment", () => {
  const keys = REMINDER_STEPS.map((step) => buildReminder({ appointment, step }).dedupeKey);
  assert.equal(new Set(keys).size, 4);
  for (const key of keys) assert.ok(key.endsWith(`:42:${new Date(appointment.scheduledAt).getTime()}`));
});

test("repeating the same reminder step produces the same key, so the sweep can run every minute", () => {
  const step = REMINDER_STEPS[1];
  assert.equal(buildReminder({ appointment, step }).dedupeKey, buildReminder({ appointment, step }).dedupeKey);
});

test("moving an appointment re-arms its reminders, because the key includes the scheduled time", () => {
  const step = REMINDER_STEPS[0];
  const moved = { ...appointment, scheduledAt: "2026-10-25T04:30:00.000Z" };
  assert.notEqual(buildReminder({ appointment, step }).dedupeKey, buildReminder({ appointment: moved, step }).dedupeKey);
});

test("reminder wording tells the patient when it is and to be ready", () => {
  const notice = buildReminder({ appointment, step: REMINDER_STEPS[1] });
  assert.equal(notice.message.title, "Appointment in 1 hour");
  assert.match(notice.message.body, /in 1 hour/);
  assert.match(notice.message.body, /be ready/i);
  assert.match(notice.message.body, /10:00/);
});

test('the 1 day reminder says "tomorrow" only when the slot is really on the next clinic day', () => {
  const dayStep = REMINDER_STEPS[0];
  const titleFor = (scheduledAt) => buildReminder({ appointment: { ...appointment, scheduledAt }, step: dayStep }).message.title;
  // noon on a named clinic day, so this does not change depending on when the test is run
  const noonOn = (date) => clinicTime(date, 12 * 60);

  assert.match(titleFor(noonOn(addDays(clinicToday(), 1))), /tomorrow/);
  // a slot still on today reads differently - a late catch-up reminder must not claim the wrong day
  const today = titleFor(noonOn(clinicToday()));
  assert.ok(!today.includes("tomorrow"), `a reminder for today still said "tomorrow": ${today}`);
  assert.match(today, /in 24 hours/);
  // and neither does one two days out
  assert.match(titleFor(noonOn(addDays(clinicToday(), 2))), /in 24 hours/);
});

test("a doctor name already carrying the title is not prefixed with a second Dr.", () => {
  const stored = buildReminder({ appointment: { ...appointment, doctorName: "Dr. Amit Deshmukh" }, step: REMINDER_STEPS[1] });
  assert.ok(stored.message.body.includes("Dr. Amit Deshmukh"));
  assert.ok(!stored.message.body.includes("Dr. Dr."));
  // a name saved without the title still reads as one
  const untitled = buildReminder({ appointment: { ...appointment, doctorName: "Amit Deshmukh" }, step: REMINDER_STEPS[1] });
  assert.ok(untitled.message.body.includes("Dr. Amit Deshmukh"));
});

// ---- admin actions ----

test("reschedule reports the old time, the new time and the reason", () => {
  const notice = buildRescheduled({
    appointment: { ...appointment, scheduledAt: "2026-10-25T05:30:00.000Z" },
    previousScheduledAt: appointment.scheduledAt,
    reason: "Doctor on emergency leave",
  });
  assert.equal(notice.message.type, "appointment_rescheduled");
  const text = renderEmailText(notice.message.email);
  assert.match(text, /Previous time: Sat, 24 Oct 2026 at 10:00 am/);
  assert.match(text, /New time: Sun, 25 Oct 2026 at 11:00 am/);
  assert.ok(text.includes("Doctor on emergency leave"));
});

test("reschedule without a reason simply leaves that line out", () => {
  const notice = buildRescheduled({ appointment, previousScheduledAt: null });
  const text = renderEmailText(notice.message.email);
  assert.ok(!text.includes("Reason:"));
  assert.ok(!text.includes("Previous time:"));
});

test("completing an appointment thanks the patient; cancelling explains the refund", () => {
  const completed = buildStatusChange({ appointment, status: "completed" });
  assert.equal(completed.message.type, "appointment_completed");
  assert.match(completed.message.body, /completed/);

  const cancelled = buildStatusChange({ appointment, status: "cancelled" });
  assert.equal(cancelled.message.type, "appointment_cancelled");
  assert.match(cancelled.message.email.intro, /refund/);
});

test("a status with nothing worth telling the patient builds no notice at all", () => {
  assert.equal(buildStatusChange({ appointment, status: "pending" }), null);
  assert.equal(buildStatusChange({ appointment, status: "nonsense" }), null);
});

test("refund notice converts paise to rupees and is keyed by the refund id", () => {
  const notice = buildRefundProcessed({ payment, refund: { id: "rfnd_1", amount: 50000, status: "processed" } });
  assert.equal(notice.dedupeKey, "refund_processed:rfnd_1");
  assert.equal(notice.data.amount, 500);
  assert.match(notice.message.body, /Rs\. 500\.00/);
});

// ---- password reset ----

test("the OTP mail is never stored in the inbox", () => {
  const notice = buildPasswordOtp({ patient: { id: 7, name: "Tejas", email: "p@example.com" }, otp: "123456", validMinutes: 10 });
  assert.equal(notice.inApp, false);
  assert.equal(notice.dedupeKey, undefined); // every request must send a fresh code
  assert.match(notice.message.subject, /^123456 is your CareNest/);
  assert.ok(renderEmailHtml(notice.message.email).includes("Your code: 123456"));
  assert.match(notice.message.email.outro, /Never share this code/);
});

// ---- escaping: patient-supplied text ends up inside an HTML email ----

test("escapeHtml neutralizes markup so a crafted name can not inject into an email", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(escapeHtml("Tejas & Co"), "Tejas &amp; Co");
  assert.equal(escapeHtml(null), "");
});

test("a patient name containing markup is escaped everywhere it appears in the email", () => {
  const attacker = { ...appointment, patientName: '<img src=x onerror="steal()">' };
  const html = renderEmailHtml(buildBookingConfirmed({ appointment: attacker, payment }).message.email);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("a reschedule reason containing markup is escaped too", () => {
  const html = renderEmailHtml(
    buildRescheduled({ appointment, previousScheduledAt: appointment.scheduledAt, reason: "<b>urgent</b>" }).message.email
  );
  assert.ok(!html.includes("<b>urgent</b>"));
  assert.ok(html.includes("&lt;b&gt;urgent&lt;/b&gt;"));
});

// ---- the email shell ----

test("empty detail rows are dropped instead of showing blank lines", () => {
  const mail = { heading: "H", intro: "I", rows: [["A", "1"], ["B", null], ["C", ""], ["D", undefined]] };
  const text = renderEmailText(mail);
  assert.ok(text.includes("A: 1"));
  for (const label of ["B:", "C:", "D:"]) assert.ok(!text.includes(label));
});

test("every email carries the CareNest branding and the do-not-reply footer", () => {
  const html = renderEmailHtml({ heading: "H", intro: "I" });
  assert.ok(html.includes("CareNest"));
  assert.ok(html.includes("do not reply"));
  assert.ok(html.startsWith("<!doctype html>"));
});
