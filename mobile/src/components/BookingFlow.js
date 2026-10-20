// The full "Book Appointment" flow, shown as one full-screen page with 4 steps:
//   doctors -> details (day, time, disease) -> payment (fee summary) -> success
// Opened from Quick Access (no doctor yet) or by tapping a doctor card (doctor already chosen).
// Payment is simulated for now: tapping Pay books the appointment straight away.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { bookAppointment, getDoctorDays, getDoctorSlots, getDoctors, getToken } from '../api';
import DoctorCard, { formatTime } from './DoctorCard';

const PLATFORM_FEE = 20; // rupees
const GST_RATE = 0.05; // charged on consultation fee + platform fee
const SUCCESS_GREEN = '#1FA64A';

const DISEASES = [
  { id: 'Fever', icon: 'thermometer-outline' },
  { id: 'Cold & Cough', icon: 'snow-outline' },
  { id: 'Headache', icon: 'flash-outline' },
  { id: 'Stomach Pain', icon: 'medkit-outline' },
  { id: 'Other', icon: 'create-outline' },
];

const money = (n) => `₹${n.toFixed(2)}`;

// fee breakdown shown on the payment step
const feeBreakup = (fee) => {
  const consultation = Number(fee);
  const gst = Math.round((consultation + PLATFORM_FEE) * GST_RATE * 100) / 100;
  return { consultation, platform: PLATFORM_FEE, gst, total: consultation + PLATFORM_FEE + gst };
};

