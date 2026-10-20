// Forgot password: one white card with the logo, an email / mobile box and a
// "Send reset link" button. Same look as the Login and Sign Up screens.
import { useState } from 'react';
import {
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

const isEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
const isMobile = (v) => /^\d{10}$/.test(v);

export default function ForgotPasswordScreen({ onBack }) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const submit = () => {
    const value = id.trim();
    if (!isEmail(value) && !isMobile(value)) {
      setError('Enter a valid email or 10 digit mobile number');
      setSentTo('');
      return;
    }
    setError('');
    // TODO: call the server here to really send the reset link / code.
    setSentTo(value);
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
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email or mobile number and we'll send you a link to reset your password.
          </Text>

          <AuthInput
            icon="mail-outline"
            placeholder="Email or Mobile Number"
            keyboardType="email-address"
            autoComplete="email"
            value={id}
            onChangeText={setId}
            error={error}
          />

          {sentTo ? (
            <View style={styles.success}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.successText}>Reset link sent to {sentTo}. Check your inbox.</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.button} onPress={submit} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{sentTo ? 'Resend Link' : 'Send Reset Link'}</Text>
            <Ionicons name="arrow-forward" size={22} color="#fff" style={styles.arrow} />
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.muted}>Remember your password? </Text>
            <TouchableOpacity onPress={onBack}>
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
    lineHeight: 19,
  },
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
  button: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  arrow: { position: 'absolute', right: 18 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  muted: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
