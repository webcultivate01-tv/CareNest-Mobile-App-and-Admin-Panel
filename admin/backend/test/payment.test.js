import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

process.env.RAZORPAY_KEY_ID ||= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ||= "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "test_webhook_secret";

const { verifyCheckoutSignature, verifyWebhookSignature } = await import("../config/razorpay.js");
const { computeChangePct } = await import("../model/paymentModel.js");
const { escapeCsvCell, buildPaymentsCsv } = await import("../controllers/paymentController.js");

// ---- signature verification ----

test("verifyCheckoutSignature accepts a correctly signed order/payment pair", () => {
  const orderId = "order_abc123";
  const paymentId = "pay_xyz789";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  assert.equal(verifyCheckoutSignature(orderId, paymentId, signature), true);
});

test("verifyCheckoutSignature rejects a tampered payment id", () => {
  const orderId = "order_abc123";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|pay_xyz789`)
    .digest("hex");
  assert.equal(verifyCheckoutSignature(orderId, "pay_different", signature), false);
});

test("verifyCheckoutSignature rejects a signature made with the wrong secret", () => {
  const orderId = "order_abc123";
  const paymentId = "pay_xyz789";
  const signature = crypto.createHmac("sha256", "wrong_secret").update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(verifyCheckoutSignature(orderId, paymentId, signature), false);
});

test("verifyWebhookSignature accepts a correctly signed raw body", () => {
  const rawBody = Buffer.from(JSON.stringify({ event: "payment.captured" }));
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  assert.equal(verifyWebhookSignature(rawBody, signature), true);
});

test("verifyWebhookSignature rejects a body that was modified after signing", () => {
  const original = Buffer.from(JSON.stringify({ event: "payment.captured", amount: 100 }));
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(original).digest("hex");
  const tampered = Buffer.from(JSON.stringify({ event: "payment.captured", amount: 100000 }));
  assert.equal(verifyWebhookSignature(tampered, signature), false);
});

// ---- revenue math ----

test("computeChangePct computes a normal percentage change", () => {
  assert.equal(computeChangePct(150, 100), 50);
  assert.equal(computeChangePct(50, 100), -50);
});

test("computeChangePct returns null when there is no previous-period baseline to compare against", () => {
  assert.equal(computeChangePct(500, 0), null);
});

test("computeChangePct returns 0 when both periods have no revenue", () => {
  assert.equal(computeChangePct(0, 0), 0);
});

// ---- CSV export: formula-injection prevention + correct math ----

test("escapeCsvCell neutralizes leading =, +, -, @ so Excel/Sheets can't execute a formula", () => {
  assert.equal(escapeCsvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(escapeCsvCell("+1+1"), "'+1+1");
  assert.equal(escapeCsvCell("-1-1"), "'-1-1");
  assert.equal(escapeCsvCell("@mention"), "'@mention");
  assert.equal(escapeCsvCell("Ordinary Name"), "Ordinary Name");
});

test("escapeCsvCell quotes values containing commas, quotes, or newlines", () => {
  assert.equal(escapeCsvCell('Doe, "Jane"'), '"Doe, ""Jane"""');
});

test("buildPaymentsCsv reports gross, refund and net using the same amounts shown in the UI", () => {
  const csv = buildPaymentsCsv([
    {
      capturedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      providerPaymentId: "pay_1",
      patientName: "Jane Doe",
      appointmentId: 42,
      method: "upi",
      amount: "500.00",
      refundedAmount: "200.00",
      status: "partially_refunded",
    },
  ]);
  const dataLine = csv.split("\r\n")[1];
  assert.match(dataLine, /500\.00/);
  assert.match(dataLine, /200\.00/);
  assert.match(dataLine, /300\.00/); // net = gross - refund
});
