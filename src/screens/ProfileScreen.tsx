import React from 'react';
import { View, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { theme } from '../theme';
import { Typography } from '../components/Typography';
import { useStore } from '../store/useStore';
import { Card } from '../components/Card';
import { User, Award, Activity } from 'lucide-react-native';

export default function ProfileScreen() {
  const { userStats } = useStore();

  return (
    <SafeAreaView style={styles.container}>
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
            <Typography variant="h1" color={theme.colors.primary}>{userStats.totalKm}</Typography>
            <Typography variant="body" style={{marginLeft: 4}}>km</Typography>
          </View>
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
  }
});
