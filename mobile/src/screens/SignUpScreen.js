// Create account form: full name, mobile, date of birth, email (optional),
// password + confirm password (both with show/hide) and a terms checkbox.
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  ActivityIndicator,
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
import { signUpUser } from '../api';

// Turns "25121990" into "25/12/1990" while the user types.
function formatDob(text) {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

// Checks DD/MM/YYYY is a real date in the past.
function isValidDob(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return false;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date < new Date() &&
    year > 1900
  );
}

export default function SignUpScreen({ onSignUp, onGoToLogin }) {
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    dob: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (key) => (value) => setForm({ ...form, [key]: value });

  const submit = async () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name';
    if (!/^\d{10}$/.test(form.mobile)) e.mobile = 'Enter a 10 digit mobile number';
    if (!isValidDob(form.dob)) e.dob = 'Enter a valid date as DD/MM/YYYY';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      e.email = 'Enter a valid email address';
    }
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';
    if (!agreed) e.terms = 'Please accept the Terms & Conditions';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const { token, user } = await signUpUser(form);
      onSignUp(user, token);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBrand />
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Fill in your details to get started.</Text>
          <AuthInput
            icon="person-outline"
            placeholder="Full Name"
            autoCapitalize="words"
            value={form.name}
            onChangeText={set('name')}
            error={errors.name}
          />
          <AuthInput
            icon="call-outline"
            placeholder="Mobile Number"
            keyboardType="number-pad"
            maxLength={10}
            value={form.mobile}
            onChangeText={(t) => set('mobile')(t.replace(/\D/g, ''))}
            error={errors.mobile}
          />
          <AuthInput
            icon="calendar-outline"
            placeholder="Date of Birth (DD/MM/YYYY)"
            keyboardType="number-pad"
            maxLength={10}
            value={form.dob}
            onChangeText={(t) => set('dob')(formatDob(t))}
            error={errors.dob}
          />
          <AuthInput
            icon="mail-outline"
            placeholder="Email Address (Optional)"
            keyboardType="email-address"
            autoComplete="email"
            value={form.email}
            onChangeText={set('email')}
            error={errors.email}
          />
          <AuthInput
            icon="lock-closed-outline"
            placeholder="Password"
            secure
            value={form.password}
            onChangeText={set('password')}
            error={errors.password}
          />
          <AuthInput
            icon="lock-closed-outline"
            placeholder="Confirm Password"
            secure
            value={form.confirm}
            onChangeText={set('confirm')}
            error={errors.confirm}
          />

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreed(!agreed)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
              {agreed && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={styles.termsText}>
              I agree to the <Text style={styles.link}>Terms & Conditions</Text> and{' '}
              <Text style={styles.link}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>
          {errors.terms ? <Text style={styles.error}>{errors.terms}</Text> : null}

          {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>Create Account</Text>
                <Ionicons name="arrow-forward" size={22} color="#fff" style={styles.arrow} />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.muted}>Already have an account? </Text>
            <TouchableOpacity onPress={onGoToLogin}>
              <Text style={styles.link}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#EEF9F3' },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 14,
  },
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
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  error: { fontSize: 12, color: colors.danger, marginBottom: 6 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  arrow: { position: 'absolute', right: 18 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  muted: { color: colors.textMuted, fontSize: 14 },
});
