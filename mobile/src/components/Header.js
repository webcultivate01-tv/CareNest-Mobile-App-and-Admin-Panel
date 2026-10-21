// Top of the Home screen: app logo + name on the left, bell icon on the right.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// onBellPress  = function we call when the bell is tapped (optional)
// unreadCount  = how many unread notifications there are; 0 hides the badge
export default function Header({ onBellPress, unreadCount = 0 }) {
  return (
    <View style={styles.row}>
      {/* Left side: logo and app name */}
      <View style={styles.brand}>
        <View style={styles.logo}>
          <MaterialCommunityIcons name="home-heart" size={30} color="#fff" />
        </View>
        <View>
          <Text style={styles.name}>
            Care<Text style={styles.nameAccent}>Nest</Text>
          </Text>
          <Text style={styles.tagline}>Your health, our priority</Text>
        </View>
      </View>

      {/* Right side: bell with the number of unread notifications on it */}
      <TouchableOpacity
        onPress={onBellPress}
        style={styles.bell}
        accessibilityLabel={
          unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
        }
      >
        <Ionicons name="notifications-outline" size={28} color={colors.text} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  nameAccent: {
    color: colors.primary,
  },
  tagline: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -2,
  },
  bell: {
    padding: 6,
  },
  // The unread count sits on top of the bell (position: 'absolute')
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
