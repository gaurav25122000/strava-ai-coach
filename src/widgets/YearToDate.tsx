import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';
import { monthlyKmBuckets } from './_format';

/**
 * YTD km ring against the annual goal (weekly goal × 52), elapsed-year vs
 * goal progress tracks, and 12 mini month bars. Strava's own ytd_*_totals
 * are authoritative when athleteStats is cached; otherwise we sum the local
 * activity list for the current year.
 */
export const YearToDateWidget = memo(function YearToDateWidget() {
  const activities = useStore((s) => s.activities);
  const athleteStats = useStore((s) => s.athleteStats);
  const weeklyGoalKm = useStore((s) => s.userProfile.weeklyGoalKm);

  const ytdKm = useMemo(() => {
    // Local history covers EVERY sport type. Strava's ytd_*_totals only roll
    // up run/ride/swim — for a walker that reads as a near-zero year — so the
    // API numbers are only a fallback for the pre-first-sync window.
    if (activities.length > 0) {
      const prefix = `${new Date().getFullYear()}-`;
      return Math.round(
        activities
          .filter((a) => activityDayKey(a).startsWith(prefix))
          .reduce((sum, a) => sum + a.distance / 1000, 0),
      );
    }
    const s = athleteStats?.stats;
    const metres =
      (s?.ytd_run_totals?.distance || 0) +
      (s?.ytd_ride_totals?.distance || 0) +
      (s?.ytd_swim_totals?.distance || 0);
    return Math.round(metres / 1000);
  }, [athleteStats, activities]);

  const months = useMemo(() => monthlyKmBuckets(activities, 12), [activities]);

  const now = new Date();
  const year = now.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const yearLen = isLeap ? 366 : 365;
  const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + 1;
  const yearProgress = dayOfYear / yearLen;

  const annualGoal = Math.max(1, (weeklyGoalKm || 25) * 52);
  const ringPct = Math.min(1, ytdKm / annualGoal);
  const accent = familyStyle('activity').accent;
  const maxMonth = Math.max(...months.map((m) => m.km), 1);
  const hasData = activities.length > 0 || ytdKm > 0;

  return (
    <WidgetCard
      family={WIDGET_FAMILY.YearToDate}
      title={WIDGET_TITLES.YearToDate}
      icon={TrendingUp}
      caption="goal = weekly × 52"
    >
      {!hasData ? (
        <EmptyHint
          icon={TrendingUp}
          family={WIDGET_FAMILY.YearToDate}
          text="No activities yet this year — sync Strava to track your annual distance."
        />
      ) : (
        <>
          <View style={styles.heroRow}>
            <DonutRing
              size={108}
              stroke={10}
              progress={ringPct}
              color={accent}
              gradient={familyStyle('activity').gradient}
              trackColor={theme.colors.background}
            >
              <AnimatedNumber value={ytdKm} style={styles.ringNum as any} />
              <Typography style={styles.ringLbl}>km</Typography>
            </DonutRing>
            <View style={styles.goalCol}>
              <Typography style={styles.goalLbl}>ANNUAL GOAL</Typography>
              <Typography style={styles.goalVal}>{annualGoal} km</Typography>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(yearProgress * 100)}%`,
                      backgroundColor: theme.colors.textSecondary,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(ringPct * 100)}%`,
                      backgroundColor: accent,
                      position: 'absolute',
                    },
                  ]}
                />
              </View>
              <Typography style={styles.progressTxt}>
                Day {dayOfYear} of {yearLen} · {Math.round(ringPct * 100)}% of goal
              </Typography>
            </View>
          </View>
          <View style={styles.barRow}>
            {months.map((m, i) => {
              const h = Math.max(4, (m.km / maxMonth) * 36);
              const isCurrent = i === months.length - 1;
              return (
                <View key={m.key} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      { height: h, backgroundColor: isCurrent ? accent : withAlpha(accent, 'strong') },
                    ]}
                  />
                  <Typography style={styles.barLbl}>{m.label[0]}</Typography>
                </View>
              );
            })}
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ringNum: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  ringLbl: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  goalCol: {
    flex: 1,
    marginLeft: 16,
  },
  goalLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  goalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
    marginTop: 2,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressTxt: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginTop: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    width: '60%',
    borderRadius: 3,
  },
  barLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
