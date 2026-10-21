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
    unread: 'unread',
    markAllRead: 'Mark all read',
    noNotifications: 'No notifications yet',
    noNotificationsSub: 'Booking confirmations, payment receipts and appointment reminders will appear here.',
    couldNotLoad: 'Could not load notifications',
    tryAgain: 'Try Again',
    longPressDelete: 'Press and hold a notification to delete it',
    deleteNotification: 'Delete notification',
    delete: 'Delete',
    close: 'Close',
    changePassword: 'Change Password',
    changePasswordSub: 'Enter your current password, then choose a new one of at least 8 characters.',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    enterCurrentPassword: 'Enter your current password',
    passwordMin: 'Password must be at least 8 characters',
    passwordsDoNotMatch: 'Passwords do not match',
    passwordMustDiffer: 'Choose a password different from your current one',
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
    unread: 'अपठित',
    markAllRead: 'सभी पढ़ा हुआ करें',
    noNotifications: 'अभी कोई सूचना नहीं',
    noNotificationsSub: 'बुकिंग पुष्टि, भुगतान रसीद और अपॉइंटमेंट रिमाइंडर यहाँ दिखेंगे।',
    couldNotLoad: 'सूचनाएँ लोड नहीं हो सकीं',
    tryAgain: 'पुन: प्रयास करें',
    longPressDelete: 'सूचना हटाने के लिए उसे दबाकर रखें',
    deleteNotification: 'सूचना हटाएँ',
    delete: 'हटाएँ',
    close: 'बंद करें',
    changePassword: 'पासवर्ड बदलें',
    changePasswordSub: 'अपना वर्तमान पासवर्ड डालें, फिर कम से कम 8 अक्षरों का नया पासवर्ड चुनें।',
    currentPassword: 'वर्तमान पासवर्ड',
    newPassword: 'नया पासवर्ड',
    confirmNewPassword: 'नया पासवर्ड दोहराएँ',
    enterCurrentPassword: 'अपना वर्तमान पासवर्ड डालें',
    passwordMin: 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए',
    passwordsDoNotMatch: 'पासवर्ड मेल नहीं खाते',
    passwordMustDiffer: 'वर्तमान पासवर्ड से अलग पासवर्ड चुनें',
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
    unread: 'ಓದಿಲ್ಲ',
    markAllRead: 'ಎಲ್ಲವನ್ನೂ ಓದಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ',
    noNotifications: 'ಇನ್ನೂ ಯಾವುದೇ ಅಧಿಸೂಚನೆ ಇಲ್ಲ',
    noNotificationsSub: 'ಬುಕಿಂಗ್ ದೃಢೀಕರಣ, ಪಾವತಿ ರಸೀದಿ ಮತ್ತು ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಜ್ಞಾಪನೆಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.',
    couldNotLoad: 'ಅಧಿಸೂಚನೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಿಲ್ಲ',
    tryAgain: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    longPressDelete: 'ಅಧಿಸೂಚನೆಯನ್ನು ಅಳಿಸಲು ಅದನ್ನು ಒತ್ತಿ ಹಿಡಿಯಿರಿ',
    deleteNotification: 'ಅಧಿಸೂಚನೆ ಅಳಿಸಿ',
    delete: 'ಅಳಿಸಿ',
    close: 'ಮುಚ್ಚಿ',
    changePassword: 'ಪಾಸ್‌ವರ್ಡ್ ಬದಲಾಯಿಸಿ',
    changePasswordSub: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ, ನಂತರ ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳ ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ಆಯ್ಕೆಮಾಡಿ.',
    currentPassword: 'ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್',
    newPassword: 'ಹೊಸ ಪಾಸ್‌ವರ್ಡ್',
    confirmNewPassword: 'ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ದೃಢೀಕರಿಸಿ',
    enterCurrentPassword: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ',
    passwordMin: 'ಪಾಸ್‌ವರ್ಡ್ ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳಿರಬೇಕು',
    passwordsDoNotMatch: 'ಪಾಸ್‌ವರ್ಡ್‌ಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ',
    passwordMustDiffer: 'ಪ್ರಸ್ತುತ ಪಾಸ್‌ವರ್ಡ್‌ಗಿಂತ ಭಿನ್ನವಾದ ಪಾಸ್‌ವರ್ಡ್ ಆಯ್ಕೆಮಾಡಿ',
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
