// "Security > Change password" for a patient who is already signed in (opened from SideMenu).
// Asks for the current password, so a stolen unlocked phone still cannot change it blindly.
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AuthInput from './AuthInput';
import { useLanguage } from '../i18n';
import { colors } from '../theme/colors';
import { changePassword, getToken } from '../api';

export default function ChangePasswordModal({ visible, onClose }) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    setDone('');
    onClose();
  };

  const submit = async () => {
    const e = {};
    if (!current) e.current = t('enterCurrentPassword');
    if (next.length < 8) e.next = t('passwordMin');
    if (confirm !== next) e.confirm = t('passwordsDoNotMatch');
    if (current && next && current === next) e.next = t('passwordMustDiffer');
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const data = await changePassword(await getToken(), current, next);
      setDone(data.message);
      setErrors({});
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text style={styles.title}>{t('changePassword')}</Text>
                <TouchableOpacity onPress={close} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {done ? (
                <View style={styles.success}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  <Text style={styles.successText}>{done}</Text>
                </View>
              ) : (
                <Text style={styles.subtitle}>{t('changePasswordSub')}</Text>
              )}

              <AuthInput
                icon="lock-closed-outline"
                placeholder={t('currentPassword')}
                secure
                value={current}
                onChangeText={setCurrent}
                error={errors.current}
              />
              <AuthInput
                icon="key-outline"
                placeholder={t('newPassword')}
                secure
                value={next}
                onChangeText={setNext}
                error={errors.next}
              />
              <AuthInput
                icon="key-outline"
                placeholder={t('confirmNewPassword')}
                secure
                value={confirm}
                onChangeText={setConfirm}
                error={errors.confirm}
              />

              {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

              <View style={styles.buttons}>
                <TouchableOpacity style={[styles.button, styles.cancel]} onPress={close} disabled={saving}>
                  <Text style={styles.cancelText}>{done ? t('close') : t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.save]} onPress={submit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('save')}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: 12 },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 10,
    marginVertical: 10,
  },
  successText: { flex: 1, fontSize: 13, color: colors.primaryDark },
  formError: { fontSize: 13, color: colors.danger, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 6 },
  button: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: '700' },
  save: { backgroundColor: colors.primary },
  saveText: { color: '#fff', fontWeight: '700' },
});
