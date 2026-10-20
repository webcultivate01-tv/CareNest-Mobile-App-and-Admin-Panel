// "Health Records": prescriptions and reports. Nothing is stored yet, so it shows an empty state.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function HealthRecordsScreen({ onBack }) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Health Records</Text>
      </View>
      <View style={styles.empty}>
        <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
        <Text style={styles.muted}>No prescriptions or reports yet.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', gap: 8, marginTop: 80 },
  muted: { fontSize: 13, color: colors.textMuted },
});
