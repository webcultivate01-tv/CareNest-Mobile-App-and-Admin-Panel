// The Home screen. It is a scrollable page made of 4 smaller parts.
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Header from '../components/Header';
import HeroBanner from '../components/HeroBanner';
import QuickAccess from '../components/QuickAccess';
import AvailableDoctors from '../components/AvailableDoctors';
import BookingFlow from '../components/BookingFlow';

// onNavigate = function we call with 'Appointments', 'Queue' or 'Records' to open that screen
export default function HomeScreen({ userName = 'Tejas', onNavigate = () => {} }) {
  // booking = null (closed) or { doctor } (doctor = null means "pick a doctor first")
  const [booking, setBooking] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const openBooking = (doctor = null) => setBooking({ doctor });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Header />
      <HeroBanner name={userName} onBookPress={() => openBooking()} />
      <QuickAccess
        onItemPress={(item) => {
          if (item.id === 'book') openBooking();
          else if (item.id === 'appointments') onNavigate('Appointments');
          else if (item.id === 'queue') onNavigate('Queue');
          else if (item.id === 'records') onNavigate('Records');
        }}
      />
      <AvailableDoctors onSelectDoctor={openBooking} reloadKey={reloadKey} />
      <BookingFlow
        visible={!!booking}
        startDoctor={booking?.doctor}
        onClose={() => setBooking(null)}
        onBooked={() => setReloadKey((k) => k + 1)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
