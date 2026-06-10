import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Linking as RNLinking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { WidgetCard } from '../components/WidgetCard';
import { PressableScale } from '../components/PressableScale';
import { Toggle } from '../components/Toggle';
import { StaggerItem } from '../components/Stagger';
import { SegmentedControl } from '../components/SheetUI';
import { useStore } from '../store/useStore';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { StravaService } from '../services/strava';
import { computeAllProgress } from '../services/goalProgress';
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  LucideIcon,
  Activity as ActivityIcon,
  Bot,
  Link2,
  Unplug,
  Download,
  Shield,
  Ruler,
  Clock,
  Code2,
  ExternalLink,
  Info,
  KeyRound,
  RefreshCw,
  Sparkles,
  ChevronRight,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';

// App version surfaced in the About row.
const APP_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/';

// ----- Row primitive ---------------------------------------------------------
// One settings row. The right slot is anything — switch, value text, chevron,
// even a small button. Keeping it dumb means every section can compose rows
// without bespoke styling per case.
interface SettingsRowProps {
  icon: LucideIcon;
  family: WidgetFamily;
  label: string;
  caption?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  isLast?: boolean;
}

function SettingsRow({ icon, family, label, caption, right, onPress, disabled, isLast }: SettingsRowProps) {
  const inner = (
    <View style={[rowStyles.row, !isLast && rowStyles.rowDivider, disabled && { opacity: 0.5 }]}>
      <Icon icon={icon} family={family} variant="pill" size="md" />
      <View style={rowStyles.labelWrap}>
        <Typography style={rowStyles.label}>{label}</Typography>
        {caption && <Typography style={rowStyles.caption}>{caption}</Typography>}
      </View>
      {right !== undefined ? (
        <View style={rowStyles.rightWrap}>{right}</View>
      ) : onPress ? (
        <Icon icon={ChevronRight} variant="plain" size="md" color={theme.colors.textSecondary} />
      ) : null}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <PressableScale haptic="selection" onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {inner}
      </PressableScale>
    );
  }
  return inner;
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
  labelWrap: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  caption: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  rightWrap: { marginLeft: 8 },
});

// ----- Spinning sync icon ----------------------------------------------------
// On-brand loading state for the Strava CTA — keeps the RefreshCw glyph and
// rotates it continuously instead of swapping in the OS ActivityIndicator.
function SpinningRefresh() {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rotation);
  }, [rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon icon={RefreshCw} variant="plain" size="sm" color="#fff" />
    </Animated.View>
  );
}

