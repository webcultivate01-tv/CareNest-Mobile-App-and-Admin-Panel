// Profile tab: shows the user's details, lets them edit name / mobile / date of birth,
// change or remove the profile photo (email can not be changed), and Log out.
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AuthInput from '../components/AuthInput';
import SideMenu from '../components/SideMenu';
import { useLanguage } from '../i18n';
import { colors } from '../theme/colors';
import { deletePhoto, getToken, updateProfile, uploadPhoto } from '../api';

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

// Round icon used at the start of every row.
function IconCircle({ icon, danger }) {
  return (
    <View style={[styles.iconCircle, danger && styles.iconCircleDanger]}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
    </View>
  );
}

// One row in the Personal Information card. Skipped if there is no value.
function InfoRow({ icon, label, value, onPress, last }) {
  if (!value) return null;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <IconCircle icon={icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}


// user         = details saved when the user signed up / logged in
// onUserChange = called with the new details after a successful edit / photo change
// onLogout     = function we call when "Log out" is tapped
export default function ProfileScreen({ user, onUserChange, onLogout }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = user.name || 'CareNest User';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', dob: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const set = (key) => (value) => setForm({ ...form, [key]: value });

  const startEdit = () => {
    setForm({ name: user.name || '', mobile: user.mobile || '', dob: user.dob || '' });
    setErrors({});
    setEditing(true);
  };

  const save = async () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name';
    if (!/^\d{10}$/.test(form.mobile)) e.mobile = 'Enter a 10 digit mobile number';
    if (!isValidDob(form.dob)) e.dob = 'Enter a valid date as DD/MM/YYYY';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const data = await updateProfile(await getToken(), form);
      onUserChange(data.user);
      setEditing(false);
    } catch (err) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  // Runs a photo request and puts the returned user into the app.
  const withPhotoBusy = async (action) => {
    setPhotoBusy(true);
    try {
      const data = await action(await getToken());
      onUserChange(data.user);
    } catch (err) {
      Alert.alert('Photo error', err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) withPhotoBusy((token) => uploadPhoto(token, result.assets[0]));
  };

  const removePhoto = () =>
    Alert.alert('Remove photo', 'Delete your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => withPhotoBusy(deletePhoto) },
    ]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t("profile")}</Text>
        <TouchableOpacity style={styles.dots} onPress={() => setMenuOpen(true)} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Header card: photo, name, role, edit button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={pickPhoto}
          onLongPress={user.photo ? removePhoto : undefined}
          activeOpacity={0.85}
          disabled={photoBusy}
        >
          <View style={styles.avatar}>
            {user.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
            )}
            {photoBusy && (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.role}>{t("patient")}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.editPill}
              onPress={editing ? () => setEditing(false) : startEdit}
              activeOpacity={0.85}
            >
              <Ionicons
                name={editing ? 'close-outline' : 'create-outline'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.editPillText}>{editing ? t("cancel") : t("editProfile")}</Text>
            </TouchableOpacity>
            {user.photo && !photoBusy ? (
              <TouchableOpacity onPress={removePhoto} hitSlop={8}>
                <Text style={styles.removePhotoText}>{t("removePhoto")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* Personal information */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{t("personalInfo")}</Text>
          {!editing && (
            <TouchableOpacity style={styles.cardEdit} onPress={startEdit} hitSlop={8}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={styles.cardEditText}>{t("edit")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <View style={styles.form}>
            <AuthInput
              label="Full name"
              icon="person-outline"
              autoCapitalize="words"
              value={form.name}
              onChangeText={set('name')}
              error={errors.name}
            />
            <AuthInput
              label="Mobile number"
              icon="call-outline"
              keyboardType="number-pad"
              maxLength={10}
              value={form.mobile}
              onChangeText={(t) => set('mobile')(t.replace(/\D/g, ''))}
              error={errors.mobile}
            />
            <AuthInput
              label="Date of birth (DD/MM/YYYY)"
              icon="calendar-outline"
              keyboardType="number-pad"
              maxLength={10}
              value={form.dob}
              onChangeText={(t) => set('dob')(formatDob(t))}
              error={errors.dob}
            />
            <Text style={styles.hint}>Email cannot be changed: {user.email || 'not set'}</Text>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, styles.cancel]}
                onPress={() => setEditing(false)}
                disabled={saving}
              >
                <Text style={styles.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.save]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t("save")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <InfoRow icon="call-outline" label={t("mobileNumber")} value={user.mobile} onPress={startEdit} />
            <InfoRow icon="calendar-outline" label={t("dob")} value={user.dob} onPress={startEdit} />
            <InfoRow
              icon="mail-outline"
              label={t("email")}
              value={user.email}
              onPress={() => Alert.alert('Email', 'Email cannot be changed.')}
              last
            />
          </>
        )}
      </View>
      <SideMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onLogout={onLogout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  dots: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 92, height: 92 },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 38, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  role: { fontSize: 16, color: colors.textMuted, marginTop: 2 },
  headerActions: { marginTop: 10, alignItems: 'flex-start', gap: 8 },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#CDEBD9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editPillText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  removePhotoText: { color: colors.danger, fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 2,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 },
  cardEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardEditText: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDanger: { backgroundColor: '#FDECEC' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 1 },
  menuTitle: { fontSize: 14, color: colors.text, fontWeight: '700' },
  menuSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  form: { paddingVertical: 12 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  buttons: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: '700' },
  save: { backgroundColor: colors.primary },
  saveText: { color: '#fff', fontWeight: '700' },

  // Small, centered button (not full width).
  logout: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
    marginTop: 4,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
});
