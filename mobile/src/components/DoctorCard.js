// One doctor card: photo, name, rating, availability and working hours.
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// doctor  = one object from the doctors list in homeData.js
// onPress = function we call when the card is tapped
export default function DoctorCard({ doctor, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Top part: photo + name + specialty + rating */}
      <View style={styles.top}>
        <Image source={{ uri: doctor.avatar }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{doctor.name}</Text>
          <Text style={styles.specialty}>{doctor.specialty}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={15} color={colors.star} />
            <Text style={styles.rating}>{doctor.rating}</Text>
            <Text style={styles.reviews}>({doctor.reviews} reviews)</Text>
          </View>
        </View>
      </View>

      {/* Thin line between the two parts */}
      <View style={styles.divider} />

      {/* Bottom part: availability badge + working hours */}
      <View style={styles.bottom}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>{doctor.availability}</Text>
        </View>
        <View style={styles.hoursRow}>
          <Ionicons name="time-outline" size={15} color={colors.textMuted} />
          <Text style={styles.hours}>{doctor.hours}</Text>
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
