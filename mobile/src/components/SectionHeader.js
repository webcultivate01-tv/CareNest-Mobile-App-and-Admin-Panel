// A title for a section, with a "See All" button on the right.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// title    = text shown on the left (example: 'Quick Access')
// onSeeAll = function we call when "See All" is tapped (optional)
export default function SectionHeader({ title, onSeeAll }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity style={styles.seeAll} onPress={onSeeAll}>
        <Text style={styles.seeAllText}>See All</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
