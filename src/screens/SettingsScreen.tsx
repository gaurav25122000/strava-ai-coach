import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import * as SecureStore from 'expo-secure-store';
import { useStore } from '../store/useStore';
import { RefreshCw, LogOut, ChevronRight } from 'lucide-react-native';

export const SettingsScreen = () => {
  const [stravaClientId, setStravaClientId] = useState('');
  const [stravaClientSecret, setStravaClientSecret] = useState('');
  const [llmSecret, setLlmSecret] = useState('');

  // Profile settings
  const [weight, setWeight] = useState('');
  const [maxHr, setMaxHr] = useState('');

  const {
    fetchDataAndGeneratePlan,
    logout,
    isLoading,
    useMetric, setUseMetric,
    coachPersonality, setCoachPersonality,
    privacyZonesEnabled, setPrivacyZones,
    weatherContextEnabled, setWeatherContext,
    shoes, addShoe
  } = useStore();

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

        <Text style={styles.sectionTitle}>App Preferences</Text>

        <View style={styles.inputGroup}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Use Metric System (km, kg)</Text>
            <Switch
              value={useMetric}
              onValueChange={setUseMetric}
              trackColor={{ false: theme.colors.skeletonBackground, true: theme.colors.primaryOrange }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>Privacy Zones</Text>
              <Text style={styles.helperText}>Hide start/end points</Text>
            </View>
            <Switch
              value={privacyZonesEnabled}
              onValueChange={setPrivacyZones}
              trackColor={{ false: theme.colors.skeletonBackground, true: theme.colors.primaryBlue }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>Weather Context</Text>
              <Text style={styles.helperText}>AI adjusts plans based on forecast</Text>
            </View>
            <Switch
              value={weatherContextEnabled}
              onValueChange={setWeatherContext}
              trackColor={{ false: theme.colors.skeletonBackground, true: theme.colors.primaryGreen }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>AI Coach Personality</Text>
        <View style={styles.segmentedControl}>
          {['Strict', 'Encouraging', 'Data-Driven'].map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.segmentButton, coachPersonality === p && styles.segmentActive]}
              onPress={() => setCoachPersonality(p as any)}
            >
              <Text style={[styles.segmentText, coachPersonality === p && styles.segmentTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Shoe Closet</Text>
        {shoes.map(shoe => (
            <View key={shoe.id} style={styles.shoeCard}>
               <View style={{flex: 1}}>
                 <Text style={styles.shoeName}>{shoe.name}</Text>
                 <View style={styles.progressBarBg}>
                   <View style={[styles.progressBarFill, { width: `${Math.min((shoe.mileage / shoe.maxMileage) * 100, 100)}%`, backgroundColor: shoe.mileage > shoe.maxMileage * 0.9 ? theme.colors.primaryRed : theme.colors.primaryGreen }]} />
                 </View>
                 <Text style={styles.shoeMileage}>{shoe.mileage.toFixed(1)} / {shoe.maxMileage} {useMetric ? 'km' : 'mi'}</Text>
               </View>
            </View>
        ))}
        <TouchableOpacity style={styles.addShoeButton} onPress={() => addShoe('New Running Shoe', 500)}>
            <Text style={styles.addShoeText}>+ Add Pair</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>User Profile</Text>

        <View style={styles.rowInputs}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: theme.spacing.sm }]}>
            <Text style={styles.label}>Weight ({useMetric ? 'kg' : 'lbs'})</Text>
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
  helperText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: 4,
    marginBottom: theme.spacing.lg,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  segmentActive: {
    backgroundColor: theme.colors.primaryOrange,
  },
  segmentText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: 'bold',
  },
  shoeCard: {
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
  },
  shoeName: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.skeletonBackground,
    borderRadius: 3,
    marginVertical: 4,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  shoeMileage: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    alignSelf: 'flex-end',
  },
  addShoeButton: {
    padding: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  addShoeText: {
    ...theme.typography.body,
    color: theme.colors.primaryBlue,
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
  }
});
