// Small CareNest logo + name shown above the white form card on the auth screens.
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function AuthBrand() {
  return (
    <View style={styles.row}>
      <View style={styles.logo}>
        <MaterialCommunityIcons name="home-heart" size={22} color="#fff" />
      </View>
      <View>
        <Text style={styles.brand}>
          Care<Text style={styles.accent}>Nest</Text>
        </Text>
        <Text style={styles.clinic}>CITY CARE CLINIC</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#1F2A44', letterSpacing: -0.5 },
  accent: { color: colors.primary },
  clinic: { fontSize: 8, letterSpacing: 2, color: colors.textMuted, marginTop: -2 },
});
