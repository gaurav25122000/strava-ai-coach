import React from 'react';
import { View, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Typography } from '../components/Typography';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { useStore } from '../store/useStore';
import { CheckCircle2, Flame, PersonStanding } from 'lucide-react-native';

import { useMemo } from 'react';

export default function OverviewScreen() {
  const { userStats, goals, activities } = useStore();

  const heatmapData = useMemo(() => {
    // Map activities to heatmap levels based on distance
    return activities.map(act => {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      const km = act.distance / 1000;
      if (km > 0) level = 1;
      if (km > 5) level = 2;
      if (km > 10) level = 3;
      if (km > 20) level = 4;
      return { date: act.startDate, level };
    });
  }, [activities]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Top Header Section */}
        <View style={styles.header}>
          <Typography variant="label">Current Streak</Typography>
          <View style={styles.streakRow}>
            <Typography style={styles.streakNumber}>{userStats.currentStreak}</Typography>
            <Typography variant="h2" style={styles.streakText}>days</Typography>
          </View>
          <View style={styles.statusRow}>
            <CheckCircle2 size={16} color={theme.colors.success} />
            <Typography variant="caption" color={theme.colors.success} style={styles.statusText}>
              Already ran today
            </Typography>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Typography variant="label">Best Streak</Typography>
            <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
              <Typography variant="h2" color={theme.colors.accent}>{userStats.bestStreak}</Typography>
              <Typography variant="caption" style={{marginLeft: 4}}>days</Typography>
            </View>
          </View>
          <View style={styles.statItem}>
            <Typography variant="label">Last Run</Typography>
            <Typography variant="h3" style={{marginTop: 4}}>{userStats.lastRunDate}</Typography>
          </View>
        </View>

        {/* Heatmap Card */}
        <Card style={styles.card}>
          <HeatmapCalendar data={heatmapData} />
        </Card>

        {/* Goals List */}
        {goals.map(goal => (
          <Card key={goal.id} style={[styles.card, { borderTopWidth: 2, borderTopColor: goal.id === '1' ? theme.colors.error : theme.colors.secondary }]}>
            <View style={styles.goalRow}>
              <View style={styles.goalIcon}>
                {goal.id === '1' ? <Flame color={theme.colors.error} size={24}/> : <PersonStanding color={theme.colors.secondary} size={24}/>}
              </View>
              <View style={styles.goalInfo}>
                <Typography variant="h3" color={goal.id === '1' ? theme.colors.error : theme.colors.secondary}>{goal.title}</Typography>
                <Typography variant="caption">{goal.targetDate}</Typography>
              </View>
              <View style={styles.goalDays}>
                <Typography variant="h2" color={goal.id === '1' ? theme.colors.error : theme.colors.secondary}>{goal.daysRemaining}</Typography>
                <Typography variant="caption">days</Typography>
              </View>
            </View>
          </Card>
        ))}

        {/* Bottom Stats Grid */}
        <View style={styles.statsGrid}>
          <Card style={[styles.gridCard, {flex: 1, marginRight: 8}]}>
            <Typography variant="label">Total Runs</Typography>
            <Typography variant="h2" color="#3B82F6" style={styles.gridStat}>{userStats.totalRuns}</Typography>
          </Card>
          <Card style={[styles.gridCard, {flex: 1, marginLeft: 8}]}>
            <Typography variant="label">Total KM</Typography>
            <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
              <Typography variant="h2" color={theme.colors.primary} style={styles.gridStat}>{userStats.totalKm}</Typography>
              <Typography variant="body" color={theme.colors.textSecondary} style={{marginLeft: 4}}>km</Typography>
            </View>
          </Card>
        </View>

        <View style={styles.statsGrid}>
          <Card style={[styles.gridCard, {flex: 1, marginRight: 8}]}>
            <Typography variant="label">Longest</Typography>
            <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
              <Typography variant="h2" color={theme.colors.success} style={styles.gridStat}>21.3</Typography>
              <Typography variant="body" color={theme.colors.textSecondary} style={{marginLeft: 4}}>km</Typography>
            </View>
          </Card>
          <Card style={[styles.gridCard, {flex: 1, marginLeft: 8}]}>
            <Typography variant="label">Best Pace</Typography>
            <Typography variant="h2" color={theme.colors.accent} style={styles.gridStat}>{userStats.bestPace}</Typography>
          </Card>
        </View>

        <Card style={styles.gridCard}>
          <Typography variant="label">Top Elev</Typography>
          <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
             <Typography variant="h2" color="#FBBF24" style={styles.gridStat}>{userStats.topElev}</Typography>
             <Typography variant="body" color={theme.colors.textSecondary} style={{marginLeft: 4}}>m</Typography>
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
    marginBottom: theme.spacing.lg,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: theme.spacing.xs,
  },
  streakNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    color: theme.colors.primary,
    lineHeight: 72,
  },
  streakText: {
    marginLeft: theme.spacing.sm,
    color: theme.colors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  statusText: {
    marginLeft: theme.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xl,
  },
  statItem: {
    flex: 1,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalIcon: {
    marginRight: theme.spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalDays: {
    alignItems: 'flex-end',
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  gridCard: {
    marginBottom: 0,
    padding: theme.spacing.lg,
  },
  gridStat: {
    marginTop: theme.spacing.sm,
  }
});
