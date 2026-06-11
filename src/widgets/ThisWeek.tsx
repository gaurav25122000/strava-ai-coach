import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CalendarDays, Flame, TrendingDown, TrendingUp } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr, mondayIndex, mondayOf, weekKey } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint, MetricBlock } from './common';
import { activityWeekKey, formatDuration } from './_format';
import { StatChip, bigStat } from './_shared';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * This week's volume at a glance: big km count-up, trend chip vs last week,
 * time/elevation/days/activities metric blocks, a trailing-7-day mini bar
 * row, and a kcal chip ('~'-prefixed when any summed activity's calories were
 * estimated rather than reported by Strava).
 */
export const ThisWeekWidget = memo(function ThisWeekWidget() {
  const activities = useStore((s) => s.activities);
  const weeklyGoalKm = useStore((s) => s.userProfile.weeklyGoalKm);

  // One pass: this week's stats + last week's km for the trend chip.
  const stats = useMemo(() => {
    const now = new Date();
    const thisWeek = weekKey(now);
    const monday = mondayOf(now);
    const lastWeek = localDateStr(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7),
    );
    let km = 0;
    let time = 0;
    let elev = 0;
    let count = 0;
    let lastKm = 0;
    let calories = 0;
    let anyEstimated = false;
    const days = new Set<string>();
    for (const a of activities) {
      const wk = activityWeekKey(a);
      if (wk === thisWeek) {
        km += a.distance / 1000;
        time += a.movingTime;
        elev += a.totalElevationGain;
        count++;
        days.add(activityDayKey(a));
        if (a.calories) {
          calories += a.calories;
          if (a.caloriesEstimated) anyEstimated = true;
        }
      } else if (wk === lastWeek) {
        lastKm += a.distance / 1000;
      }
    }
    return {
      km,
      time,
      elev: Math.round(elev),
      count,
      days: days.size,
      lastKm,
      calories: Math.round(calories),
      anyEstimated,
    };
  }, [activities]);

  // Trailing 7 days of km for the mini bar row.
  const last7 = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const a of activities) {
      const k = activityDayKey(a);
      byDay.set(k, (byDay.get(k) ?? 0) + a.distance / 1000);
    }
    const today = new Date();
    const out: { label: string; km: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      out.push({ label: DAY_LETTERS[mondayIndex(d)], km: byDay.get(localDateStr(d)) ?? 0 });
    }
    return out;
  }, [activities]);

  const accent = familyStyle('activity').accent;
  const up = stats.km >= stats.lastKm;
  const trendColor = up ? theme.colors.success : theme.colors.error;
  const maxKm = Math.max(...last7.map((d) => d.km), 1);

  // Weekly-goal ring, absorbed from the retired Weekly Goal Tracker widget.
  const hasGoal = weeklyGoalKm > 0;
  const goalPct = hasGoal ? Math.min(1, stats.km / Math.max(1, weeklyGoalKm)) : 0;
  const goalMet = hasGoal && stats.km >= weeklyGoalKm;
  const ringColor = goalMet ? theme.colors.success : accent;

  return (
    <WidgetCard family={WIDGET_FAMILY.ThisWeek} title={WIDGET_TITLES.ThisWeek} icon={CalendarDays}>
      {activities.length === 0 ? (
        <EmptyHint
          icon={CalendarDays}
          family={WIDGET_FAMILY.ThisWeek}
          text="No activities yet — sync Strava in Settings to see your weekly stats."
        />
      ) : (
        <>
          {hasGoal ? (
            <View style={styles.goalRow}>
              <DonutRing
                size={108}
                stroke={11}
                progress={goalPct}
                color={ringColor}
                gradient={goalMet ? theme.colors.gradients.success : familyStyle('activity').gradient}
                trackColor={theme.colors.background}
              >
                <AnimatedNumber value={stats.km} decimals={1} style={styles.ringNum as any} />
                <Typography style={styles.ringGoal}>of {weeklyGoalKm} km</Typography>
                <Typography style={[styles.ringPct, { color: ringColor }]}>
                  {Math.round(goalPct * 100)}%
                </Typography>
              </DonutRing>
              <View style={styles.goalCol}>
                <StatChip
                  color={trendColor}
                  icon={up ? TrendingUp : TrendingDown}
                  label={`${stats.lastKm.toFixed(1)} km last wk`}
                />
                <View style={styles.goalMetrics}>
                  <MetricBlock label="Time" value={formatDuration(stats.time)} />
                  <MetricBlock label="Days" value={`${stats.days}`} />
                </View>
                <View style={styles.goalMetrics}>
                  <MetricBlock label="Elev" value={`${stats.elev} m`} />
                  <MetricBlock label="Acts" value={`${stats.count}`} />
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={bigStat.row}>
                <View style={bigStat.numWrap}>
                  <AnimatedNumber
                    value={stats.km}
                    decimals={1}
                    style={[bigStat.num, { color: accent }] as any}
                  />
                  <Typography style={bigStat.unit}>km</Typography>
                </View>
                <StatChip
                  color={trendColor}
                  icon={up ? TrendingUp : TrendingDown}
                  label={`${stats.lastKm.toFixed(1)} km last wk`}
                />
              </View>
              <View style={styles.metricRow}>
                <MetricBlock label="Time" value={formatDuration(stats.time)} />
                <MetricBlock label="Elevation" value={`${stats.elev} m`} />
                <MetricBlock label="Days active" value={`${stats.days}`} />
                <MetricBlock label="Activities" value={`${stats.count}`} />
              </View>
            </>
          )}
          <View style={styles.dayRow}>
            {last7.map((d, i) => {
              const has = d.km > 0;
              const h = has ? Math.max(6, (d.km / maxKm) * 28) : 4;
              return (
                <View key={i} style={styles.dayCol}>
                  <View
                    style={[
                      styles.dayBar,
                      { height: h, backgroundColor: has ? accent : theme.colors.border },
                    ]}
                  />
                  <Typography style={styles.dayLbl}>{d.label}</Typography>
                </View>
              );
            })}
          </View>
          {stats.calories > 0 && (
            <View style={styles.kcalRow}>
              <View style={[styles.kcalChip, { backgroundColor: withAlpha(theme.colors.warning, 'tint') }]}>
                <Flame color={theme.colors.warning} size={11} />
                <Typography style={styles.kcalTxt}>
                  {stats.anyEstimated ? '~' : ''}
                  {stats.calories} kcal
                </Typography>
              </View>
            </View>
          )}
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  goalCol: {
    flex: 1,
    gap: 8,
    alignItems: 'flex-start',
  },
  goalMetrics: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  ringNum: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  ringGoal: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  ringPct: {
    fontSize: 10,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  dayBar: {
    width: 14,
    borderRadius: 4,
  },
  dayLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  kcalRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  kcalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  kcalTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text,
  },
});
