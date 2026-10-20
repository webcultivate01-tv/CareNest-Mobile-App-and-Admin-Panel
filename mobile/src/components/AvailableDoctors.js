// The "Available Doctors" section: one card for each doctor.
import { View } from 'react-native';
import DoctorCard from './DoctorCard';
import SectionHeader from './SectionHeader';
import { doctors } from '../data/homeData';

// onDoctorPress = function we call with the tapped doctor (optional)
export default function AvailableDoctors({ onDoctorPress = () => {} }) {
  return (
    <View>
      <SectionHeader title="Available Doctors" />
      {doctors.map((doctor) => (
        <DoctorCard
          key={doctor.id}
          doctor={doctor}
          onPress={() => onDoctorPress(doctor)}
        />
      ))}
    </View>
  );
}
