import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl, Text } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import { StreakCounter } from '../components/StreakCounter';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { GoalCard } from '../components/GoalCard';
import { StatCard } from '../components/StatCard';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';

export const OverviewScreen = () => {
  const {
    streak,
    bestStreak,
    lastRunDate,
    hasRunToday,
    totalRuns,
    totalKm,
    bestPace,
    topElevation,
    goals,
    activities,
    fetchDataAndGeneratePlan
  } = useStore();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDataAndGeneratePlan();
    setRefreshing(false);
  };

  // Display top 3 recent runs
  const recentRuns = activities
    .filter(a => a.type === 'Run' || a.type === 'VirtualRun')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  // In a real app we might derive "LONGEST" from the store as well, but for now we calculate it if activities exist, or use a default.
  const longestRun = activities.length > 0
    ? Math.max(...activities.filter(a => a.type === 'Run' || a.type === 'VirtualRun').map(a => a.distance))
    : 0;

  return (
    <View style={styles.container}>
      <Header showProfile={true} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primaryOrange} // iOS
            colors={[theme.colors.primaryOrange]} // Android
          />
        }
      >
        <StreakCounter
          currentStreak={streak}
          bestStreak={bestStreak}
          lastRunDate={lastRunDate}
          hasRunToday={hasRunToday}
        />

        <ActivityHeatmap />

        <View style={styles.goalsContainer}>
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              name={goal.name}
              date={goal.date}
              targetDaysOut={goal.targetDaysOut}
              colorName={goal.color}
              iconName={goal.icon}
            />
          ))}
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard label="TOTAL RUNS" value={totalRuns} colorName="primaryBlue" />
            <StatCard label="TOTAL KM" value={totalKm} unit="km" colorName="primaryOrange" />
          </View>
          <View style={[styles.statsRow, { marginTop: theme.spacing.sm }]}>
            <StatCard label="LONGEST" value={parseFloat(longestRun.toFixed(1))} unit="km" colorName="primaryGreen" />
            <StatCard label="BEST PACE" value={bestPace} colorName="primaryPurple" />
          </View>
          <View style={[styles.statsRow, { marginTop: theme.spacing.sm }]}>
            <StatCard label="TOP ELEV" value={topElevation} unit="m" colorName="primaryOrange" />
            <View style={{ flex: 1, marginRight: theme.spacing.sm }} />
          </View>
        </View>

        {recentRuns.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Activities</Text>
            {recentRuns.map(run => (
              <View key={run.id} style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <Text style={styles.activityType}>{run.type}</Text>
                  <Text style={styles.activityDate}>{format(new Date(run.date), 'MMM dd, yyyy')}</Text>
                </View>
                <View style={styles.activityMetrics}>
                  <Text style={styles.activityMetricText}>{run.distance.toFixed(2)} km</Text>
                  <Text style={styles.activityMetricText}>{run.pace} /km</Text>
                  <Text style={styles.activityMetricText}>{Math.floor(run.duration / 60)} min</Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
    paddingBottom: theme.spacing.xl,
  },
  goalsContainer: {
    marginTop: theme.spacing.sm,
  },
  statsGrid: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recentSection: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  activityCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  activityType: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  activityDate: {
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  activityMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  activityMetricText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primaryOrange,
  }
});
