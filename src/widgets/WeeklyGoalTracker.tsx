import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Target } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Typography } from '../components/Typography';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr, mondayOf } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Week-km progress ring against the profile's weekly goal, plus Mon-Sun
 * day-dots for the current week. Week window comes from mondayOf/localDateStr
 * (the old screen hand-rolled Monday math).
 */
export const WeeklyGoalTrackerWidget = memo(function WeeklyGoalTrackerWidget() {
  const activities = useStore((s) => s.activities);
  const weeklyGoalKm = useStore((s) => s.userProfile.weeklyGoalKm);

  // Current week's km + which of its 7 days have at least one activity.
  const { weekKm, dayHasAct } = useMemo(() => {
    const monday = mondayOf(new Date());
    const dayKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      dayKeys.push(localDateStr(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
    }
    let km = 0;
    const active = new Set<string>();
    for (const a of activities) {
      const day = activityDayKey(a);
      // Lexicographic compare works on YYYY-MM-DD keys.
      if (day >= dayKeys[0] && day <= dayKeys[6]) {
        km += a.distance / 1000;
        active.add(day);
      }
    }
    return { weekKm: km, dayHasAct: dayKeys.map((k) => active.has(k)) };
  }, [activities]);

  const goalMet = weekKm >= weeklyGoalKm;
  const pct = Math.min(1, weekKm / Math.max(1, weeklyGoalKm));
  const ringColor = goalMet ? theme.colors.success : familyStyle('activity').accent;
  const ringGradient: [string, string] = goalMet
    ? theme.colors.gradients.success
    : familyStyle('activity').gradient;

  return (
    <WidgetCard
      family={WIDGET_FAMILY.WeeklyGoalTracker}
      title={WIDGET_TITLES.WeeklyGoalTracker}
      icon={Target}
    >
      {!(weeklyGoalKm > 0) ? (
        <EmptyHint
          icon={Target}
          family={WIDGET_FAMILY.WeeklyGoalTracker}
          text="Set a weekly distance goal in your Profile to track progress against it here."
        />
      ) : (
        <>
          <View style={styles.ringRow}>
            <DonutRing
              size={132}
              stroke={12}
              progress={pct}
              color={ringColor}
              gradient={ringGradient}
              trackColor={theme.colors.background}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <AnimatedNumber
                  value={weekKm}
                  decimals={1}
                  style={[styles.ringNum, { color: ringColor }] as any}
                />
              </View>
              <Typography style={styles.ringGoal}>of {weeklyGoalKm} km</Typography>
              <Typography style={[styles.ringPct, { color: ringColor }]}>
                {Math.round(pct * 100)}%
              </Typography>
            </DonutRing>
          </View>
          <View style={styles.dotRow}>
            {dayHasAct.map((has, i) => (
              <View key={i} style={styles.dotCol}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: has ? ringColor : 'transparent',
                      borderColor: has ? ringColor : theme.colors.border,
                    },
                  ]}
                />
                <Typography style={styles.dotLbl}>{DAY_LETTERS[i]}</Typography>
              </View>
            ))}
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  ringRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  ringNum: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  ringGoal: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  ringPct: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  dotCol: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  dotLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
