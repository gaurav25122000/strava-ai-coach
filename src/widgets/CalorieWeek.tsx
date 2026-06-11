import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart3 } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { EmptyHint } from './common';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { calorieWeekSeries } from '../services/calories';
import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';

const CHART_H = 110;

/**
 * Seven days of intake (health green) vs Strava active burn (activity orange)
 * as paired bars — the week's energy balance in one glance.
 */
export const CalorieWeekWidget = memo(function CalorieWeekWidget() {
  const foodLog = useStore((s) => s.foodLog);
  const activities = useStore((s) => s.activities);

  const days = useMemo(() => calorieWeekSeries(foodLog, activities), [foodLog, activities]);
  const max = Math.max(...days.map((d) => Math.max(d.eaten, d.burned)), 1);
  const hasData = days.some((d) => d.eaten > 0 || d.burned > 0);

  const eatenFam = familyStyle('health');
  const burnFam = familyStyle('activity');
  const today = localDateStr(new Date());

  const avgEaten = Math.round(days.reduce((s, d) => s + d.eaten, 0) / days.length);
  const avgBurned = Math.round(days.reduce((s, d) => s + d.burned, 0) / days.length);

  return (
    <WidgetCard
      family={WIDGET_FAMILY['CalorieWeek']}
      title={WIDGET_TITLES['CalorieWeek']}
      icon={BarChart3}
      caption="eaten vs burned"
    >
      {!hasData ? (
        <EmptyHint
          icon={BarChart3}
          family="health"
          text="Log meals in the Calorie Tracker to see your weekly energy balance."
        />
      ) : (
        <>
          <View style={styles.chart}>
            {days.map((d) => {
              const isToday = d.day === today;
              return (
                <View key={d.day} style={styles.dayCol}>
                  <View style={styles.barsRow}>
                    <View style={styles.barTrack}>
                      <LinearGradient
                        colors={eatenFam.gradient}
                        start={{ x: 0, y: 1 }}
                        end={{ x: 0, y: 0 }}
                        style={[styles.bar, { height: Math.max(3, (d.eaten / max) * CHART_H) }]}
                      />
                    </View>
                    <View style={styles.barTrack}>
                      <LinearGradient
                        colors={burnFam.gradient}
                        start={{ x: 0, y: 1 }}
                        end={{ x: 0, y: 0 }}
                        style={[styles.bar, { height: Math.max(3, (d.burned / max) * CHART_H) }]}
                      />
                    </View>
                  </View>
                  <Typography style={[styles.dayLabel, isToday && { color: eatenFam.accent, fontFamily: theme.fonts.bold }]}>
                    {d.label}
                  </Typography>
                </View>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: eatenFam.accent }]} />
              <Typography style={styles.legendTxt}>Eaten · avg {avgEaten} kcal</Typography>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: burnFam.accent }]} />
              <Typography style={styles.legendTxt}>Burned · avg {avgBurned} kcal</Typography>
            </View>
          </View>
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: CHART_H + 26,
    paddingHorizontal: 2,
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: CHART_H,
  },
  barTrack: {
    width: 9,
    height: CHART_H,
    justifyContent: 'flex-end',
    borderRadius: 5,
    backgroundColor: withAlpha(theme.colors.border, 'soft'),
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 5,
  },
  dayLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTxt: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
