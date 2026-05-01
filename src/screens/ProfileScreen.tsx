import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import { Card } from '../components/Card';
import { User, Award, Activity, Share, CloudLightning } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';

export default function ProfileScreen() {
  const { userStats, settings, userProfile, setUserProfile } = useStore();

  const handleRichExport = async () => {
    // In a real implementation this would use react-native-view-shot to capture a styled component
    // For now we simulate the interaction pattern
    Alert.alert('Rich Export', 'Generating beautiful Instagram-ready summary image...');
    setTimeout(() => {
        Alert.alert('Ready', 'Image generated! (Simulation)');
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <User size={48} color={theme.colors.primary} />
          </View>
          <Typography variant="h2" style={styles.name}>Athlete</Typography>
          <Typography variant="body" color={theme.colors.textSecondary}>Ready to crush goals</Typography>
        </View>

        <Typography variant="h3" style={styles.sectionTitle}>Lifetime Stats</Typography>

        <View style={styles.statsGrid}>
          <Card style={[styles.statCard, { marginRight: 8 }]}>
            <Activity color={theme.colors.success} size={24} style={styles.icon} />
            <Typography variant="h2">{userStats.totalRuns}</Typography>
            <Typography variant="caption">Total Activities</Typography>
          </Card>

          <Card style={[styles.statCard, { marginLeft: 8 }]}>
             <Award color="#FBBF24" size={24} style={styles.icon} />
             <Typography variant="h2">{userStats.bestStreak}</Typography>
             <Typography variant="caption">Max Streak (Days)</Typography>
          </Card>
        </View>

        <Card style={styles.fullCard}>
          <Typography variant="label">All Time Distance</Typography>
          <View style={{flexDirection: 'row', alignItems: 'baseline', marginTop: 8}}>
            <Typography variant="h1" color={theme.colors.primary}>
              {settings.unit === 'metric' ? userStats.totalKm : (userStats.totalKm * 0.621371).toFixed(1)}
            </Typography>
            <Typography variant="body" style={{marginLeft: 4}}>
              {settings.unit === 'metric' ? 'km' : 'mi'}
            </Typography>
          </View>
        </Card>


        <Typography variant="h3" style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}>About Me</Typography>
        <Card style={styles.fullCard}>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Date of Birth</Typography>
            <TextInput
              style={styles.input}
              value={userProfile?.dob}
              onChangeText={(text) => setUserProfile({ dob: text })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Height</Typography>
            <TextInput
              style={styles.input}
              value={userProfile?.height}
              onChangeText={(text) => setUserProfile({ height: text })}
              placeholder="e.g. 180cm"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Weight</Typography>
            <TextInput
              style={styles.input}
              value={userProfile?.weight}
              onChangeText={(text) => setUserProfile({ weight: text })}
              placeholder="e.g. 75kg"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Typography variant="label" style={styles.label}>Habits & Notes</Typography>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={userProfile?.habits}
              onChangeText={(text) => setUserProfile({ habits: text })}
              placeholder="e.g. Vegetarian, smokes occasionally, sleeps 6 hours"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
            />
          </View>
        </Card>

        <Typography variant="h3" style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}>Social & Context</Typography>

        <Card onPress={handleRichExport} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.lg}}>
          <View>
            <Typography variant="h3">Share Summary</Typography>
            <Typography variant="caption" style={{marginTop: 4}}>Export an image for Instagram</Typography>
          </View>
          <Share color={theme.colors.primary} size={24} />
        </Card>

        <Card style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing.lg, marginTop: 12}}>
          <View>
            <Typography variant="h3">Weather Integration</Typography>
            <Typography variant="caption" style={{marginTop: 4}}>AI Coach uses weather data</Typography>
          </View>
          <CloudLightning color="#FBBF24" size={24} />
        </Card>

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
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.lg,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  name: {
    marginBottom: 4,
  },
  sectionTitle: {
    marginBottom: theme.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  fullCard: {
    padding: theme.spacing.lg,
  },
  icon: {
    marginBottom: theme.spacing.sm,
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
});
