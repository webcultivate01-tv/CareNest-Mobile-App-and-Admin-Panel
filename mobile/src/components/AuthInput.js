// One labelled text box used in the auth forms.
// If `secure` is true, it shows an eye button to show / hide the password.
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function AuthInput({ label, icon, error, secure, ...inputProps }) {
  // true = password is hidden (dots), false = password is visible
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, error && styles.boxError]}>
        <Ionicons name={icon} size={20} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={secure && hidden}
          autoCapitalize="none"
          {...inputProps}
        />
        {secure && (
          <TouchableOpacity
            onPress={() => setHidden(!hidden)}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={8}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: '#fff',
  },
  boxError: { borderColor: colors.danger },
  input: { flex: 1, fontSize: 14, color: colors.text },
  error: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
