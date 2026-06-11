import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Beef } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { macrosOn, mealsOn, MEAL_LABELS, MEAL_ORDER } from '../services/calories';
import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';

// Endurance-athlete protein guideline. Falls back to a flat 100 g when the
// profile has no body weight.
const G_PER_KG = 1.6;
const FALLBACK_TARGET_G = 100;

/**
 * Today's protein against a body-weight-scaled target (1.6 g/kg from the
 * Strava-fed profile), with the per-meal split underneath.
 */
export const ProteinTrackerWidget = memo(function ProteinTrackerWidget() {
  const foodLog = useStore((s) => s.foodLog);
  const weight = useStore((s) => s.userProfile.weight);

  const today = localDateStr(new Date());
  const { protein } = useMemo(() => macrosOn(foodLog, today), [foodLog, today]);
  const meals = useMemo(() => mealsOn(foodLog, today), [foodLog, today]);

  const target = weight > 0 ? Math.round(weight * G_PER_KG) : FALLBACK_TARGET_G;
  const fam = familyStyle('health');
  const done = protein >= target;

  const perMeal = MEAL_ORDER.map((m) => ({
    meal: m,
    grams: Math.round(meals[m].reduce((s, e) => s + (e.protein ?? 0), 0)),
  }));
  const maxMeal = Math.max(...perMeal.map((m) => m.grams), 1);

  return (
    <WidgetCard
      family={WIDGET_FAMILY['ProteinTracker']}
      title={WIDGET_TITLES['ProteinTracker']}
      icon={Beef}
      caption={weight > 0 ? `target ${G_PER_KG} g/kg` : 'set weight in Profile for a per-kg target'}
    >
      <View style={styles.row}>
        <DonutRing
          size={104}
          stroke={10}
          progress={target > 0 ? protein / target : 0}
          color={done ? theme.colors.success : fam.accent}
          gradient={done ? undefined : fam.gradient}
          trackColor={withAlpha(fam.accent, 'soft')}
        >
          <AnimatedNumber value={protein} style={styles.ringNum as any} />
          <Typography style={styles.ringUnit}>of {target} g</Typography>
        </DonutRing>
        <View style={styles.mealCol}>
          {perMeal.map((m) => (
            <View key={m.meal} style={styles.mealRow}>
              <Typography style={styles.mealLabel}>{MEAL_LABELS[m.meal]}</Typography>
              <View style={styles.mealTrack}>
                <View
                  style={[
                    styles.mealFill,
                    {
                      backgroundColor: fam.accent,
                      width: `${Math.min(100, (m.grams / maxMeal) * 100)}%` as any,
                    },
                  ]}
                />
              </View>
              <Typography style={styles.mealVal}>{m.grams} g</Typography>
            </View>
          ))}
          <Typography style={[styles.verdict, { color: done ? theme.colors.success : theme.colors.textSecondary }]}>
            {done
              ? 'Target hit — great for recovery'
              : `${Math.max(0, target - protein)} g to go today`}
          </Typography>
        </View>
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringNum: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  ringUnit: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  mealCol: {
    flex: 1,
    gap: 7,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    width: 62,
  },
  mealTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(theme.colors.border, 'soft'),
    overflow: 'hidden',
  },
  mealFill: {
    height: '100%',
    borderRadius: 3,
  },
  mealVal: {
    ...theme.typography.micro,
    color: theme.colors.text,
    width: 36,
    textAlign: 'right',
  },
  verdict: {
    ...theme.typography.micro,
    marginTop: 3,
  },
});
