import bcrypt from "bcryptjs";
import crypto from "crypto";
import validator from "validator";
import { notifyInBackground, notifyPasswordChanged, sendPasswordOtp } from "../config/notifications.js";
import {
  bumpResetAttempts,
  countRecentResetRequests,
  expirePreviousResets,
  findActiveReset,
  findResetByToken,
  insertPasswordReset,
  markResetUsed,
  markResetVerified,
} from "../model/notificationModel.js";
import {
  findPatientByEmail,
  findPatientById,
  findPatientWithPasswordById,
  setPatientPassword,
} from "../model/patientModel.js";

// Forgot password, by email OTP, in three steps:
//   1. POST /api/user/password/forgot      { email }                        -> emails a 6 digit code
//   2. POST /api/user/password/verify-otp  { email, otp }                   -> returns a resetToken
//   3. POST /api/user/password/reset       { email, resetToken, password }  -> sets the new password
// and, for a patient who is already signed in:
//      POST /api/user/password/change      { currentPassword, newPassword }
//
// Rules that keep this safe:
//   - the code is stored only as a SHA-256 hash, so the database never holds a usable code
//   - a code lasts OTP_MINUTES and allows MAX_ATTEMPTS wrong tries, then it is dead
//   - step 1 always answers the same way whether or not the email exists, so this endpoint can not
//     be used to find out who has a CareNest account
//   - step 3 needs the short-lived token from step 2, so knowing only an email can never set a password

const OTP_MINUTES = 10;
const TOKEN_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS = 3; // codes per RATE_WINDOW_MINUTES, per account
const RATE_WINDOW_MINUTES = 15;

// deliberately identical for "no such email", "that account has no password" and the success case
const GENERIC_SENT = "If that email is registered, a 6 digit code has been sent to it.";

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

// 6 digits from a cryptographic source (Math.random is guessable and must never mint a reset code)
const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const cleanEmail = (email) => (email && String(email).trim() ? String(email).trim().toLowerCase() : "");

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

// ---- step 1: ask for a code ----
export const forgotPassword = async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ message: "Enter your registered email address" });
    }

    const patient = await findPatientByEmail(email);
    // patients added by the admin have no password yet, so there is nothing to reset for them
    if (!patient || !patient.password) {
      return res.status(200).json({ message: GENERIC_SENT, validMinutes: OTP_MINUTES });
    }
    if ((await countRecentResetRequests(patient.id, RATE_WINDOW_MINUTES)) >= MAX_REQUESTS) {
      return res
        .status(429)
        .json({ message: `Too many reset attempts. Please wait ${RATE_WINDOW_MINUTES} minutes and try again.` });
    }

    const otp = generateOtp();
    await expirePreviousResets(patient.id); // a new code invalidates any earlier one
    await insertPasswordReset({
      patientId: patient.id,
      otpHash: hash(otp),
      expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000),
    });
    // awaited, not backgrounded: the patient is staring at the screen waiting for this mail, so a
    // delivery failure has to be reported instead of silently logged
    await sendPasswordOtp({ patient, otp, validMinutes: OTP_MINUTES });

    return res.status(200).json({ message: GENERIC_SENT, validMinutes: OTP_MINUTES });
  } catch (error) {
    return sendError(res, "ForgotPassword", error);
  }
};

// ---- step 2: check the code, hand back a one-time token ----
export const verifyPasswordOtp = async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Enter the 6 digit code sent to your email" });
    }

    const patient = await findPatientByEmail(email);
    const reset = patient ? await findActiveReset(patient.id) : null;
    // same message for every failure reason, so the response never reveals whether the email exists
    const invalid = { message: "This code is not valid or has expired. Please request a new one." };
    if (!reset) return res.status(400).json(invalid);
    if (new Date(reset.expiresAt).getTime() < Date.now()) return res.status(400).json(invalid);
    if (reset.attempts >= MAX_ATTEMPTS) {
      await markResetUsed(reset.id); // burn it: no more guessing on this code
      return res.status(429).json({ message: "Too many wrong codes. Please request a new one." });
    }
    if (hash(otp) !== reset.otpHash) {
      const attempts = await bumpResetAttempts(reset.id);
      const left = Math.max(0, MAX_ATTEMPTS - attempts);
      return res.status(400).json({
        message: left ? `Incorrect code. ${left} attempt(s) left.` : "Too many wrong codes. Please request a new one.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await markResetVerified(reset.id, {
      resetTokenHash: hash(resetToken),
      tokenExpiresAt: new Date(Date.now() + TOKEN_MINUTES * 60 * 1000),
    });
    return res.status(200).json({ message: "Code verified", resetToken, validMinutes: TOKEN_MINUTES });
  } catch (error) {
    return sendError(res, "VerifyPasswordOtp", error);
  }
};

// ---- step 3: set the new password ----
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, password } = req.body;
    if (!resetToken) {
      return res.status(400).json({ message: "Verify the code sent to your email first" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const reset = await findResetByToken(hash(resetToken));
    if (!reset) {
      return res.status(400).json({ message: "This reset has expired. Please start again." });
    }
    const patient = await findPatientById(reset.patientId);
    if (!patient) {
      return res.status(404).json({ message: "User does not found" });
    }

    await setPatientPassword(reset.patientId, await bcrypt.hash(password, 10));
    await markResetUsed(reset.id); // one token, one password change
    notifyInBackground(() => notifyPasswordChanged(patient));

    return res.status(200).json({ message: "Password changed successfully. Please sign in with your new password." });
  } catch (error) {
    return sendError(res, "ResetPassword", error);
  }
};

// ---- signed-in patient changing their own password ----
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Enter your current and new password" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const patient = await findPatientById(req.userId);
    if (!patient) {
      return res.status(404).json({ message: "User does not found" });
    }
    // findPatientById hides the hash, so read the row that still has it
    const withPassword = await findPatientWithPasswordById(req.userId);
    if (!withPassword?.password) {
      return res.status(400).json({ message: "This account has no password set" });
    }
    if (!(await bcrypt.compare(currentPassword, withPassword.password))) {
      return res.status(400).json({ message: "Your current password is incorrect" });
    }
    if (await bcrypt.compare(newPassword, withPassword.password)) {
      return res.status(400).json({ message: "Choose a password different from your current one" });
    }

    await setPatientPassword(req.userId, await bcrypt.hash(newPassword, 10));
    notifyInBackground(() => notifyPasswordChanged(patient));
    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    return sendError(res, "ChangePassword", error);
  }
};
