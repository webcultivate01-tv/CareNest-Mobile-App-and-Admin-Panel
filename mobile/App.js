// Starting point of the app.
// If the user is not signed in it shows the Login / Sign up / Forgot password screens.
// After that it shows the Home screen and the bottom tab bar.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import QueueScreen from './src/screens/QueueScreen';
import HealthRecordsScreen from './src/screens/HealthRecordsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import BottomTabBar from './src/components/BottomTabBar';
import { colors } from './src/theme/colors';
import { LanguageProvider } from './src/i18n';
import { clearToken, getCurrentUser, getToken, getUnreadCount, saveToken } from './src/api';

// how often the bell badge is refreshed while the app is open
const UNREAD_POLL_MS = 60 * 1000;

export default function App() {
  // Remembers which tab is selected. It starts on 'Home'.
  const [activeTab, setActiveTab] = useState('Home');
  // Which auth screen is open: 'login', 'signup' or 'forgot'. null = signed in.
  const [authScreen, setAuthScreen] = useState('login');

  // Details of the signed-in user (name, mobile, ...). Empty until someone signs in.
  const [user, setUser] = useState({});

  // Unread notifications, shown as a badge on the bell in the Home header.
  const [unread, setUnread] = useState(0);

  // true while we check if the phone already has a saved login.
  const [checking, setChecking] = useState(true);

  const signedIn = authScreen === null;

  // There is no push service yet, so the badge is refreshed by asking the server: when the app
  // opens, every minute while it is in the foreground, and whenever it comes back from the
  // background. A failure here is ignored - a stale badge must never block the app.
  const refreshUnread = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const { unread: count } = await getUnreadCount(token);
      setUnread(count);
    } catch {
      // offline or token expired: leave the badge as it is
    }
  }, []);

  // When the app opens, sign the user in again if a saved token is still valid.
  useEffect(() => {
    const restore = async () => {
      try {
        const token = await getToken();
        if (token) {
          setUser(await getCurrentUser(token));
          setAuthScreen(null);
          refreshUnread();
        }
      } catch {
        await clearToken(); // token expired or invalid
      } finally {
        setChecking(false);
      }
    };
    restore();
  }, [refreshUnread]);

  // Keep the badge fresh while signed in.
  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = setInterval(refreshUnread, UNREAD_POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [signedIn, refreshUnread]);

  // Called by Login / Sign up after the server accepts the user.
  const signIn = async (details, token) => {
    await saveToken(token);
    setUser(details);
    setActiveTab('Home');
    setAuthScreen(null);
    refreshUnread();
  };

  // Forget the user and go back to the login screen.
  const logOut = async () => {
    await clearToken();
    setUser({});
    setUnread(0);
    setAuthScreen('login');
  };

  if (checking) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  let body;
  if (authScreen === 'login') {
    body = (
      <LoginScreen
        onLogin={signIn}
        onGoToSignUp={() => setAuthScreen('signup')}
        onForgotPassword={() => setAuthScreen('forgot')}
      />
    );
  } else if (authScreen === 'signup') {
    body = <SignUpScreen onSignUp={signIn} onGoToLogin={() => setAuthScreen('login')} />;
  } else if (authScreen === 'forgot') {
    body = <ForgotPasswordScreen onBack={() => setAuthScreen('login')} />;
  }

  return (
    <LanguageProvider>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top']}>
        {authScreen ? (
          body
        ) : (
          <>
            <View style={styles.body}>
              {activeTab === 'Profile' ? (
                <ProfileScreen
                  user={user}
                  onUserChange={setUser}
                  onLogout={logOut}
                  onOpenNotifications={() => setActiveTab('Notifications')}
                />
              ) : activeTab === 'Appointments' ? (
                <AppointmentsScreen />
              ) : activeTab === 'Queue' ? (
                <QueueScreen />
              ) : activeTab === 'Records' ? (
                <HealthRecordsScreen onBack={() => setActiveTab('Home')} />
              ) : activeTab === 'Notifications' ? (
                <NotificationsScreen onBack={() => setActiveTab('Home')} onUnreadChange={setUnread} />
              ) : (
                <HomeScreen
                  userName={user.name ? user.name.trim().split(' ')[0] : undefined}
                  onNavigate={setActiveTab}
                  unreadCount={unread}
                />
              )}
            </View>
            <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
