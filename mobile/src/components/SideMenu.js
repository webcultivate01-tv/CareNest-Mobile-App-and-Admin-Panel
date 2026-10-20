// Right-side drawer opened from the three dots on the Profile screen.
// Holds account settings, support, language choice and log out.
import { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { LANGUAGES, useLanguage } from '../i18n';

const WIDTH = Math.min(Dimensions.get('window').width * 0.82, 340);

function Item({ icon, title, onPress, danger, right }) {
  const color = danger ? colors.danger : colors.primary;
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.itemTitle, danger && { color: colors.danger }]}>{title}</Text>
      {right || <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

export default function SideMenu({ visible, onClose, onLogout }) {
  const { t, lang, setLang } = useLanguage();
  const [mounted, setMounted] = useState(visible);
  const [showLanguages, setShowLanguages] = useState(false);
  const [slide] = useState(() => new Animated.Value(WIDTH));

  if (visible && !mounted) setMounted(true);

  // Slide in from the right, slide back out before unmounting.
  useEffect(() => {
    if (visible) {
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: WIDTH, duration: 200, useNativeDriver: true }).start(() => {
        setMounted(false);
        setShowLanguages(false);
      });
    }
  }, [visible, slide]);

  const soon = (title) => () => Alert.alert(title, t('comingSoon'));
  const current = LANGUAGES.find((l) => l.code === lang);

  return (
    <Modal visible={mounted} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slide }] }]}>
          <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{t('menu')}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <Text style={styles.section}>{t('accountSettings')}</Text>
              <Item
                icon="notifications-outline"
                title={t('notifications')}
                onPress={soon(t('notifications'))}
              />
              <Item
                icon="lock-closed-outline"
                title={t('security')}
                onPress={soon(t('security'))}
              />
              <Item
                icon="language-outline"
                title={t('language')}
                onPress={() => setShowLanguages(!showLanguages)}
                right={
                  <View style={styles.langValue}>
                    <Text style={styles.itemSub}>{current.native}</Text>
                    <Ionicons
                      name={showLanguages ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textMuted}
                    />
                  </View>
                }
              />
              {showLanguages && (
                <View style={styles.languages}>
                  {LANGUAGES.map((l) => (
                    <TouchableOpacity
                      key={l.code}
                      style={styles.langRow}
                      onPress={() => setLang(l.code)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.langText, l.code === lang && styles.langActive]}>
                        {l.native}
                        {l.native !== l.label ? `  (${l.label})` : ''}
                      </Text>
                      {l.code === lang && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.section}>{t('supportInfo')}</Text>
              <Item
                icon="help-circle-outline"
                title={t('help')}
                onPress={soon(t('help'))}
              />
              <Item
                icon="document-text-outline"
                title={t('terms')}
                onPress={soon(t('terms'))}
              />
              <Item
                icon="information-circle-outline"
                title={t('about')}
                onPress={soon(t('about'))}
              />
              <Item
                icon="trash-outline"
                title={t('deleteAccount')}
                onPress={soon(t('deleteAccount'))}
                danger
              />
              <TouchableOpacity
                style={styles.logout}
                onPress={() => {
                  onClose();
                  onLogout();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.logoutText}>{t('logout')}</Text>
              </TouchableOpacity>
            </ScrollView>

          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', justifyContent: 'flex-end' },
  drawer: {
    width: WIDTH,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  body: { paddingHorizontal: 16, paddingBottom: 12 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 6,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  langValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  languages: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  langText: { fontSize: 14, color: colors.text },
  langActive: { fontWeight: '800', color: colors.primary },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
});
