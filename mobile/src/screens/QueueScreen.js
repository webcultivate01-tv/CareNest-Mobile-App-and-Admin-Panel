// "Live Queue": today's upcoming appointments of the signed-in user. Empty when there is nothing today.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { getMyAppointments, getToken } from '../api';

const REFRESH_MS = 15000;
const sameDay = (a, b) => a.toDateString() === b.toDateString();

export default function QueueScreen({ refreshKey }) {
  const [items, setItems] = useState(null); // null = first load
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await getMyAppointments(await getToken());
      const today = new Date();
      setItems(
        all
          .filter((a) => ['pending', 'confirmed'].includes(a.status) && sameDay(new Date(a.scheduledAt), today))
          .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      );
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Live Queue</Text>
      {items === null && !error ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.gap} />
      ) : items && items.length > 0 ? (
        <View style={styles.list}>
          {items.map((a, i) => (
            <View key={a.id} style={styles.card}>
              <View style={styles.position}>
                <Text style={styles.positionText}>{i + 1}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{a.doctorName}</Text>
                <Text style={styles.muted}>{a.doctorSpecialty}</Text>
                <Text style={styles.time}>
                  {new Date(a.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Text style={styles.muted}>{error || 'No live queue right now.'}</Text>
          {error ? (
            <TouchableOpacity onPress={load}>
              <Text style={styles.retry}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingVertical: 14 },
  gap: { marginTop: 40 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  position: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  time: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 2 },
  muted: { fontSize: 13, color: colors.textMuted },
  empty: { alignItems: 'center', gap: 8, marginTop: 80 },
  retry: { color: colors.primary, fontWeight: '600' },
});