// ----- Screen ----------------------------------------------------------------
export default function SettingsScreen() {
  const { settings, updateSettings, setActivities, setLifetimeStats, setToast, setLastSyncedAt } = useStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      setToast({ title: 'Error', message: 'Failed to authenticate with Strava', type: 'error' });
    }
  };

  const syncStrava = async () => {
    setSyncing(true);
    try {
      const activities = await StravaService.syncActivities();
      setActivities(activities);
      setLastSyncedAt(new Date().toISOString());
      const { goals: latestGoals, setGoals } = useStore.getState();
      setGoals(computeAllProgress(latestGoals, activities));

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
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    await StravaService.disconnect();
    setIsAuthenticated(false);
    setActivities([]);
    setLifetimeStats(null);
    setToast({ title: 'Disconnected', message: 'Strava account disconnected', type: 'error' });
  };

  const handleExport = async () => {
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
  };

  const healthFam = familyStyle('health');
  const recordsFam = familyStyle('records');
  const socialFam = familyStyle('social');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Hero header */}
        <LinearGradient
          colors={theme.colors.gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <Typography style={styles.heroTitle}>Settings</Typography>
          <Typography style={styles.heroSub}>Connect, customise, manage your data</Typography>
        </LinearGradient>

        {/* ---------- Account ---------- */}
        <StaggerItem index={0}>
          <WidgetCard family="plan" title="Account" icon={Link2} caption="Strava connection">
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

            <PressableScale
              onPress={() => isAuthenticated ? syncStrava() : handleStravaConnect()}
              disabled={!settings.stravaClientId || !settings.stravaClientSecret || syncing}
              style={{ marginTop: 8 }}
            >
              <LinearGradient
                colors={isAuthenticated ? ['#10b981', '#059669'] : ['#FC4C02', '#F97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, theme.shadows.glow(isAuthenticated ? '#10b981' : '#FC4C02')]}
              >
                {syncing ? (
                  <SpinningRefresh />
                ) : isAuthenticated ? (
                  <Icon icon={RefreshCw} variant="plain" size="sm" color="#fff" />
                ) : (
                  <Icon icon={Link2} variant="plain" size="sm" color="#fff" />
                )}
                <Typography style={styles.ctaText}>
                  {syncing ? 'Syncing…' : isAuthenticated ? 'Sync Activities' : 'Connect Strava'}
                </Typography>
              </LinearGradient>
            </PressableScale>

            {isAuthenticated && (
              <PressableScale
                style={styles.disconnectBtn}
                onPress={handleDisconnect}
              >
                <Icon icon={Unplug} variant="plain" size="sm" color={theme.colors.error} />
                <Typography style={styles.disconnectText}>Disconnect Strava</Typography>
              </PressableScale>
            )}
          </WidgetCard>
        </StaggerItem>

        {/* ---------- Coaching ---------- */}
        <StaggerItem index={1}>
          <WidgetCard family="health" title="Coaching" icon={Sparkles} caption="Coach style">
            <Typography style={styles.label}>Coach Personality</Typography>
            <View style={{ flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {(['Strict Drill Sergeant', 'Encouraging Supporter', 'Data-Driven Analyst'] as const).map((personality) => {
                const active = settings.coachPersonality === personality;
                return (
                  <PressableScale
                    key={personality}
                    haptic="selection"
                    style={[
                      styles.optionCard,
                      active && {
                        backgroundColor: healthFam.tint,
                        borderColor: healthFam.accent,
                      },
                    ]}
                    onPress={() => updateSettings({ coachPersonality: personality })}
                    accessibilityRole="button"
                    accessibilityLabel={personality}
                  >
                    <Typography style={[styles.optionCardText, active && { color: healthFam.accent, fontWeight: '800' }]}>
                      {personality}
                    </Typography>
                  </PressableScale>
                );
              })}
            </View>
          </WidgetCard>
        </StaggerItem>

        {/* ---------- AI ---------- */}
        <StaggerItem index={2}>
          <WidgetCard family="plan" title="AI" icon={Bot} caption="LLM provider & key">
            <View style={styles.infoBox}>
              <Typography style={styles.infoText}>
                Get an API key from OpenAI, Anthropic, or Google AI Studio. Your key is stored securely on this device.
              </Typography>
            </View>
            <View style={styles.inputGroup}>
              <Typography style={styles.label}>LLM Provider</Typography>
              <SegmentedControl<'openai' | 'anthropic' | 'gemini'>
                family="plan"
                segments={[
                  { value: 'openai', label: 'OpenAI' },
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'gemini', label: 'Gemini' },
                ]}
                value={settings.llmProvider}
                onChange={(provider) => updateSettings({ llmProvider: provider })}
              />
            </View>
            <View style={[styles.inputGroup, { marginBottom: 0 }]}>
              <Typography style={styles.label}>API Key</Typography>
              <View style={styles.apiKeyWrap}>
                <Icon icon={KeyRound} variant="plain" size="sm" color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.apiKeyInput}
                  value={settings.llmApiKey}
                  onChangeText={(text) => updateSettings({ llmApiKey: text })}
                  placeholder={`Enter ${settings.llmProvider} API Key`}
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            </View>
          </WidgetCard>
        </StaggerItem>

        {/* ---------- Display ---------- */}
        <StaggerItem index={3}>
          <WidgetCard family="activity" title="Display" icon={Ruler} caption="Units & format">
            <SettingsRow
              icon={Ruler}
              family="activity"
              label="Units"
              caption="Distance & pace"
              right={
                <View style={styles.segmentWrap}>
                  <SegmentedControl<'metric' | 'imperial'>
                    family="activity"
                    segments={[
                      { value: 'metric', label: 'Metric' },
                      { value: 'imperial', label: 'Imperial' },
                    ]}
                    value={settings.unit}
                    onChange={(u) => updateSettings({ unit: u })}
                  />
                </View>
              }
            />
            <SettingsRow
              icon={Clock}
              family="activity"
              label="Time Format"
              caption="12-hour or 24-hour clock"
              isLast
              right={
                <View style={styles.segmentWrap}>
                  <SegmentedControl<'12h' | '24h'>
                    family="activity"
                    segments={[
                      { value: '12h', label: '12h' },
                      { value: '24h', label: '24h' },
                    ]}
                    value={settings.timeFormat}
                    onChange={(t) => updateSettings({ timeFormat: t })}
                  />
                </View>
              }
            />
          </WidgetCard>
        </StaggerItem>

        {/* ---------- Privacy ---------- */}
        <StaggerItem index={4}>
          <WidgetCard family="records" title="Privacy" icon={Shield} caption="Your data, your control">
            <SettingsRow
              icon={Shield}
              family="records"
              label="Privacy Zones"
              caption="Hide start/end locations on export"
              right={
                <Toggle
                  value={settings.privacyZones}
                  onValueChange={(val) => updateSettings({ privacyZones: val })}
                  accent={recordsFam.accent}
                  accessibilityLabel="Privacy Zones"
                />
              }
            />
            <SettingsRow
              icon={Download}
              family="records"
              label="Export Data"
              caption="Save activities to a JSON file"
              onPress={handleExport}
              isLast
            />
          </WidgetCard>
        </StaggerItem>

        {/* ---------- About ---------- */}
        <StaggerItem index={5}>
          <WidgetCard family="social" title="About" icon={Info} caption="App info">
            <SettingsRow
              icon={ActivityIcon}
              family="social"
              label="Strava AI Coach"
              caption={`Version ${APP_VERSION}`}
              right={<Typography style={styles.versionPill}>v{APP_VERSION}</Typography>}
            />
            <SettingsRow
              icon={Code2}
              family="social"
              label="View on GitHub"
              caption="Source & credits"
              onPress={() => RNLinking.openURL(REPO_URL).catch(() => {})}
              right={<Icon icon={ExternalLink} variant="plain" size="sm" color={theme.colors.textSecondary} />}
              isLast
            />
          </WidgetCard>
        </StaggerItem>

        <Typography style={styles.footer}>Strava AI Coach · v{APP_VERSION}</Typography>

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
  heroTitle: { fontSize: 24, fontFamily: theme.fonts.display, color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

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
    borderColor: theme.colors.border + '88',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
  },
  apiKeyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border + '88',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  apiKeyInput: {
    flex: 1,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
  },

  // Right-slot segmented controls sit in a fixed-width box so the sliding pill
  // doesn't stretch the whole row to the screen edge.
  segmentWrap: { width: 150 },

  // Single option-card style for the multi-line personality picker.
  optionCard: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  optionCardText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 8,
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

  versionPill: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },

  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
    letterSpacing: 0.3,
  },
});
