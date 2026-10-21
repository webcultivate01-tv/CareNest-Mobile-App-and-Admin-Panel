// Forgot password, in three steps on one card (same look as Login and Sign Up):
//   1. "email"    - enter the registered email, the server emails a 6 digit code
//   2. "otp"      - type the code; a correct code returns a short-lived reset token
//   3. "password" - choose the new password, which needs that token
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthBrand from '../components/AuthBrand';
import AuthInput from '../components/AuthInput';
import { colors } from '../theme/colors';
import { requestPasswordOtp, resetPassword, verifyPasswordOtp } from '../api';

const isEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
const RESEND_SECONDS = 30;

export default function ForgotPasswordScreen({ onBack }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds until "Resend code" works again
  const timer = useRef(null);

  // tick the resend cooldown down to zero
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timer.current = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer.current);
  }, [cooldown]);

  const run = async (action) => {
    setLoading(true);
    try {
      await action();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  };

  // step 1 - also used by "Resend code"
  const sendCode = (resend = false) => {
    const value = email.trim();
    if (!isEmail(value)) {
      setErrors({ email: 'Enter your registered email address' });
      return;
    }
    setErrors({});
    run(async () => {
      const data = await requestPasswordOtp(value);
      setNotice(data.message);
      setCooldown(RESEND_SECONDS);
      if (!resend) {
        setOtp('');
        setStep('otp');
      }
    });
  };

  // step 2
  const checkCode = () => {
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: 'Enter the 6 digit code from your email' });
      return;
    }
    setErrors({});
    run(async () => {
      const data = await verifyPasswordOtp(email.trim(), otp);
      setResetToken(data.resetToken);
      setNotice('');
      setStep('password');
    });
  };

  // step 3
  const savePassword = () => {
    const e = {};
    if (password.length < 8) e.password = 'Password must be at least 8 characters';
    if (confirm !== password) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;
    run(async () => {
      const data = await resetPassword(resetToken, password);
      setNotice(data.message);
      setStep('done');
    });
  };

  const steps = {
    email: {
      title: 'Forgot Password?',
      subtitle: 'Enter your registered email address and we will send you a 6 digit verification code.',
      action: 'Send Code',
      onPress: () => sendCode(false),
    },
    otp: {
      title: 'Enter Verification Code',
      subtitle: `We sent a 6 digit code to ${email.trim()}. It is valid for 10 minutes.`,
      action: 'Verify Code',
      onPress: checkCode,
    },
    password: {
      title: 'Set a New Password',
      subtitle: 'Your code is verified. Choose a new password for your CareNest account.',
      action: 'Change Password',
      onPress: savePassword,
    },
    done: {
      title: 'Password Changed',
      subtitle: 'Your password has been changed. You can now sign in with your new password.',
      action: 'Back to Sign In',
      onPress: onBack,
    },
  }[step];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBrand />
        <View style={styles.card}>
          {/* which of the three steps we are on */}
          {step !== 'done' ? (
            <View style={styles.dots}>
              {['email', 'otp', 'password'].map((name, index) => {
                const current = ['email', 'otp', 'password'].indexOf(step);
                return (
                  <View
                    key={name}
                    style={[styles.stepDot, index <= current && styles.stepDotActive, index < current && styles.stepDotDone]}
                  />
                );
              })}
            </View>
          ) : null}

          <Text style={styles.title}>{steps.title}</Text>
          <Text style={styles.subtitle}>{steps.subtitle}</Text>

          {step === 'email' ? (
            <AuthInput
              icon="mail-outline"
              placeholder="Registered Email"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
            />
          ) : null}

          {step === 'otp' ? (
            <>
              <AuthInput
                icon="keypad-outline"
                placeholder="6 digit code"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/\D/g, ''))}
                error={errors.otp}
              />
              <View style={styles.resendRow}>
                <TouchableOpacity onPress={() => sendCode(true)} disabled={cooldown > 0 || loading} hitSlop={8}>
                  <Text style={[styles.link, (cooldown > 0 || loading) && styles.linkDisabled]}>
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setStep('email');
                    setErrors({});
                    setNotice('');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.link}>Change email</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {step === 'password' ? (
            <>
              <AuthInput
                icon="lock-closed-outline"
                placeholder="New Password"
                secure
                value={password}
                onChangeText={setPassword}
                error={errors.password}
              />
              <AuthInput
                icon="lock-closed-outline"
                placeholder="Confirm New Password"
                secure
                value={confirm}
                onChangeText={setConfirm}
                error={errors.confirm}
              />
            </>
          ) : null}

          {notice && step !== 'password' ? (
            <View style={styles.success}>
              <Ionicons
                name={step === 'done' ? 'checkmark-circle' : 'mail-unread-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.successText}>{notice}</Text>
            </View>
          ) : null}

          {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={steps.onPress}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>{steps.action}</Text>
                <Ionicons name="arrow-forward" size={22} color="#fff" style={styles.arrow} />
              </>
            )}
          </TouchableOpacity>

          {step !== 'done' ? (
            <View style={styles.switchRow}>
              <Text style={styles.muted}>Remember your password? </Text>
              <TouchableOpacity onPress={onBack}>
                <Text style={styles.link}>Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#EEF9F3' },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },
  stepDot: { width: 26, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotDone: { backgroundColor: '#8FCFAC' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 19,
  },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  successText: { flex: 1, fontSize: 13, color: colors.primaryDark },
  formError: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 8 },
  button: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  arrow: { position: 'absolute', right: 18 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  muted: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  linkDisabled: { color: colors.textMuted },
});
