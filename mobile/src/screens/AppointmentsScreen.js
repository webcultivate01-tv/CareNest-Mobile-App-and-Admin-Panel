// "My Appointments": every appointment the signed-in user has booked, newest first.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { getMyAppointments, getToken } from '../api';

const statusColors = {
  pending: { bg: '#FEF3C7', text: '#B45309' },
  confirmed: { bg: colors.primaryLight, text: colors.primary },
  completed: { bg: '#E5E7EB', text: '#374151' },
  cancelled: { bg: '#FEE2E2', text: colors.danger },
};

const formatWhen = (iso) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
};

function AppointmentCard({ item }) {
  const when = formatWhen(item.scheduledAt);
  const status = statusColors[item.status] || statusColors.pending;
  return (
    <View style={styles.card}>
      {item.doctorPhoto ? (
        <Image source={{ uri: item.doctorPhoto }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Ionicons name="person" size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.doctorName}</Text>
        <Text style={styles.muted}>{item.doctorSpecialty}</Text>
        <Text style={styles.when}>{when.date} · {when.time}</Text>
        {item.notes ? <Text style={styles.muted} numberOfLines={2}>{item.notes}</Text> : null}
      </View>
      <View style={[styles.badge, { backgroundColor: status.bg }]}>
        <Text style={[styles.badgeText, { color: status.text }]}>{item.status}</Text>
      </View>
    </View>
  );
}

// refreshKey changes when the user opens the tab, so the list is always fresh
export default function AppointmentsScreen({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await getMyAppointments(await getToken()));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>My Appointments</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.center} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => String(a.id)}
          renderItem={({ item }) => <AppointmentCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={styles.muted}>{error || 'You have no appointments yet.'}</Text>
              {error ? (
                <TouchableOpacity onPress={load}>
                  <Text style={styles.retry}>Try again</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, paddingHorizontal: 16, paddingVertical: 14 },
  center: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, flexGrow: 1 },
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
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarEmpty: { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  when: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 2 },
  muted: { fontSize: 13, color: colors.textMuted },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  empty: { alignItems: 'center', gap: 8, marginTop: 80 },
  retry: { color: colors.primary, fontWeight: '600' },
});
