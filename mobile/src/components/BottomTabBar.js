// The bar at the bottom of the screen with 4 tab buttons.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { tabs } from '../data/homeData';

// activeTab = name of the selected tab (example: 'Home')
// onChange  = function we call when the user taps a tab
export default function BottomTabBar({ activeTab, onChange }) {
  // insets gives the space used by the phone's bottom edge (home bar)
  const insets = useSafeAreaInsets();
  const bottomSpace = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.bar, { paddingBottom: bottomSpace }]}>
      {tabs.map((tab) => {
        const isActive = tab.name === activeTab;
        const iconName = isActive ? tab.activeIcon : tab.icon;
        const color = isActive ? colors.primary : colors.textMuted;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onChange(tab.name)}
          >
            <Ionicons name={iconName} size={26} color={color} />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
