// The big green welcome card with a greeting, the user's name and a doctor picture.
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// name        = the user's name shown in the greeting
// onBookPress = function we call when "Book Appointment" is tapped (optional)
export default function HeroBanner({ name, onBookPress }) {
  return (
    <View style={styles.card}>
      {/* Light green shape in the background (only decoration) */}
      <View style={styles.leaf} />

      {/* Doctor picture on the right side */}
      <View style={styles.imageWindow}>
        <Image
          source={require('../../assets/docter.png')}
          style={styles.doctorImage}
          resizeMode="stretch"
        />
      </View>

      {/* Text and button on the left side */}
      <View style={styles.content}>
        <Text style={styles.greeting}>Good Morning,</Text>
        <Text style={styles.name}>{name}!</Text>
        <Text style={styles.subtitle}>Take care of your health{'\n'}with CareNest</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={onBookPress}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-outline" size={16} color="#fff" />
          <Text style={styles.buttonText}>Book Appointment</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#E8F6EE',
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    minHeight: 190,
  },
  leaf: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 170,
    height: 220,
    borderRadius: 100,
    backgroundColor: '#CDEBD9',
    opacity: 0.7,
  },
  // The original picture has big white space around the doctor.
  // So we use a small "window" (imageWindow) and move a larger picture
  // inside it (doctorImage) until only the doctor is visible.
  imageWindow: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    width: 120,
    height: 180,
    overflow: 'hidden',
  },
  doctorImage: {
    position: 'absolute',
    width: 329,
    height: 266,
    left: -102,
    top: -59,
  },
  // paddingRight keeps the text away from the doctor picture
  content: {
    alignItems: 'flex-start',
    paddingRight: 118,
  },
  greeting: {
    fontSize: 18,
    color: colors.text,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 6,
    lineHeight: 20,
  },
  button: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 11,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
