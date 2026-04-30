import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { theme } from '../constants/theme';
import { Header } from '../components/Header';
import { StreakCounter } from '../components/StreakCounter';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { GoalCard } from '../components/GoalCard';
import { StatCard } from '../components/StatCard';
import { useStore } from '../store/useStore';

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
    goals
  } = useStore();

  return (
    <View style={styles.container}>
      <Header showProfile={true} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
            <StatCard label="LONGEST" value={21.3} unit="km" colorName="primaryGreen" />
            <StatCard label="BEST PACE" value={bestPace} colorName="primaryPurple" />
          </View>
          <View style={[styles.statsRow, { marginTop: theme.spacing.sm }]}>
            <StatCard label="TOP ELEV" value={topElevation} unit="m" colorName="primaryOrange" />
            <View style={{ flex: 1, marginRight: theme.spacing.sm }} /> {/* Empty placeholder for grid balance */}
          </View>
        </View>
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
  }
});
