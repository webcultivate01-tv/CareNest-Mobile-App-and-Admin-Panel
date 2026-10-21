import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RAZORPAY_KEY_ID ||= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ||= "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "test_webhook_secret";

const { isValidId } = await import("../controllers/appointmentController.js");
const { escapeHtml } = await import("../controllers/paymentController.js");

// ---- id validation (guards against raw DB "invalid input syntax for type integer" errors) ----

test("isValidId accepts positive integers, including as numbers", () => {
  assert.equal(isValidId("1"), true);
  assert.equal(isValidId("42"), true);
  assert.equal(isValidId(42), true);
});

test("isValidId rejects non-numeric, negative, decimal and empty values", () => {
  assert.equal(isValidId("abc"), false);
  assert.equal(isValidId("12abc"), false);
  assert.equal(isValidId("-1"), false);
  assert.equal(isValidId("1.5"), false);
  assert.equal(isValidId(""), false);
  assert.equal(isValidId(undefined), false);
  assert.equal(isValidId(null), false);
});

// ---- payment receipt HTML escaping (stored-XSS guard: patient/doctor names are user-supplied) ----

test("escapeHtml neutralizes markup so a crafted patient/doctor name can't execute as script", () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('"><img src=x onerror=alert(1)>'), "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
});

test("escapeHtml leaves ordinary names and amounts unchanged", () => {
  assert.equal(escapeHtml("Jane Doe"), "Jane Doe");
  assert.equal(escapeHtml("₹500.00"), "₹500.00");
});

test("escapeHtml treats null/undefined as an empty string, matching the receipt's '-' fallback usage", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
