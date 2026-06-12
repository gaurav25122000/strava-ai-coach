import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, ScrollView, TextInput, Platform, Linking as RNLinking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { theme, withAlpha } from '../theme';
import { Typography } from '../components/Typography';
import { WidgetCard } from '../components/WidgetCard';
import { PressableScale } from '../components/PressableScale';
import { Toggle } from '../components/Toggle';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { StaggerItem } from '../components/Stagger';
import { SegmentedControl } from '../components/SheetUI';
import { useStore, secureSettingsStorage } from '../store/useStore';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { StravaService } from '../services/strava';
import { performStravaSync } from '../services/syncRunner';
import { NotificationService } from '../services/notifications';
import { armMorningBriefing } from '../services/briefing';
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  LucideIcon,
  Activity as ActivityIcon,
  Bell,
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
  Sunrise,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import { Icon } from '../components/Icon';

// App version surfaced in the About row (single place it appears).
const APP_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/';

const successHaptic = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

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
    <View style={[rowStyles.row, !isLast && rowStyles.rowDivider, disabled && { opacity: theme.opacity.disabled }]}>
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

// ----- Screen ----------------------------------------------------------------
export default function SettingsScreen() {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const setActivities = useStore(s => s.setActivities);
  const setAthleteStats = useStore(s => s.setAthleteStats);
  const setToast = useStore(s => s.setToast);
  const morningBriefingEnabled = useStore(s => s.morningBriefingEnabled);
  const setMorningBriefingEnabled = useStore(s => s.setMorningBriefingEnabled);
  const navigation = useNavigation<any>();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);

  // Secrets live in SecureStore; settings only carries legacy plaintext copies
  // until the first secure write clears them. Read order: secure → settings.
  const [clientSecret, setClientSecret] = useState('');
  const [llmKey, setLlmKey] = useState('');

  useEffect(() => {
    StravaService.initialize().then(() => {
      setIsAuthenticated(StravaService.isAuthenticated());
    });
    let alive = true;
    (async () => {
      const s = useStore.getState().settings;
      const [storedSecret, storedKey] = await Promise.all([
        secureSettingsStorage.getSecret('stravaClientSecret'),
        secureSettingsStorage.getSecret('llmApiKey'),
      ]);
      if (!alive) return;
      setClientSecret(storedSecret || s.stravaClientSecret);
      setLlmKey(storedKey || s.llmApiKey);
      try {
        setNotifGranted(await NotificationService.hasPermission());
      } catch {
        // expo-notifications can throw on web — leave as not granted.
      }
    })();
    return () => { alive = false; };
  }, []);

  // Write the secret to SecureStore and clear any plaintext copy that the old
  // settings blob still carries.
  const persistSecret = useCallback(async (key: 'stravaClientSecret' | 'llmApiKey', value: string) => {
    try {
      await secureSettingsStorage.setSecret(key, value);
      if (useStore.getState().settings[key]) {
        updateSettings({ [key]: '' } as any);
      }
    } catch (e) {
      console.warn('Failed to persist secret:', e);
    }
  }, [updateSettings]);

  const REDIRECT_URI = 'aicoachapp://localhost';

  const handleStravaConnect = async () => {
    // Make sure the secret is in SecureStore before the OAuth round-trip.
    await persistSecret('stravaClientSecret', clientSecret);

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
        client_secret: clientSecret,
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

  const runSync = async (fullResync: boolean) => {
    const result = await performStravaSync(fullResync ? { fullResync: true } : { force: true });

    try {
      const res = await StravaService.fetchAthleteStats();
      setAthleteStats(res);
    } catch (statsErr) {
      console.warn('Could not fetch lifetime stats:', statsErr);
    }

    successHaptic();
    setToast({
      title: 'Success',
      message: result ? `Synced ${result.synced} activities from Strava!` : 'Already up to date.',
      type: 'success',
    });
  };

  const handleSyncError = async (e: any) => {
    if (e.response?.status === 401 || e.message === 'Not authenticated with Strava') {
      await StravaService.disconnect();
      setIsAuthenticated(false);
      setToast({ title: 'Session Expired', message: 'Please reconnect your Strava account.', type: 'error' });
    } else {
      setToast({ title: 'Error', message: 'Failed to sync activities', type: 'error' });
    }
  };

  const syncStrava = async () => {
    setSyncing(true);
    try {
      await runSync(false);
    } catch (e: any) {
      await handleSyncError(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleFullResync = async () => {
    if (fullSyncing || syncing) return;
    setFullSyncing(true);
    try {
      await runSync(true);
    } catch (e: any) {
      await handleSyncError(e);
    } finally {
      setFullSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    await StravaService.disconnect();
    setIsAuthenticated(false);
    setActivities([]);
    setAthleteStats(null);
    setConfirmDisconnect(false);
    successHaptic();
    setToast({ title: 'Disconnected', message: 'Strava account disconnected', type: 'success' });
  };

  const handleEnableNotifications = async () => {
    try {
      const granted = await NotificationService.requestPermission();
      setNotifGranted(granted);
      if (granted) {
        successHaptic();
        setToast({ title: 'Notifications on', message: 'Workout reminders and recaps are enabled.', type: 'success' });
      } else {
        setToast({ title: 'Permission needed', message: 'Enable notifications in system settings.', type: 'error' });
      }
    } catch {
      setToast({ title: 'Error', message: 'Could not request notification permission.', type: 'error' });
    }
  };

  const handleMorningBriefingToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await NotificationService.requestPermission();
      setNotifGranted(granted);
      if (!granted) {
        // Store value never flips, so the Toggle snaps back — that's the revert.
        setToast({ title: 'Permission needed', message: 'Enable notifications in system settings.', type: 'error' });
        return;
      }
    }
    setMorningBriefingEnabled(enabled);
    // Schedules tomorrow's 07:00 briefing — or cancels it when disabling.
    armMorningBriefing().catch(() => {});
  };

  const handleExport = async () => {
    try {
      const { activities, settings: latestSettings } = useStore.getState();
      // Privacy zones: routes (polylines) reveal start/end locations — strip
      // them from the export when the toggle is on.
      const exportable = latestSettings.privacyZones
        ? activities.map(({ polyline, ...rest }) => rest)
        : activities;
      const documentDirectory = FileSystem.documentDirectory;
      if (!documentDirectory) throw new Error('No document directory');
      const fileUri = documentDirectory + 'activities.json';
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(exportable, null, 2));

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
  const progressFam = familyStyle('progress');

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
          <PressableScale
            onPress={() => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('MenuHome'); }}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={24} color={theme.colors.onAccent} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Typography style={styles.heroTitle}>Settings</Typography>
            <Typography style={styles.heroSub}>Connect, customise, manage your data</Typography>
          </View>
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
                value={clientSecret}
                onChangeText={setClientSecret}
                onEndEditing={() => persistSecret('stravaClientSecret', clientSecret)}
                placeholder="Enter Strava Client Secret"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
              />
              <Typography style={styles.secureNote}>Stored securely on this device</Typography>
            </View>

            <Button
              title={syncing ? 'Syncing…' : isAuthenticated ? 'Sync Activities' : 'Connect Strava'}
              icon={isAuthenticated ? RefreshCw : Link2}
              loading={syncing}
              disabled={!settings.stravaClientId || !clientSecret || fullSyncing}
              fullWidth
              onPress={() => (isAuthenticated ? syncStrava() : handleStravaConnect())}
              style={{ marginTop: 8 }}
            />

            {isAuthenticated && (
              <>
                <View style={{ marginTop: 6 }}>
                  <SettingsRow
                    icon={RefreshCw}
                    family="plan"
                    label="Full Re-sync"
                    caption="Re-download your entire history (picks up deletions)"
                    onPress={handleFullResync}
                    disabled={fullSyncing || syncing}
                    isLast
                    right={fullSyncing
                      ? <ActivityIndicator size="small" color={familyStyle('plan').accent} />
                      : undefined}
                  />
                </View>
                <Button
                  title="Disconnect Strava"
                  variant="destructive"
                  icon={Unplug}
                  fullWidth
                  onPress={() => setConfirmDisconnect(true)}
                  style={{ marginTop: 6 }}
                />
              </>
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
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={personality}
                  >
                    <Typography style={[styles.optionCardText, active && { color: healthFam.accent, fontWeight: '800' }]}>
                      {personality}
                    </Typography>
                    {active && <Icon icon={Check} variant="plain" size="sm" color={healthFam.accent} />}
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
                  value={llmKey}
                  onChangeText={setLlmKey}
                  onEndEditing={() => persistSecret('llmApiKey', llmKey)}
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

        {/* ---------- Notifications ---------- */}
        <StaggerItem index={4}>
          <WidgetCard family="progress" title="Notifications" icon={Bell} caption="Reminders & recaps">
            <SettingsRow
              icon={Bell}
              family="progress"
              label="Enable notifications"
              caption={notifGranted
                ? 'Workout reminders, streaks and weekly recaps are on'
                : 'Workout reminders, streak alerts, weekly recaps'}
              onPress={notifGranted ? undefined : handleEnableNotifications}
              right={notifGranted
                ? (
                  <View style={styles.grantedPill}>
                    <Icon icon={Check} variant="plain" size="xs" color={theme.colors.success} />
                    <Typography style={styles.grantedPillText}>Enabled</Typography>
                  </View>
                )
                : <Button title="Enable" size="sm" variant="secondary" family="progress" onPress={handleEnableNotifications} />}
            />
            <SettingsRow
              icon={Sunrise}
              family="progress"
              label="Morning briefing"
              caption="Your workout + weather at 7:00"
              isLast
              right={
                <Toggle
                  value={morningBriefingEnabled}
                  onValueChange={(val) => { handleMorningBriefingToggle(val); }}
                  accent={progressFam.accent}
                  accessibilityLabel="Morning briefing"
                />
              }
            />
          </WidgetCard>
        </StaggerItem>

        {/* ---------- Privacy ---------- */}
        <StaggerItem index={5}>
          <WidgetCard family="records" title="Privacy" icon={Shield} caption="Your data, your control">
            <SettingsRow
              icon={Shield}
              family="records"
              label="Privacy Zones"
              caption="Hide routes & locations on export"
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
        <StaggerItem index={6}>
          <WidgetCard family="social" title="About" icon={Info} caption="App info">
            <SettingsRow
              icon={ActivityIcon}
              family="social"
              label="Strava AI Coach"
              caption={`Version ${APP_VERSION}`}
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

      </ScrollView>

      {/* ---------- Disconnect confirm ---------- */}
      <Sheet
        visible={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Strava?"
        caption="Removes your access token and clears synced activities from this device."
      >
        <Button
          title="Disconnect"
          variant="destructive"
          icon={Unplug}
          fullWidth
          onPress={handleDisconnect}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Cancel"
          variant="ghost"
          fullWidth
          onPress={() => setConfirmDisconnect(false)}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    // Clear the floating dock, like every other Menu-stack screen.
    paddingBottom: 130,
  },
  heroHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 22, marginBottom: 16,
  },
  heroTitle: { fontSize: 24, fontFamily: theme.fonts.display, color: theme.colors.onAccent },
  heroSub: { fontSize: 12, color: withAlpha(theme.colors.onAccent, 'heavy'), marginTop: 4 },

  infoBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: withAlpha(theme.colors.primary, 'heavy'),
  },
  infoText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 20 },

  inputGroup: { marginBottom: theme.spacing.md },
  label: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.border, 'heavy'),
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
  },
  secureNote: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 5 },
  apiKeyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: withAlpha(theme.colors.border, 'heavy'),
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

  // Single option-card style for the multi-line personality chip group.
  optionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  optionCardText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },

  grantedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: withAlpha(theme.colors.success, 'tint'),
    borderWidth: 1, borderColor: withAlpha(theme.colors.success, 'strong'),
  },
  grantedPillText: { fontSize: 11, fontWeight: '700', color: theme.colors.success },
});
