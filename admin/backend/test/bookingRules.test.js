import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RAZORPAY_KEY_ID ||= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ||= "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "test_webhook_secret";

const { dayClosedReason, toHHMM } = await import("../config/booking.js");
const { readDailyLimit } = await import("../controllers/slotController.js");

const open = {
  dateStr: "2026-10-28",
  today: "2026-10-28",
  nowMinutes: 9 * 60,
  cutoffTime: null,
  doctorBooked: 0,
  doctorLimit: null,
  hospitalBooked: null,
  hospitalLimit: null,
};

// ---- same-day booking cutoff ----

test("no rules set: the day stays open", () => {
  assert.equal(dayClosedReason(open), null);
});

test("cutoff closes today once the clinic clock reaches it", () => {
  assert.equal(dayClosedReason({ ...open, cutoffTime: "11:00", nowMinutes: 10 * 60 + 59 }), null);
  const closed = dayClosedReason({ ...open, cutoffTime: "11:00", nowMinutes: 11 * 60 });
  assert.equal(closed.code, "cutoff");
  assert.match(closed.message, /11:00 AM/);
});

test("cutoff never closes a later day", () => {
  assert.equal(dayClosedReason({ ...open, dateStr: "2026-10-29", cutoffTime: "11:00", nowMinutes: 23 * 60 }), null);
});

// ---- daily limits ----

test("doctor limit closes the day when reached, not before", () => {
  assert.equal(dayClosedReason({ ...open, doctorLimit: 20, doctorBooked: 19 }), null);
  assert.equal(dayClosedReason({ ...open, doctorLimit: 20, doctorBooked: 20 }).code, "doctorFull");
});

test("hospital limit closes the day when reached, not before", () => {
  assert.equal(dayClosedReason({ ...open, hospitalLimit: 100, hospitalBooked: 99 }), null);
  assert.equal(dayClosedReason({ ...open, hospitalLimit: 100, hospitalBooked: 100 }).code, "hospitalFull");
});

// ---- admin input ----

test("readDailyLimit: empty means no limit", () => {
  assert.deepEqual(readDailyLimit(""), { value: null });
  assert.deepEqual(readDailyLimit(null), { value: null });
  assert.deepEqual(readDailyLimit(undefined), { value: null });
});

test("readDailyLimit accepts whole numbers 1..1000 and rejects the rest", () => {
  assert.deepEqual(readDailyLimit(40), { value: 40 });
  assert.deepEqual(readDailyLimit("40"), { value: 40 });
  for (const bad of [0, -5, 2.5, "abc", 1001]) assert.ok(readDailyLimit(bad).error, `expected ${bad} to be rejected`);
});

test("toHHMM pads hours and minutes", () => {
  assert.equal(toHHMM(9 * 60 + 5), "09:05");
  assert.equal(toHHMM(13 * 60 + 30), "13:30");
});
