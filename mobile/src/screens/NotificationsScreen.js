// Notifications tab (the bell on the Home header). Shows everything the clinic has sent this
// patient: the welcome message, booking confirmations and receipts, appointment reminders,
// reschedules, completions and refunds. Unread rows are tinted and carry a dot.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../i18n';
import { colors } from '../theme/colors';
import {
  deleteNotification,
  getNotifications,
  getToken,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';

// icon + tint per notification type (same types the backend sends - see config/notifications.js)
const LOOKS = {
  welcome: { icon: 'hand-left', tone: 'brand' },
  booking_confirmed: { icon: 'checkmark-circle', tone: 'brand' },
  payment_failed: { icon: 'alert-circle', tone: 'danger' },
  reminder_1day: { icon: 'calendar', tone: 'brand' },
  reminder_1hour: { icon: 'alarm', tone: 'warn' },
  reminder_30min: { icon: 'alarm', tone: 'warn' },
  reminder_10min: { icon: 'alarm', tone: 'danger' },
  appointment_confirmed: { icon: 'checkmark-circle', tone: 'brand' },
  appointment_rescheduled: { icon: 'swap-horizontal', tone: 'warn' },
  appointment_completed: { icon: 'ribbon', tone: 'brand' },
  appointment_cancelled: { icon: 'close-circle', tone: 'danger' },
  refund_processed: { icon: 'cash', tone: 'brand' },
  password_changed: { icon: 'lock-closed', tone: 'brand' },
};

const TONES = {
  brand: { color: colors.primary, background: colors.primaryLight },
  warn: { color: '#B45309', background: '#FEF3C7' },
  danger: { color: colors.danger, background: '#FDECEC' },
};

// "just now" / "5m ago" / "3h ago" / "2d ago" / "12 Oct"
function timeAgo(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function Row({ item, onPress, onLongPress }) {
  const look = LOOKS[item.type] || { icon: 'notifications', tone: 'brand' };
  const tone = TONES[look.tone];
  const unread = !item.readAt;

  return (
    <TouchableOpacity
      style={[styles.row, unread && styles.rowUnread]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: tone.background }]}>
        <Ionicons name={look.icon} size={20} color={tone.color} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowBody}>{item.body}</Text>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

// onUnreadChange = called with the new unread count so the bell badge stays in step
export default function NotificationsScreen({ onBack, onUnreadChange = () => {} }) {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // keeps the screen and the bell badge on the same number
  const apply = useCallback(
    (count) => {
      setUnread(count);
      onUnreadChange(count);
    },
    [onUnreadChange]
  );

  const applyData = useCallback(
    (data) => {
      setItems(data.notifications);
      apply(data.unread);
      setError('');
    },
    [apply]
  );

  const fetchAll = async () => getNotifications(await getToken());

  // first load; `alive` stops a late reply from setting state after the screen has closed
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchAll();
        if (alive) applyData(data);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyData]);

  // used by pull-to-refresh and the Try Again button
  const refresh = async () => {
    setRefreshing(true);
    try {
      applyData(await fetchAll());
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  // silent re-read after a failed write, so the list goes back to what the server actually has
  const reload = () => {
    fetchAll().then(applyData).catch(() => {});
  };

  // Tapping an unread row marks it read. The row is updated straight away so the list never feels
  // slow; if the request fails the next refresh puts it back.
  const open = async (item) => {
    if (item.readAt) return;
    setItems((list) => list.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
    apply(Math.max(0, unread - 1));
    try {
      const data = await markNotificationRead(await getToken(), item.id);
      apply(data.unread);
    } catch {
      reload();
    }
  };

  const readAll = async () => {
    if (!unread) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    apply(0);
    try {
      await markAllNotificationsRead(await getToken());
    } catch {
      reload();
    }
  };

  const remove = (item) =>
    Alert.alert(t('deleteNotification'), item.title, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const previous = items;
          setItems((list) => list.filter((n) => n.id !== item.id));
          if (!item.readAt) apply(Math.max(0, unread - 1));
          try {
            const data = await deleteNotification(await getToken(), item.id);
            apply(data.unread);
          } catch (err) {
            setItems(previous); // put it back - the server still has it
            Alert.alert(t('notifications'), err.message);
          }
        },
      },
    ]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('notifications')}</Text>
          <Text style={styles.subtitle}>
            {unread ? `${unread} ${t('unread')}` : t('notificationsSub')}
          </Text>
        </View>
        {unread ? (
          <TouchableOpacity onPress={readAll} hitSlop={8}>
            <Text style={styles.readAll}>{t('markAllRead')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Row item={item} onPress={() => open(item)} onLongPress={() => remove(item)} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={34} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{error ? t('couldNotLoad') : t('noNotifications')}</Text>
              <Text style={styles.emptyText}>{error || t('noNotificationsSub')}</Text>
              {error ? (
                <TouchableOpacity style={styles.retry} onPress={refresh} activeOpacity={0.85}>
                  <Text style={styles.retryText}>{t('tryAgain')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListFooterComponent={items.length ? <Text style={styles.hint}>{t('longPressDelete')}</Text> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  back: { marginLeft: -6 },
  headerText: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  readAll: { fontSize: 13, fontWeight: '700', color: colors.primary },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  rowUnread: { backgroundColor: '#F6FCF8', borderColor: '#CDEBD9' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  rowTitleUnread: { color: colors.primaryDark },
  rowTime: { fontSize: 11, color: colors.textMuted },
  rowBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: 3 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },

  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  retry: {
    marginTop: 16,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
});
