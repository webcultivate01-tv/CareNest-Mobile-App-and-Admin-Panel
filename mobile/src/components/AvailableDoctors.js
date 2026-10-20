// The "Available Doctors" section: live list from the server. Tap a doctor to open the booking form.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import DoctorCard from './DoctorCard';
import SectionHeader from './SectionHeader';
import { colors } from '../theme/colors';
import { getDoctors, getToken } from '../api';

const REFRESH_MS = 30000; // pick up admin changes (new doctor, leave, status) without a restart

// onSelectDoctor = open the booking flow for a doctor; reloadKey = change it to reload the list
export default function AvailableDoctors({ onSelectDoctor = () => {}, reloadKey = 0 }) {
  const [doctors, setDoctors] = useState(null); // null = first load
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDoctors(await getDoctors(await getToken()));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, reloadKey]);

  return (
    <View>
      <SectionHeader title="Available Doctors" onSeeAll={load} />
      {doctors === null && !error && <ActivityIndicator color={colors.primary} style={styles.gap} />}
      {error && doctors === null ? <Text style={styles.message}>{error}</Text> : null}
      {doctors && doctors.length === 0 && <Text style={styles.message}>No doctors are available right now.</Text>}
      {doctors?.map((doctor) => (
        <DoctorCard key={doctor.id} doctor={doctor} onPress={() => onSelectDoctor(doctor)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginVertical: 24 },
  message: { textAlign: 'center', color: colors.textMuted, marginVertical: 24 },
});
