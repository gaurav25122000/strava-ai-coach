import React from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { StravaService } from '../services/strava';
import axios from 'axios';
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function SettingsScreen() {
  const { settings, updateSettings, setActivities, setLifetimeStats, setToast } = useStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // initialize() loads token from SecureStore into memory first
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

      // Auto-sync activities
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <Typography variant="h2">Settings</Typography>
        </View>

        <View style={styles.section}>
          <Typography variant="h3" style={styles.sectionTitle}>Strava Integration</Typography>
          <View style={styles.infoBox}>
            <Typography variant="caption" style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
              1. Go to Strava Settings {'>'} API{'\n'}
              2. Create an App{'\n'}
              3. Set Callback Domain to "localhost"{'\n'}
              4. Copy Client ID & Secret below
            </Typography>
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Client ID</Typography>
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
            <Typography variant="label" style={styles.label}>Client Secret</Typography>
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
            style={[styles.providerButton, { marginTop: 16, backgroundColor: isAuthenticated ? theme.colors.success : theme.colors.primary }]}
            onPress={() => isAuthenticated ? syncStrava() : handleStravaConnect()}
            disabled={!settings.stravaClientId || !settings.stravaClientSecret}
          >
             <Typography weight="bold" color="#fff">
                {isAuthenticated ? 'Sync Activities' : 'Connect Strava'}
             </Typography>
          </TouchableOpacity>
          {isAuthenticated && (
            <TouchableOpacity
              style={[styles.providerButton, { marginTop: 8, backgroundColor: 'transparent', borderColor: '#ff4444' }]}
              onPress={async () => {
                await StravaService.disconnect();
                setIsAuthenticated(false);
                setActivities([]);
                setLifetimeStats(null);
                setToast({ title: 'Disconnected', message: 'Strava account disconnected', type: 'error' });
              }}
            >
              <Typography weight="bold" color="#ff4444">Disconnect Strava</Typography>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Typography variant="h3" style={styles.sectionTitle}>AI Assistant</Typography>
          <View style={styles.infoBox}>
            <Typography variant="caption" style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
              Get an API key from OpenAI, Anthropic, or Google AI Studio. Your key is securely stored on this device.
            </Typography>
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>LLM Provider</Typography>
            <View style={styles.providerOptions}>
              {['openai', 'anthropic', 'gemini'].map((provider) => (
                <TouchableOpacity
                  key={provider}
                  style={[
                    styles.providerButton,
                    settings.llmProvider === provider && styles.providerButtonActive
                  ]}
                  onPress={() => updateSettings({ llmProvider: provider as any })}
                >
                  <Typography
                    variant="caption"
                    color={settings.llmProvider === provider ? theme.colors.background : theme.colors.text}
                    style={{textTransform: 'capitalize', fontWeight: settings.llmProvider === provider ? 'bold' : 'normal'}}
                  >
                    {provider}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>API Key</Typography>
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
        </View>

        <View style={styles.section}>
          <Typography variant="h3" style={styles.sectionTitle}>Preferences</Typography>

          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Units</Typography>
            <View style={styles.providerOptions}>
              {['metric', 'imperial'].map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.providerButton, settings.unit === u && styles.providerButtonActive]}
                  onPress={() => updateSettings({ unit: u as any })}
                >
                  <Typography variant="caption" color={settings.unit === u ? theme.colors.background : theme.colors.text} style={{textTransform: 'capitalize'}}>
                    {u}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Coach Personality</Typography>
            <View style={{flexDirection: 'column', gap: 8}}>
              {['Strict Drill Sergeant', 'Encouraging Supporter', 'Data-Driven Analyst'].map((personality) => (
                <TouchableOpacity
                  key={personality}
                  style={[styles.providerButton, settings.coachPersonality === personality && styles.providerButtonActive, { paddingVertical: 12 }]}
                  onPress={() => updateSettings({ coachPersonality: personality as any })}
                >
                  <Typography variant="caption" color={settings.coachPersonality === personality ? theme.colors.background : theme.colors.text}>
                    {personality}
                  </Typography>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.inputGroup, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View>
              <Typography variant="label" style={styles.label}>Privacy Zones</Typography>
              <Typography variant="caption" color={theme.colors.textSecondary}>Hide start/end locations on export</Typography>
            </View>
            <Switch
              value={settings.privacyZones}
              onValueChange={(val) => updateSettings({ privacyZones: val })}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Typography variant="h3" style={styles.sectionTitle}>Data Management</Typography>
          <Typography variant="caption" style={{marginBottom: 16}}>Export your activity data to a JSON file.</Typography>
          <TouchableOpacity
            style={[styles.providerButton, { backgroundColor: theme.colors.surface }]}
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
             <Typography weight="bold">Export Data</Typography>
          </TouchableOpacity>
        </View>

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
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    marginBottom: theme.spacing.md,
    color: theme.colors.primary,
  },
  infoBox: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
  },
  providerOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  providerButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  providerButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  }
});
