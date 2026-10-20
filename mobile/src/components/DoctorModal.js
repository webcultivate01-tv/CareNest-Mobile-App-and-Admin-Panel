// Doctor profile + booking form (opens when a doctor card is tapped).
// Pick a day, pick a free time slot, add a note and book. Slots come live from the server.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { bookAppointment, getDoctorDays, getDoctorSlots, getToken } from '../api';
import { formatTime } from './DoctorCard';

const dayLabel = (date) => {
  const d = new Date(`${date}T00:00:00`);
  return {
    week: d.toLocaleDateString('en-US', { weekday: 'short' }),
    num: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
};

// doctor = a doctor from the list (null = closed); onBooked = refresh the list after booking
export default function DoctorModal({ doctor, onClose, onBooked }) {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  // load the next days whenever a doctor is opened
  useEffect(() => {
    if (!doctor) return;
    setDays([]);
    setDate(null);
    setSlots([]);
    setSlot(null);
    setNotes('');
    setError('');
    (async () => {
      try {
        const { days: list } = await getDoctorDays(await getToken(), doctor.id);
        setDays(list);
        const first = list.find((d) => d.freeSlots > 0);
        setDate(first ? first.date : list[0]?.date || null);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [doctor]);

  const loadSlots = async (day) => {
    setLoading(true);
    setSlot(null);
    try {
      const data = await getDoctorSlots(await getToken(), doctor.id, day);
      setSlots(data.slots);
      setError('');
    } catch (e) {
      setSlots([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (doctor && date) loadSlots(date);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = async () => {
    if (!slot) return setError('Choose a time slot');
    setBooking(true);
    try {
      await bookAppointment(await getToken(), doctor.id, slot.startsAt, notes.trim());
      Alert.alert('Appointment booked', `${doctor.name}\n${date} at ${formatTime(slot.time)}`);
      onBooked?.();
      onClose();
    } catch (e) {
      setError(e.message);
      loadSlots(date); // the slot may have just been taken
    } finally {
      setBooking(false);
    }
  };

  return (
    <Modal visible={!!doctor} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.bar}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.barTitle}>Doctor Profile</Text>
          <View style={{ width: 24 }} />
        </View>

        {doctor && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.profile}>
              {doctor.photo ? (
                <Image source={{ uri: doctor.photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Ionicons name="person" size={44} color={colors.primary} />
                </View>
              )}
              <Text style={styles.name}>{doctor.name}</Text>
              <Text style={styles.specialty}>{doctor.specialty}</Text>
              {doctor.qualifications ? <Text style={styles.muted}>{doctor.qualifications}</Text> : null}
            </View>

            <View style={styles.stats}>
              <Stat label="Experience" value={`${doctor.experienceYears} yrs`} />
              <Stat label="Fee" value={`₹${doctor.fee}`} />
              <Stat label="Visit" value={`${doctor.appointmentDuration} min`} />
            </View>

            <Text style={styles.section}>Choose a day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {days.map((d) => {
                const l = dayLabel(d.date);
                const off = d.freeSlots === 0;
                const active = d.date === date;
                return (
                  <TouchableOpacity
                    key={d.date}
                    disabled={off}
                    onPress={() => setDate(d.date)}
                    style={[styles.day, active && styles.dayActive, off && styles.dayOff]}
                  >
                    <Text style={[styles.dayWeek, active && styles.onActive]}>{l.week}</Text>
                    <Text style={[styles.dayNum, active && styles.onActive]}>{l.num}</Text>
                    <Text style={[styles.dayWeek, active && styles.onActive]}>{l.month}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.section}>Available time</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : slots.length === 0 ? (
              <Text style={styles.muted}>No free slots on this day.</Text>
            ) : (
              <View style={styles.slots}>
                {slots.map((s) => (
                  <TouchableOpacity
                    key={s.startsAt}
                    onPress={() => setSlot(s)}
                    style={[styles.slot, slot?.startsAt === s.startsAt && styles.slotActive]}
                  >
                    <Text style={[styles.slotText, slot?.startsAt === s.startsAt && styles.onActive]}>
                      {formatTime(s.time)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.section}>Notes (optional)</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Describe your problem"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, (!slot || booking) && styles.buttonOff]}
            onPress={book}
            disabled={booking}
          >
            {booking ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Book Appointment</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  barTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  profile: { alignItems: 'center', marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryLight },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 12 },
  specialty: { fontSize: 15, color: colors.primary, fontWeight: '600', marginTop: 2 },
  muted: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stats: {
    flexDirection: 'row',
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 24, marginBottom: 10 },
  chips: { gap: 10 },
  day: {
    width: 60,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayOff: { opacity: 0.35 },
  dayWeek: { fontSize: 12, color: colors.textMuted },
  dayNum: { fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: 2 },
  onActive: { color: '#fff' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 80,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  button: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonOff: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
