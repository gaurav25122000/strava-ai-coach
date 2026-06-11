import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Flame, UtensilsCrossed, Scale, ChevronRight } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { burnedOn, eatenOn, macrosOn } from '../services/calories';
import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';

/**
 * Today's energy balance at a glance: intake ring against the daily goal,
 * Strava active burn, and the net. Tapping anywhere opens the tracker.
 */
export const CaloriesTodayWidget = memo(function CaloriesTodayWidget() {
  const foodLog = useStore((s) => s.foodLog);
  const activities = useStore((s) => s.activities);
  const goal = useStore((s) => s.calorieGoal);
  const navigation = useNavigation<any>();

  const today = localDateStr(new Date());
  const { eaten, burned, macros } = useMemo(
    () => ({
      eaten: eatenOn(foodLog, today),
      burned: burnedOn(activities, today),
      macros: macrosOn(foodLog, today),
    }),
    [foodLog, activities, today],
  );

  const net = eaten - burned;
  const remaining = Math.max(0, goal - eaten);
  const over = eaten > goal;
  const fam = familyStyle('health');

  const openTracker = () =>
    navigation.navigate('Menu', { screen: 'CalorieTracker', initial: false });

  return (
    <WidgetCard
      family={WIDGET_FAMILY['CaloriesToday']}
      title={WIDGET_TITLES['CaloriesToday']}
      icon={Flame}
      caption={`goal ${goal} kcal`}
      action={
        <PressableScale onPress={openTracker} hitSlop={theme.hitSlop} accessibilityRole="button" accessibilityLabel="Open calorie tracker">
          <ChevronRight size={18} color={theme.colors.textSecondary} />
        </PressableScale>
      }
    >
      <PressableScale onPress={openTracker} style={styles.row}>
        <DonutRing
          size={112}
          stroke={11}
          progress={goal > 0 ? eaten / goal : 0}
          color={over ? theme.colors.warning : fam.accent}
          gradient={over ? undefined : fam.gradient}
          trackColor={withAlpha(fam.accent, 'soft')}
        >
          <AnimatedNumber value={eaten} style={styles.ringNum as any} />
          <Typography style={styles.ringUnit}>kcal in</Typography>
        </DonutRing>

        <View style={styles.stats}>
          <View style={styles.statRow}>
            <View style={[styles.statIcon, { backgroundColor: withAlpha(theme.colors.families.activity.accent, 'tint') }]}>
              <Flame size={14} color={theme.colors.families.activity.accent} />
            </View>
            <Typography style={styles.statLabel}>Burned</Typography>
            <Typography style={[styles.statVal, { color: theme.colors.families.activity.accent }]}>
              {burned} kcal
            </Typography>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statIcon, { backgroundColor: withAlpha(fam.accent, 'tint') }]}>
              <UtensilsCrossed size={14} color={fam.accent} />
            </View>
            <Typography style={styles.statLabel}>{over ? 'Over goal' : 'Left to eat'}</Typography>
            <Typography style={[styles.statVal, { color: over ? theme.colors.warning : theme.colors.text }]}>
              {over ? `+${eaten - goal}` : remaining} kcal
            </Typography>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statIcon, { backgroundColor: withAlpha(theme.colors.families.recovery.accent, 'tint') }]}>
              <Scale size={14} color={theme.colors.families.recovery.accent} />
            </View>
            <Typography style={styles.statLabel}>Net</Typography>
            <Typography style={styles.statVal}>
              {net >= 0 ? '+' : ''}{net} kcal
            </Typography>
          </View>
          <Typography style={styles.macroLine}>
            P {macros.protein} g · C {macros.carbs} g · F {macros.fat} g
          </Typography>
        </View>
      </PressableScale>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringNum: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  ringUnit: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  stats: {
    flex: 1,
    gap: 9,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  statVal: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  macroLine: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
