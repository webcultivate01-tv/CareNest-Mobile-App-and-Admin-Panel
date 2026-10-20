// Tiny translation helper. The chosen language is saved on the phone and shared with
// every screen through LanguageProvider. Use `const { t } = useLanguage()` then t('key').
import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const LANG_KEY = 'carenest_language';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
];

const strings = {
  en: {
    profile: 'Profile',
    patient: 'Patient',
    editProfile: 'Edit Profile',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'Edit',
    removePhoto: 'Remove photo',
    personalInfo: 'Personal Information',
    mobileNumber: 'Mobile Number',
    dob: 'Date of Birth',
    email: 'Email Address',
    accountSettings: 'Account Settings',
    notifications: 'Notifications',
    notificationsSub: 'Appointment reminders and updates',
    security: 'Security & Privacy',
    securitySub: 'Change password, manage data',
    supportInfo: 'Support & Information',
    help: 'Help & Support',
    helpSub: 'Get help or contact the clinic',
    terms: 'Terms & Privacy Policy',
    termsSub: 'Read our terms and privacy policy',
    deleteAccount: 'Delete Account',
    deleteAccountSub: 'Permanently delete your account',
    logout: 'Log Out',
    language: 'Language',
    languageSub: 'Change the app language',
    menu: 'Menu',
    about: 'About CareNest',
    aboutSub: 'App version 1.0.0',
    comingSoon: 'This feature is coming soon.',
  },
  hi: {
    profile: 'प्रोफ़ाइल',
    patient: 'मरीज़',
    editProfile: 'प्रोफ़ाइल बदलें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    edit: 'बदलें',
    removePhoto: 'फ़ोटो हटाएँ',
    personalInfo: 'व्यक्तिगत जानकारी',
    mobileNumber: 'मोबाइल नंबर',
    dob: 'जन्म तिथि',
    email: 'ईमेल पता',
    accountSettings: 'खाता सेटिंग्स',
    notifications: 'सूचनाएँ',
    notificationsSub: 'अपॉइंटमेंट रिमाइंडर और अपडेट',
    security: 'सुरक्षा और गोपनीयता',
    securitySub: 'पासवर्ड बदलें, डेटा प्रबंधित करें',
    supportInfo: 'सहायता और जानकारी',
    help: 'सहायता',
    helpSub: 'मदद पाएँ या क्लिनिक से संपर्क करें',
    terms: 'नियम और गोपनीयता नीति',
    termsSub: 'हमारे नियम और गोपनीयता नीति पढ़ें',
    deleteAccount: 'खाता हटाएँ',
    deleteAccountSub: 'अपना खाता स्थायी रूप से हटाएँ',
    logout: 'लॉग आउट',
    language: 'भाषा',
    languageSub: 'ऐप की भाषा बदलें',
    menu: 'मेनू',
    about: 'CareNest के बारे में',
    aboutSub: 'ऐप संस्करण 1.0.0',
    comingSoon: 'यह सुविधा जल्द आ रही है।',
  },
  kn: {
    profile: 'ಪ್ರೊಫೈಲ್',
    patient: 'ರೋಗಿ',
    editProfile: 'ಪ್ರೊಫೈಲ್ ಸಂಪಾದಿಸಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    save: 'ಉಳಿಸಿ',
    edit: 'ಸಂಪಾದಿಸಿ',
    removePhoto: 'ಫೋಟೋ ತೆಗೆಯಿರಿ',
    personalInfo: 'ವೈಯಕ್ತಿಕ ಮಾಹಿತಿ',
    mobileNumber: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ',
    dob: 'ಹುಟ್ಟಿದ ದಿನಾಂಕ',
    email: 'ಇಮೇಲ್ ವಿಳಾಸ',
    accountSettings: 'ಖಾತೆ ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    notifications: 'ಅಧಿಸೂಚನೆಗಳು',
    notificationsSub: 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಜ್ಞಾಪನೆಗಳು ಮತ್ತು ಅಪ್‌ಡೇಟ್‌ಗಳು',
    security: 'ಭದ್ರತೆ ಮತ್ತು ಗೌಪ್ಯತೆ',
    securitySub: 'ಪಾಸ್‌ವರ್ಡ್ ಬದಲಾಯಿಸಿ, ಡೇಟಾ ನಿರ್ವಹಿಸಿ',
    supportInfo: 'ಬೆಂಬಲ ಮತ್ತು ಮಾಹಿತಿ',
    help: 'ಸಹಾಯ ಮತ್ತು ಬೆಂಬಲ',
    helpSub: 'ಸಹಾಯ ಪಡೆಯಿರಿ ಅಥವಾ ಕ್ಲಿನಿಕ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ',
    terms: 'ನಿಯಮಗಳು ಮತ್ತು ಗೌಪ್ಯತಾ ನೀತಿ',
    termsSub: 'ನಮ್ಮ ನಿಯಮಗಳು ಮತ್ತು ಗೌಪ್ಯತಾ ನೀತಿಯನ್ನು ಓದಿ',
    deleteAccount: 'ಖಾತೆ ಅಳಿಸಿ',
    deleteAccountSub: 'ನಿಮ್ಮ ಖಾತೆಯನ್ನು ಶಾಶ್ವತವಾಗಿ ಅಳಿಸಿ',
    logout: 'ಲಾಗ್ ಔಟ್',
    language: 'ಭಾಷೆ',
    languageSub: 'ಆ್ಯಪ್ ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ',
    menu: 'ಮೆನು',
    about: 'CareNest ಬಗ್ಗೆ',
    aboutSub: 'ಆ್ಯಪ್ ಆವೃತ್ತಿ 1.0.0',
    comingSoon: 'ಈ ಸೌಲಭ್ಯ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ.',
  },
};

const LanguageContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => strings.en[k] || k });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    SecureStore.getItemAsync(LANG_KEY)
      .then((saved) => saved && strings[saved] && setLangState(saved))
      .catch(() => {});
  }, []);

  const setLang = (code) => {
    setLangState(code);
    SecureStore.setItemAsync(LANG_KEY, code).catch(() => {});
  };

  const t = (key) => strings[lang][key] || strings.en[key] || key;

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
