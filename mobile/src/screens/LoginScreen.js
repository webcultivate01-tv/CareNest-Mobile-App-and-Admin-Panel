// Login screen: one white card with the logo and the sign-in form.
// The user logs in with email or mobile number + password (with show/hide).
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
import { loginUser } from '../api';

const isEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
const isMobile = (v) => /^\d{10}$/.test(v);

export default function LoginScreen({ onLogin, onGoToSignUp, onForgotPassword }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = {};
    const value = id.trim();
    if (!isEmail(value) && !isMobile(value)) e.id = 'Enter a valid email or 10 digit mobile number';
    if (!password) e.password = 'Enter your password';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      const { token, user } = await loginUser(value, password);
      onLogin(user, token);
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
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* White card with logo and form */}
        <AuthBrand />
        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>Enter your details to access your account.</Text>

          <AuthInput
            icon="mail-outline"
            placeholder="Email or Mobile Number"
            keyboardType="email-address"
            autoComplete="email"
            value={id}
            onChangeText={setId}
            error={errors.id}
          />
          <AuthInput
            icon="lock-closed-outline"
            placeholder="Password"
            secure
            value={password}
            onChangeText={setPassword}
            error={errors.password}
          />

          <TouchableOpacity style={styles.forgot} onPress={onForgotPassword}>
            <Text style={styles.link}>Forgot Password?</Text>
          </TouchableOpacity>

          {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

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
                <Text style={styles.buttonText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={22} color="#fff" style={styles.arrow} />
              </>
            )}
          </TouchableOpacity>

          <View style={styles.orRow}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          {/* TODO: connect real Google sign-in. */}
          <TouchableOpacity
            style={styles.google}
            onPress={() => setErrors({ form: 'Google sign-in is coming soon' })}
          >
            <Ionicons name="logo-google" size={20} color="#4285F4" />
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.muted}>Don't have an account? </Text>
            <TouchableOpacity onPress={onGoToSignUp}>
              <Text style={styles.link}>Sign Up</Text>
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
  title: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  forgot: { alignSelf: 'flex-end', marginBottom: 12 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  button: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  formError: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  arrow: { position: 'absolute', right: 18 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  googleText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  muted: { color: colors.textMuted, fontSize: 14 },
});
