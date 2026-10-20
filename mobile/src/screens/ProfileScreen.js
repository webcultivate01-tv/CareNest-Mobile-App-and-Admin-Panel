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

// One row in the details list. Skipped if there is no value.
function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

// user         = details saved when the user signed up / logged in
// onUserChange = called with the new details after a successful edit / photo change
// onLogout     = function we call when "Log out" is tapped
export default function ProfileScreen({ user, onUserChange, onLogout }) {
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
      <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} disabled={photoBusy}>
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
      {user.photo && !photoBusy ? (
        <TouchableOpacity onPress={removePhoto} hitSlop={8} style={styles.removePhoto}>
          <Text style={styles.removePhotoText}>Remove photo</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.name}>{name}</Text>

      {editing ? (
        <View style={styles.card}>
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
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.save]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <InfoRow icon="call-outline" label="Mobile number" value={user.mobile} />
            <InfoRow icon="calendar-outline" label="Date of birth" value={user.dob} />
            <InfoRow icon="mail-outline" label="Email" value={user.email} />
            <InfoRow icon="person-outline" label="Signed in as" value={user.email || user.mobile} />
          </View>
          <TouchableOpacity style={styles.edit} onPress={startEdit} activeOpacity={0.85}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={styles.editText}>Edit profile</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.logout} onPress={onLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, alignItems: 'center' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    overflow: 'hidden',
  },
  avatarImage: { width: 84, height: 84 },
  avatarBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryDark,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhoto: { marginTop: 8 },
  removePhotoText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 12, marginBottom: 20 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  form: { paddingVertical: 16 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  buttons: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.text, fontWeight: '700' },
  save: { backgroundColor: colors.primary },
  saveText: { color: '#fff', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, fontWeight: '600', marginTop: 1 },
  edit: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 16,
  },
  editText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  logout: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    marginTop: 12,
  },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