const dayLabel = (date) => {
  const d = new Date(`${date}T00:00:00`);
  return {
    week: d.toLocaleDateString('en-US', { weekday: 'short' }),
    num: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
};

const longDate = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// visible = open / closed; startDoctor = skip the doctor list; onBooked = refresh the home list
export default function BookingFlow({ visible, startDoctor = null, onClose, onBooked }) {
  const [step, setStep] = useState('doctors');
  const [doctors, setDoctors] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState(null);
  const [disease, setDisease] = useState(null);
  const [otherText, setOtherText] = useState('');
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // the booked appointment, for the success page

  const pickDoctor = async (d) => {
    setDoctor(d);
    setStep('details');
    setDays([]);
    setDate(null);
    setSlots([]);
    setSlot(null);
    setError('');
    try {
      const { days: list } = await getDoctorDays(await getToken(), d.id);
      setDays(list);
      const first = list.find((x) => x.freeSlots > 0);
      setDate(first ? first.date : list[0]?.date || null);
    } catch (e) {
      setError(e.message);
    }
  };

  // reset every time the flow opens
  useEffect(() => {
    if (!visible) return;
    setDisease(null);
    setOtherText('');
    setResult(null);
    setError('');
    setPaying(false);
    if (startDoctor) {
      pickDoctor(startDoctor);
      return;
    }
    setStep('doctors');
    setDoctor(null);
    setDoctors(null);
    (async () => {
      try {
        setDoctors(await getDoctors(await getToken()));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (doctor && date && step === 'details') loadSlots(date);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => {
    setError('');
    if (step === 'payment') setStep('details');
    else if (step === 'details' && !startDoctor) setStep('doctors');
    else onClose();
  };

  const goToPayment = () => {
    if (!slot) return setError('Choose a time slot');
    if (!disease) return setError('Choose what you are visiting for');
    if (disease === 'Other' && !otherText.trim()) return setError('Type your problem in the box');
    setError('');
    setStep('payment');
  };

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      await new Promise((r) => setTimeout(r, 1200)); // pretend to process the payment
      const reason = disease === 'Other' ? `Other: ${otherText.trim()}` : disease;
      const { appointment } = await bookAppointment(await getToken(), doctor.id, slot.startsAt, reason);
      setResult({ id: appointment?.id, total: feeBreakup(doctor.fee).total, reason });
      setStep('success');
      onBooked?.();
    } catch (e) {
      setError(e.message);
      // the slot may have just been taken: go back so the user can choose another
      setStep('details');
      loadSlots(date);
    } finally {
      setPaying(false);
    }
  };

  const title = { doctors: 'Select Doctor', details: 'Appointment Details', payment: 'Payment' }[step];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <SafeAreaView style={styles.root}>
        {step === 'success' ? (
          <Success doctor={doctor} date={date} slot={slot} result={result} onDone={onClose} />
        ) : (
          <>
            <View style={styles.bar}>
              <TouchableOpacity onPress={goBack} hitSlop={10} disabled={paying}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.barTitle}>{title}</Text>
              <View style={{ width: 24 }} />
            </View>

            {step === 'doctors' && (
              <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.hint}>Choose a doctor to continue</Text>
                {doctors === null && !error && <ActivityIndicator color={colors.primary} style={styles.gap} />}
                {error && doctors === null ? <Text style={styles.error}>{error}</Text> : null}
                {doctors?.length === 0 && <Text style={styles.muted}>No doctors are available right now.</Text>}
                {doctors?.map((d) => (
                  <DoctorCard key={d.id} doctor={d} onPress={() => pickDoctor(d)} />
                ))}
              </ScrollView>
            )}

            {step === 'details' && doctor && (
              <>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  <DoctorRow doctor={doctor} />

                  <Text style={styles.section}>Select date</Text>
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
                          style={[styles.day, active && styles.chipActive, off && styles.dayOff]}
                        >
                          <Text style={[styles.dayWeek, active && styles.onActive]}>{l.week}</Text>
                          <Text style={[styles.dayNum, active && styles.onActive]}>{l.num}</Text>
                          <Text style={[styles.dayWeek, active && styles.onActive]}>{l.month}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.section}>Select time slot</Text>
                  {loading ? (
                    <ActivityIndicator color={colors.primary} style={styles.gap} />
                  ) : slots.length === 0 ? (
                    <Text style={styles.muted}>No free slots on this day.</Text>
                  ) : (
                    <View style={styles.wrap}>
                      {slots.map((s) => (
                        <TouchableOpacity
                          key={s.startsAt}
                          onPress={() => setSlot(s)}
                          style={[styles.pill, slot?.startsAt === s.startsAt && styles.chipActive]}
                        >
                          <Text style={[styles.pillText, slot?.startsAt === s.startsAt && styles.onActive]}>
                            {formatTime(s.time)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.section}>Disease type</Text>
                  <View style={styles.wrap}>
                    {DISEASES.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        onPress={() => setDisease(d.id)}
                        style={[styles.pill, styles.pillRow, disease === d.id && styles.chipActive]}
                      >
                        <Ionicons name={d.icon} size={16} color={disease === d.id ? '#fff' : colors.primary} />
                        <Text style={[styles.pillText, disease === d.id && styles.onActive]}>{d.id}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {disease === 'Other' && (
                    <TextInput
                      style={styles.input}
                      value={otherText}
                      onChangeText={setOtherText}
                      placeholder="Type your problem"
                      placeholderTextColor={colors.textMuted}
                      maxLength={200}
                      multiline
                    />
                  )}

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </ScrollView>
                <Footer label="Continue to Payment" onPress={goToPayment} />
              </>
            )}

            {step === 'payment' && doctor && slot && (
              <>
                <ScrollView contentContainerStyle={styles.content}>
                  <DoctorRow doctor={doctor} />

                  <View style={styles.card}>
                    <Line icon="calendar-outline" label="Date" value={longDate(date)} />
                    <Line icon="time-outline" label="Time" value={formatTime(slot.time)} />
                    <Line
                      icon="medkit-outline"
                      label="Visit for"
                      value={disease === 'Other' ? otherText.trim() : disease}
                    />
                  </View>

                  <Text style={styles.section}>Fee details</Text>
                  <FeeTable fee={doctor.fee} />

                  <Text style={styles.note}>
                    Demo payment: no real money is charged. Your appointment is booked as soon as you pay.
                  </Text>
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </ScrollView>
                <Footer
                  label={`Pay ${money(feeBreakup(doctor.fee).total)} & Book Appointment`}
                  onPress={pay}
                  busy={paying}
                />
              </>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function DoctorRow({ doctor }) {
  return (
    <View style={styles.doctorRow}>
      {doctor.photo ? (
        <Image source={{ uri: doctor.photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Ionicons name="person" size={28} color={colors.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.doctorName}>{doctor.name}</Text>
        <Text style={styles.doctorSub}>{doctor.specialty}</Text>
        <Text style={styles.muted}>{doctor.experienceYears} yrs experience</Text>
      </View>
    </View>
  );
}

function Line({ icon, label, value }) {
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function FeeTable({ fee }) {
  const b = feeBreakup(fee);
  return (
    <View style={styles.card}>
      <Fee label="Consultation fee" value={money(b.consultation)} />
      <Fee label="Platform fee" value={money(b.platform)} />
      <Fee label={`GST (${GST_RATE * 100}%)`} value={money(b.gst)} />
      <View style={styles.feeDivider} />
      <Fee label="Total amount" value={money(b.total)} bold />
    </View>
  );
}

function Fee({ label, value, bold }) {
  return (
    <View style={styles.fee}>
      <Text style={[styles.feeLabel, bold && styles.feeBold]}>{label}</Text>
      <Text style={[styles.feeValue, bold && styles.feeBold]}>{value}</Text>
    </View>
  );
}

function Footer({ label, onPress, busy }) {
  return (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.button, busy && styles.buttonOff]} onPress={onPress} disabled={busy}>
        {busy ? (
          <View style={styles.pillRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Processing payment...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>{label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// Green tick page, like a UPI "payment done" screen.
function Success({ doctor, date, slot, result, onDone }) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [scale, fade]);

  return (
    <View style={styles.successRoot}>
      <View style={styles.successTop}>
        <Animated.View style={[styles.tickOuter, { transform: [{ scale }] }]}>
          <View style={styles.tickInner}>
            <Ionicons name="checkmark" size={64} color="#fff" />
          </View>
        </Animated.View>
        <Animated.View style={[styles.center, { opacity: fade }]}>
          <Text style={styles.successTitle}>Appointment Booked!</Text>
          <Text style={styles.successSub}>Your appointment has been successfully booked</Text>
          <Text style={styles.paid}>{money(result.total)} paid</Text>

          <View style={[styles.card, styles.successCard]}>
            <Line icon="person-outline" label="Doctor" value={doctor.name} />
            <Line icon="calendar-outline" label="Date" value={longDate(date)} />
            <Line icon="time-outline" label="Time" value={formatTime(slot.time)} />
            <Line icon="medkit-outline" label="Visit for" value={result.reason} />
            {result.id ? <Line icon="receipt-outline" label="Booking ID" value={`CN${String(result.id).padStart(5, '0')}`} /> : null}
          </View>
        </Animated.View>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  barTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  hint: { color: colors.textMuted, marginBottom: 12 },
  gap: { marginVertical: 20 },
  muted: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, marginTop: 12 },
  center: { alignItems: 'center', width: '100%' },

  doctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  doctorName: { fontSize: 17, fontWeight: '700', color: colors.text },
  doctorSub: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 2 },

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
  dayOff: { opacity: 0.35 },
  dayWeek: { fontSize: 12, color: colors.textMuted },
  dayNum: { fontSize: 18, fontWeight: '700', color: colors.text, marginVertical: 2 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  onActive: { color: '#fff' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 70,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    textAlignVertical: 'top',
  },

  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineLabel: { fontSize: 13, color: colors.textMuted, width: 70 },
  lineValue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right' },
  fee: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: 14, color: colors.textMuted },
  feeValue: { fontSize: 14, color: colors.text, fontWeight: '600' },
  feeBold: { fontSize: 16, fontWeight: '800', color: colors.text },
  feeDivider: { height: 1, backgroundColor: colors.border },
  note: { marginTop: 16, fontSize: 12, color: colors.textMuted, lineHeight: 18 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  button: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonOff: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  successRoot: { flex: 1, backgroundColor: colors.background },
  successTop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  tickOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#D6F3DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  tickInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: SUCCESS_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: SUCCESS_GREEN },
  successSub: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  paid: { fontSize: 30, fontWeight: '800', color: colors.text, marginTop: 16 },
  successCard: { width: '100%', marginTop: 24 },
});
