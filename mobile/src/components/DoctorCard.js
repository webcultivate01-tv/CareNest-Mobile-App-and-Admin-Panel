// One doctor card: photo, name, specialty, experience, fee, today's availability and hours.
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// "09:00" -> "9:00 AM"
export const formatTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// today's working hours from the weekly shifts, e.g. "9:00 AM - 5:00 PM" (null = day off)
export const todayHours = (schedule = []) => {
  const shifts = schedule.filter((r) => r.weekday === new Date().getDay());
  if (!shifts.length) return null;
  const starts = shifts.map((s) => s.start).sort();
  const ends = shifts.map((s) => s.end).sort();
  return `${formatTime(starts[0])} - ${formatTime(ends[ends.length - 1])}`;
};

// doctor  = one doctor from GET /api/user/doctors
// onPress = function we call when the card is tapped
export default function DoctorCard({ doctor, onPress }) {
  const hours = todayHours(doctor.schedule);
  const free = doctor.freeToday > 0;
  // today is over / full but a later day is open: still show the doctor as available
  const upcoming = !free && !!doctor.nextFreeDate;
  const badgeText = free
    ? `${doctor.freeToday} slots today`
    : upcoming
      ? `Next: ${new Date(`${doctor.nextFreeDate}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}`
      : 'No slots available';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.top}>
        {doctor.photo ? (
          <Image source={{ uri: doctor.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="person" size={30} color={colors.primary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{doctor.name}</Text>
          <Text style={styles.specialty}>{doctor.specialty}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
            <Text style={styles.reviews}>{doctor.experienceYears} yrs experience</Text>
            <Text style={styles.rating}>  ₹{doctor.fee}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>

      <View style={styles.divider} />

      <View style={styles.bottom}>
        <View style={[styles.badge, !free && !upcoming && styles.badgeOff]}>
          <View style={[styles.badgeDot, !free && !upcoming && styles.badgeDotOff]} />
          <Text style={[styles.badgeText, !free && !upcoming && styles.badgeTextOff]}>{badgeText}</Text>
        </View>
        <View style={styles.hoursRow}>
          <Ionicons name="time-outline" size={15} color={colors.textMuted} />
          <Text style={styles.hours}>{hours || 'Day off'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    // shadow (iOS uses shadow..., Android uses elevation)
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOff: {
    backgroundColor: '#F3F4F6',
  },
  badgeDotOff: {
    backgroundColor: colors.textMuted,
  },
  badgeTextOff: {
    color: colors.textMuted,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  specialty: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  reviews: {
    fontSize: 12,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hours: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
