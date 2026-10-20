// One card inside "Quick Access" (icon, arrow, title and small text).
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// item    = one object from the quickAccess list in homeData.js
// onPress = function we call when the card is tapped
export default function QuickAccessCard({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.top}>
        <View style={[styles.iconBox, { backgroundColor: item.bg }]}>
          <Ionicons name={item.icon} size={26} color={item.color} />
        </View>
        <View style={[styles.arrowBox, { backgroundColor: item.bg }]}>
          <Ionicons name="arrow-forward" size={16} color={item.color} />
        </View>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // width 48.5% makes 2 cards fit in one row
  card: {
    width: '48.5%',
    minHeight: 130,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    // shadow (iOS uses shadow..., Android uses elevation)
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
    lineHeight: 18,
  },
});
