// "Live Queue": where the signed-in user stands in today's doctor queues, refreshed every few seconds.
// Empty when there is nothing today.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { getMyQueue, getToken } from '../api';

const REFRESH_MS = 5000;

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const statusText = (q) => {
  if (q.queueState === 'in_consultation') return "You're with the doctor now";
  if (q.queueState === 'done') return 'Consultation completed';
  if (q.ahead === 0) return "You're next";
  return `${q.ahead} patient${q.ahead === 1 ? '' : 's'} ahead of you`;
};

export default function QueueScreen({ refreshKey }) {
  const [items, setItems] = useState(null); // null = first load
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await getMyQueue(await getToken()));
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
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((q) => {
            const active = q.queueState === 'in_consultation';
            const done = q.queueState === 'done';
            return (
              <View key={q.appointmentId} style={[styles.card, active && styles.cardActive]}>
                <View style={styles.top}>
                  <View style={styles.info}>
                    <Text style={styles.name}>{q.doctorName}</Text>
                    <Text style={styles.muted}>
                      {q.doctorSpecialty} · {timeOf(q.scheduledAt)}
                    </Text>
                  </View>
                  <View style={styles.token}>
                    <Text style={styles.tokenLabel}>TOKEN</Text>
                    <Text style={styles.tokenNumber}>{q.token}</Text>
                  </View>
                </View>
                <Text style={[styles.status, done && styles.muted, active && styles.statusActive]}>{statusText(q)}</Text>
                {!done && !active ? (
                  <Text style={styles.muted}>
                    Now serving: {q.nowServingToken ? `Token ${q.nowServingToken}` : 'not started yet'}
                    {q.ahead > 0 && q.waitMinutes > 0 ? ` · about ${q.waitMinutes} min wait` : ''}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
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
    gap: 6,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  token: {
    minWidth: 60,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  tokenLabel: { fontSize: 10, fontWeight: '700', color: colors.primary },
  tokenNumber: { fontSize: 22, fontWeight: '700', color: colors.primary },
  status: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 4 },
  statusActive: { color: colors.primaryDark },
  muted: { fontSize: 13, color: colors.textMuted },
  empty: { alignItems: 'center', gap: 8, marginTop: 80 },
  retry: { color: colors.primary, fontWeight: '600' },
});
