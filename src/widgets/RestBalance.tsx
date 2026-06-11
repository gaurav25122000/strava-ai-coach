import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BedDouble } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { activityDayKey, localDateStr } from '../utils/dates';
import { useStore } from '../store/useStore';
import { EmptyHint } from './common';

const WINDOW = 28;

/**
 * Training vs rest days over the last four weeks. Consistency widgets push
 * you to move; this one keeps the other half of the bargain visible —
 * adaptation happens on the days off.
 */
export const RestBalanceWidget = memo(function RestBalanceWidget() {
  const activities = useStore((s) => s.activities);

  const data = useMemo(() => {
    const activeDays = new Set<string>();
    const dayKeys: string[] = [];
    for (let i = WINDOW - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayKeys.push(localDateStr(d));
    }
    const windowStart = dayKeys[0];
    for (const a of activities) {
      const k = activityDayKey(a);
      if (k >= windowStart) activeDays.add(k);
    }
    const active = dayKeys.filter((k) => activeDays.has(k)).length;
    const rest = WINDOW - active;
    const perWeekActive = (active / WINDOW) * 7;
    // Last 7 days as dots, oldest → newest.
    const week = dayKeys.slice(-7).map((k) => activeDays.has(k));
    return { active, rest, perWeekActive, week, any: activeDays.size > 0 };
  }, [activities]);

  const family = WIDGET_FAMILY.RestBalance;
  const accent = familyStyle(family).accent;

  let verdict = {
    line: 'Healthy rhythm — training and recovery are in balance.',
    color: theme.colors.success,
  };
  if (data.perWeekActive >= 6.5) {
    verdict = {
      line: 'Almost no days off in 4 weeks — plan a real rest day this week.',
      color: theme.colors.warning,
    };
  } else if (data.perWeekActive < 2) {
    verdict = {
      line: 'Plenty of rest banked — your body is ready for more.',
      color: theme.colors.info,
    };
  }

  return (
    <WidgetCard
      family={family}
      title={WIDGET_TITLES.RestBalance}
      icon={BedDouble}
      caption={`last ${WINDOW} days`}
    >
      {!data.any ? (
        <EmptyHint
          icon={BedDouble}
          family={family}
          text="Sync some training and this card will keep your rest days honest too."
        />
      ) : (
        <>
          <View style={styles.heroRow}>
            <View style={styles.stat}>
              <Typography style={[styles.statVal, { color: accent }]}>{data.active}</Typography>
              <Typography style={styles.statLbl}>training days</Typography>
            </View>
            <View style={styles.stat}>
              <Typography style={styles.statVal}>{data.rest}</Typography>
              <Typography style={styles.statLbl}>rest days</Typography>
            </View>
            <View style={styles.stat}>
              <Typography style={styles.statVal}>{data.perWeekActive.toFixed(1)}</Typography>
              <Typography style={styles.statLbl}>active / week</Typography>
            </View>
          </View>

          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round((data.active / WINDOW) * 100)}%`, backgroundColor: accent },
              ]}
            />
          </View>

          <View style={styles.weekRow}>
            {data.week.map((on, i) => (
              <View
                key={i}
                style={[
                  styles.dayDot,
                  {
                    backgroundColor: on ? accent : withAlpha(theme.colors.border, 'heavy'),
                  },
                ]}
              />
            ))}
            <Typography style={styles.weekLbl}>last 7 days</Typography>
          </View>

          <Typography style={[styles.verdict, { color: verdict.color }]}>{verdict.line}</Typography>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.4,
  },
  statLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    marginBottom: 12,
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  dayDot: {
    width: 14,
    height: 14,
    borderRadius: 5,
  },
  weekLbl: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  verdict: {
    ...theme.typography.footnote,
    fontWeight: '700',
  },
});
