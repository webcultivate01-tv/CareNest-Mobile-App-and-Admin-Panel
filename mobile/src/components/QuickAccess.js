// The "Quick Access" section: a grid of cards (2 per row).
import { StyleSheet, View } from 'react-native';
import QuickAccessCard from './QuickAccessCard';
import SectionHeader from './SectionHeader';
import { quickAccess } from '../data/homeData';

// onItemPress = function we call with the tapped card (optional)
export default function QuickAccess({ onItemPress = () => {} }) {
  return (
    <View>
      <SectionHeader title="Quick Access" />
      <View style={styles.grid}>
        {quickAccess.map((item) => (
          <QuickAccessCard
            key={item.id}
            item={item}
            onPress={() => onItemPress(item)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // flexWrap moves cards to the next row when the first row is full
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
});
