// The Home screen. It is a scrollable page made of 4 smaller parts.
import { ScrollView, StyleSheet } from 'react-native';
import Header from '../components/Header';
import HeroBanner from '../components/HeroBanner';
import QuickAccess from '../components/QuickAccess';
import AvailableDoctors from '../components/AvailableDoctors';

export default function HomeScreen({ userName = 'Tejas' }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header />
      <HeroBanner name={userName} />
      <QuickAccess />
      <AvailableDoctors />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
