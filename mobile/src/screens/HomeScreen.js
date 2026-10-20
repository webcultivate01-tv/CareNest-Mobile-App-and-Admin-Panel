// The Home screen. It is a scrollable page made of 4 smaller parts.
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Header from '../components/Header';
import HeroBanner from '../components/HeroBanner';
import QuickAccess from '../components/QuickAccess';
import AvailableDoctors from '../components/AvailableDoctors';

// onNavigate = function we call with 'Appointments', 'Queue' or 'Records' to open that screen
export default function HomeScreen({ userName = 'Tejas', onNavigate = () => {} }) {
  const scrollRef = useRef(null);
  const doctorsY = useRef(0);

  // Booking starts by picking a doctor, so scroll down to the doctor list.
  const scrollToDoctors = () => scrollRef.current?.scrollTo({ y: doctorsY.current, animated: true });

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header />
      <HeroBanner name={userName} onBookPress={scrollToDoctors} />
      <QuickAccess
        onItemPress={(item) => {
          if (item.id === 'book') scrollToDoctors();
          else if (item.id === 'appointments') onNavigate('Appointments');
          else if (item.id === 'queue') onNavigate('Queue');
          else if (item.id === 'records') onNavigate('Records');
        }}
      />
      <View onLayout={(e) => { doctorsY.current = e.nativeEvent.layout.y; }}>
        <AvailableDoctors />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
