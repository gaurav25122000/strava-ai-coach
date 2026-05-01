import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import { useStore } from '../store/useStore';
import { RefreshCw, LogOut } from 'lucide-react-native';

export const SettingsScreen = () => {
  const [stravaClientId, setStravaClientId] = useState('');
  const [stravaClientSecret, setStravaClientSecret] = useState('');
  const [llmSecret, setLlmSecret] = useState('');

  // Profile settings
  const [weight, setWeight] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [isMetric, setIsMetric] = useState(true);

  const { fetchDataAndGeneratePlan, logout, isLoading } = useStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // In strava.ts and ai.ts we use camelCase names, keeping them consistent here
      const clientId = await SecureStore.getItemAsync('stravaClientId');
      const clientSecret = await SecureStore.getItemAsync('stravaClientSecret');
      const llmKey = await SecureStore.getItemAsync('llmApiKey');

      if (clientId) setStravaClientId(clientId);
      if (clientSecret) setStravaClientSecret(clientSecret);
      if (llmKey) setLlmSecret(llmKey);

      // Local mock profile settings (in a real app, store in AsyncStorage or backend)
      const storedWeight = await SecureStore.getItemAsync('userWeight');
      const storedHr = await SecureStore.getItemAsync('userMaxHr');
      const storedMetric = await SecureStore.getItemAsync('userIsMetric');

      if (storedWeight) setWeight(storedWeight);
      if (storedHr) setMaxHr(storedHr);
      if (storedMetric !== null) setIsMetric(storedMetric === 'true');

    } catch (error) {
      console.error('Error loading settings', error);
    }
  };

  const saveSettings = async () => {
    try {
      await SecureStore.setItemAsync('stravaClientId', stravaClientId);
      await SecureStore.setItemAsync('stravaClientSecret', stravaClientSecret);
      await SecureStore.setItemAsync('llmApiKey', llmSecret);

      await SecureStore.setItemAsync('userWeight', weight);
      await SecureStore.setItemAsync('userMaxHr', maxHr);
      await SecureStore.setItemAsync('userIsMetric', isMetric.toString());

      Alert.alert('Success', 'Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings', error);
      Alert.alert('Error', 'Failed to save settings.');
    }
  };

  const handleSync = async () => {
    try {
      await fetchDataAndGeneratePlan();
      Alert.alert('Success', 'Data synced successfully!');
    } catch (e) {
      Alert.alert('Error', 'Failed to sync data.');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out and clear all local data?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            // Clear secure tokens
            await SecureStore.deleteItemAsync('strava_access_token');
            await SecureStore.deleteItemAsync('strava_refresh_token');
            await SecureStore.deleteItemAsync('strava_expires_at');
            // Clear store
            logout();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.syncButton]} onPress={handleSync} disabled={isLoading}>
            <RefreshCw size={20} color={theme.colors.textPrimary} style={styles.actionIcon} />
            <Text style={styles.actionButtonText}>{isLoading ? 'Syncing...' : 'Force Sync Data'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
            <LogOut size={20} color={theme.colors.textPrimary} style={styles.actionIcon} />
            <Text style={styles.actionButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>User Profile</Text>

        <View style={styles.inputGroup}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Use Metric System (km, kg)</Text>
            <Switch
              value={isMetric}
              onValueChange={setIsMetric}
              trackColor={{ false: theme.colors.skeletonBackground, true: theme.colors.primaryOrange }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </View>

        <View style={styles.rowInputs}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: theme.spacing.sm }]}>
            <Text style={styles.label}>Weight ({isMetric ? 'kg' : 'lbs'})</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              placeholder="e.g. 75"
              placeholderTextColor={theme.colors.tabInactive}
              keyboardType="numeric"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Max HR (bpm)</Text>
            <TextInput
              style={styles.input}
              value={maxHr}
              onChangeText={setMaxHr}
              placeholder="e.g. 190"
              placeholderTextColor={theme.colors.tabInactive}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>API Credentials</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Strava Client ID</Text>
          <TextInput
            style={styles.input}
            value={stravaClientId}
            onChangeText={setStravaClientId}
            placeholder="Enter Strava Client ID"
            placeholderTextColor={theme.colors.tabInactive}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Callback URL (Add this to Strava Dashboard)</Text>
          <View style={styles.uriContainer}>
            <Text style={styles.uriText} selectable>{AuthSession.makeRedirectUri({ scheme: 'app' })}</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Strava Client Secret</Text>
          <TextInput
            style={styles.input}
            value={stravaClientSecret}
            onChangeText={setStravaClientSecret}
            placeholder="Enter Strava Client Secret"
            placeholderTextColor={theme.colors.tabInactive}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>OpenAI API Key</Text>
          <TextInput
            style={styles.input}
            value={llmSecret}
            onChangeText={setLlmSecret}
            placeholder="Enter LLM API Key"
            placeholderTextColor={theme.colors.tabInactive}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  syncButton: {
    backgroundColor: theme.colors.primaryBlue,
    marginRight: theme.spacing.sm,
  },
  logoutButton: {
    backgroundColor: theme.colors.primaryRed,
  },
  actionIcon: {
    marginRight: theme.spacing.xs,
  },
  actionButtonText: {
    ...theme.typography.small,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.cardBackground,
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.typography.body,
  },
  saveButton: {
    backgroundColor: theme.colors.primaryOrange,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  saveButtonText: {
    ...theme.typography.body,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  uriContainer: {
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  uriText: {
    ...theme.typography.caption,
    color: theme.colors.primaryOrange,
    fontFamily: 'Courier',
  }
});
