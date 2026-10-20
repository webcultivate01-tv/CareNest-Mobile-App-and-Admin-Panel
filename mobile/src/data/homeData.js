// Fake data for the Home screen.
// Later this can come from a server (API). For now it is just plain lists.

// The 4 cards shown in the "Quick Access" section.
// color = icon color, bg = light background color behind the icon.
export const quickAccess = [
  {
    id: 'find',
    title: 'Find a Doctor',
    subtitle: 'Search our doctors',
    icon: 'search',
    color: '#1E9E5A',
    bg: '#DDF3E6',
  },
  {
    id: 'appointments',
    title: 'My Appointments',
    subtitle: 'View & manage',
    icon: 'calendar',
    color: '#2F8FE5',
    bg: '#DFEEFC',
  },
  {
    id: 'queue',
    title: 'Live Queue',
    subtitle: 'Check your position',
    icon: 'people',
    color: '#F59A23',
    bg: '#FDEBD3',
  },
  {
    id: 'records',
    title: 'Health Records',
    subtitle: 'Prescriptions & reports',
    icon: 'document-text',
    color: '#7C3AED',
    bg: '#EBE1FB',
  },
];

// The doctors shown in the "Available Doctors" section.
export const doctors = [
  {
    id: '1',
    name: 'Dr. Priya Sharma',
    specialty: 'General Physician',
    rating: 4.8,
    reviews: 320,
    availability: 'Available Today',
    hours: '10:00 AM - 5:00 PM',
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
  },
  {
    id: '2',
    name: 'Dr. Arjun Mehta',
    specialty: 'Cardiologist',
    rating: 4.9,
    reviews: 210,
    availability: 'Available Today',
    hours: '11:00 AM - 4:00 PM',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
  },
];

// The 4 buttons at the bottom of the screen.
// icon = shown when not selected, activeIcon = shown when selected.
export const tabs = [
  { name: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'Appointments', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'Queue', icon: 'people-outline', activeIcon: 'people' },
  { name: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];
