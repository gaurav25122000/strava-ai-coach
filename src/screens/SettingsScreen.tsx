import React from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { Card } from '../components/Card';
import { useStore } from '../store/useStore';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { StravaService } from '../services/strava';
import axios from 'axios';
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Activity as ActivityIcon, Bot, Sliders, Database, Link2, Unplug, Download, Shield } from 'lucide-react-native';

function SectionHeader({ icon, title, accentColor }: { icon: React.ReactNode; title: string; accentColor: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionAccent, { backgroundColor: accentColor }]} />
      {icon}
      <Typography style={styles.sectionHeaderTitle}>{title}</Typography>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, setActivities, setLifetimeStats, setToast } = useStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    StravaService.initialize().then(() => {
      setIsAuthenticated(StravaService.isAuthenticated());
    });
  }, []);

  const REDIRECT_URI = 'aicoachapp://localhost';

  const handleStravaConnect = async () => {
    const authUrl =
      `https://www.strava.com/oauth/mobile/authorize` +
      `?client_id=${settings.stravaClientId}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&approval_prompt=force` +
      `&scope=read_all,activity:read_all,profile:read_all`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);
    if (result.type === 'success') {
      const url = result.url;
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      if (code) {
        await exchangeCodeForToken(code);
      } else {
        setToast({ title: 'Error', message: 'No auth code returned', type: 'error' });
      }
    }
  };

  const exchangeCodeForToken = async (code: string) => {
    try {
      const res = await axios.post('https://www.strava.com/oauth/token', {
        client_id: settings.stravaClientId,
        client_secret: settings.stravaClientSecret,
        code,
        grant_type: 'authorization_code',
      });

      const { access_token, refresh_token, expires_at } = res.data;
      await StravaService.setToken(access_token, refresh_token, expires_at);
      setIsAuthenticated(true);

      syncStrava();
    } catch (error) {
      console.error('Error exchanging token:', error);
      setToast({ title: 'Error', message: 'Failed to authenticate with Strava', type: 'error' });
    }
  };

  const syncStrava = async () => {
    try {
      const activities = await StravaService.syncActivities();
      setActivities(activities);

      try {
        const stats = await StravaService.fetchAthleteStats();
        setLifetimeStats(stats);
      } catch (statsErr) {
        console.warn('Could not fetch lifetime stats:', statsErr);
      }

      setToast({ title: 'Success', message: `Synced ${activities.length} activities from Strava!`, type: 'success' });
    } catch (e: any) {
      if (e.response?.status === 401 || e.message === 'Not authenticated with Strava') {
        await StravaService.disconnect();
        setIsAuthenticated(false);
        setToast({ title: 'Session Expired', message: 'Please reconnect your Strava account.', type: 'error' });
      } else {
        setToast({ title: 'Error', message: 'Failed to sync activities', type: 'error' });
      }
    }
  };

  let stagger = 0;
  const next = () => stagger++;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <LinearGradient
          colors={theme.colors.gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <Typography style={styles.heroTitle}>Settings</Typography>
          <Typography style={styles.heroSub}>Connect, customise, manage your data</Typography>
        </LinearGradient>

        {/* Strava */}
        <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
          <SectionHeader
            icon={<ActivityIcon size={15} color="#FC4C02" />}
            title="Strava Integration"
            accentColor="#FC4C02"
          />
          <Card variant="elevated" style={styles.section}>
            <View style={styles.infoBox}>
              <Typography style={styles.infoText}>
                1. Go to Strava Settings {'>'} API{'\n'}
                2. Create an App{'\n'}
                3. Set Callback Domain to "localhost"{'\n'}
                4. Copy Client ID & Secret below
              </Typography>
            </View>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>Client ID</Typography>
              <TextInput
                style={styles.input}
                value={settings.stravaClientId}
                onChangeText={(text) => updateSettings({ stravaClientId: text })}
                placeholder="Enter Strava Client ID"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>Client Secret</Typography>
              <TextInput
                style={styles.input}
                value={settings.stravaClientSecret}
                onChangeText={(text) => updateSettings({ stravaClientSecret: text })}
                placeholder="Enter Strava Client Secret"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              onPress={() => isAuthenticated ? syncStrava() : handleStravaConnect()}
              disabled={!settings.stravaClientId || !settings.stravaClientSecret}
              activeOpacity={0.85}
              style={{ marginTop: 8 }}
            >
              <LinearGradient
                colors={isAuthenticated ? ['#10b981', '#059669'] : ['#FC4C02', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, theme.shadows.glow(isAuthenticated ? '#10b981' : '#FC4C02')]}
              >
                <Link2 size={16} color="#fff" />
                <Typography style={styles.ctaText}>
                  {isAuthenticated ? 'Sync Activities' : 'Connect Strava'}
                </Typography>
              </LinearGradient>
            </TouchableOpacity>

            {isAuthenticated && (
              <TouchableOpacity
                style={styles.disconnectBtn}
                onPress={async () => {
                  await StravaService.disconnect();
                  setIsAuthenticated(false);
                  setActivities([]);
                  setLifetimeStats(null);
                  setToast({ title: 'Disconnected', message: 'Strava account disconnected', type: 'error' });
                }}
                activeOpacity={0.7}
              >
                <Unplug size={14} color={theme.colors.error} />
                <Typography style={styles.disconnectText}>Disconnect Strava</Typography>
              </TouchableOpacity>
            )}
          </Card>
        </Animated.View>

        {/* AI Assistant */}
        <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
          <SectionHeader
            icon={<Bot size={15} color={theme.colors.primary} />}
            title="AI Assistant"
            accentColor={theme.colors.primary}
          />
          <Card variant="elevated" style={styles.section}>
            <View style={styles.infoBox}>
              <Typography style={styles.infoText}>
                Get an API key from OpenAI, Anthropic, or Google AI Studio. Your key is stored securely on this device.
              </Typography>
            </View>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>LLM Provider</Typography>
              <View style={styles.providerOptions}>
                {(['openai', 'anthropic', 'gemini'] as const).map((provider) => (
                  <TouchableOpacity
                    key={provider}
                    style={[
                      styles.providerButton,
                      settings.llmProvider === provider && styles.providerButtonActive,
                    ]}
                    onPress={() => updateSettings({ llmProvider: provider })}
                  >
                    <Typography
                      style={[
                        styles.providerText,
                        settings.llmProvider === provider && styles.providerTextActive,
                      ]}
                    >
                      {provider}
                    </Typography>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>API Key</Typography>
              <TextInput
                style={styles.input}
                value={settings.llmApiKey}
                onChangeText={(text) => updateSettings({ llmApiKey: text })}
                placeholder={`Enter ${settings.llmProvider} API Key`}
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          </Card>
        </Animated.View>

        {/* Preferences */}
        <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
          <SectionHeader
            icon={<Sliders size={15} color={theme.colors.accent} />}
            title="Preferences"
            accentColor={theme.colors.accent}
          />
          <Card variant="elevated" style={styles.section}>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>Units</Typography>
              <View style={styles.providerOptions}>
                {(['metric', 'imperial'] as const).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.providerButton, settings.unit === u && styles.providerButtonActive]}
                    onPress={() => updateSettings({ unit: u })}
                  >
                    <Typography
                      style={[
                        styles.providerText,
                        settings.unit === u && styles.providerTextActive,
                      ]}
                    >
                      {u}
                    </Typography>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Typography style={styles.label}>Coach Personality</Typography>
              <View style={{ flexDirection: 'column', gap: 8 }}>
                {(['Strict Drill Sergeant', 'Encouraging Supporter', 'Data-Driven Analyst'] as const).map((personality) => {
                  const active = settings.coachPersonality === personality;
                  return (
                    <TouchableOpacity
                      key={personality}
                      style={[styles.personalityBtn, active && styles.personalityBtnActive]}
                      onPress={() => updateSettings({ coachPersonality: personality })}
                    >
                      <Typography style={[styles.personalityText, active && styles.personalityTextActive]}>
                        {personality}
                      </Typography>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Shield size={13} color={theme.colors.textSecondary} />
                  <Typography style={styles.label}>Privacy Zones</Typography>
                </View>
                <Typography style={styles.toggleSub}>Hide start/end locations on export</Typography>
              </View>
              <Switch
                value={settings.privacyZones}
                onValueChange={(val) => updateSettings({ privacyZones: val })}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </Card>
        </Animated.View>

        {/* Data Management */}
        <Animated.View entering={FadeInDown.delay(next() * 60).duration(360)}>
          <SectionHeader
            icon={<Database size={15} color="#10b981" />}
            title="Data Management"
            accentColor="#10b981"
          />
          <Card variant="elevated" style={styles.section}>
            <Typography style={styles.dataNote}>Export your activity data to a JSON file.</Typography>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                try {
                  const activities = useStore.getState().activities;
                  const documentDirectory = FileSystem.documentDirectory;
                  if (!documentDirectory) throw new Error('No document directory');
                  const fileUri = documentDirectory + 'activities.json';
                  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(activities, null, 2));

                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri);
                  } else {
                    setToast({ title: 'Error', message: 'Sharing is not available on this device', type: 'error' });
                  }
                } catch (e) {
                  setToast({ title: 'Error', message: 'Failed to export data', type: 'error' });
                }
              }}
            >
              <LinearGradient
                colors={['#10b981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, theme.shadows.glow('#10b981')]}
              >
                <Download size={16} color="#fff" />
                <Typography style={styles.ctaText}>Export Data</Typography>
              </LinearGradient>
            </TouchableOpacity>
          </Card>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  heroHeader: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22, marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 16, marginTop: 4, marginBottom: 8 },
  sectionAccent: { width: 3, height: 14, borderRadius: 2 },
  sectionHeaderTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.text, letterSpacing: 1.2, textTransform: 'uppercase' },

  section: {
    marginHorizontal: 16, marginBottom: 16,
    padding: theme.spacing.md,
  },
  infoBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary + '88',
  },
  infoText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 20 },

  inputGroup: { marginBottom: theme.spacing.md },
  label: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
  },

  providerOptions: { flexDirection: 'row', gap: 8 },
  providerButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  providerButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    ...theme.shadows.glow(theme.colors.primary),
  },
  providerText: { fontSize: 12, fontWeight: '600', color: theme.colors.text, textTransform: 'capitalize' },
  providerTextActive: { color: '#fff', fontWeight: '800' },

  personalityBtn: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  personalityBtnActive: {
    backgroundColor: theme.colors.accent + '22',
    borderColor: theme.colors.accent,
  },
  personalityText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  personalityTextActive: { color: theme.colors.accent, fontWeight: '800' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6,
  },
  toggleSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 6,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, marginTop: 10, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.error + '55',
    backgroundColor: theme.colors.error + '11',
    gap: 6,
  },
  disconnectText: { color: theme.colors.error, fontWeight: '700', fontSize: 13 },

  dataNote: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 14 },
});
