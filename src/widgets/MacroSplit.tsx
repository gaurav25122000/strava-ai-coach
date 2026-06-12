import React, { memo, useMemo } from 'react';
import { PieChart } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { ChartDonut } from '../components/charts/ChartDonut';
import { EmptyHint } from './common';
import { theme } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { calorieWeekSeries, macrosOn, macroTargets } from '../services/calories';
import { useStore } from '../store/useStore';
import { StyleSheet, View } from 'react-native';

// kcal per gram of each macro — converts the gram split into energy share.
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const MACRO_COLORS = {
  protein: '#67E8F9',
  carbs: '#FCD34D',
  fat: '#FDA4AF',
} as const;

/**
 * Where the week's calories came from: 7-day macro energy split as a donut.
 * Uses kcal contribution (protein/carbs ×4, fat ×9), not raw grams, so the
 * chart reflects energy rather than weight.
 */
export const MacroSplitWidget = memo(function MacroSplitWidget() {
  const foodLog = useStore((s) => s.foodLog);
  const macroGoals = useStore((s) => s.macroGoals);
  const weight = useStore((s) => s.userProfile.weight);
  const calorieGoal = useStore((s) => s.calorieGoal);

  const totals = useMemo(() => {
    const days = calorieWeekSeries(foodLog, [], 7);
    const sum = { protein: 0, carbs: 0, fat: 0 };
    for (const d of days) {
      const m = macrosOn(foodLog, d.day);
      sum.protein += m.protein;
      sum.carbs += m.carbs;
      sum.fat += m.fat;
    }
    return sum;
  }, [foodLog]);

  const kcal = {
    protein: totals.protein * KCAL_PER_G.protein,
    carbs: totals.carbs * KCAL_PER_G.carbs,
    fat: totals.fat * KCAL_PER_G.fat,
  };
  const totalKcal = kcal.protein + kcal.carbs + kcal.fat;

  const data = [
    { label: 'Carbs', value: kcal.carbs, color: MACRO_COLORS.carbs },
    { label: 'Protein', value: kcal.protein, color: MACRO_COLORS.protein },
    { label: 'Fat', value: kcal.fat, color: MACRO_COLORS.fat },
  ].filter((d) => d.value > 0);

  const targets = macroTargets({ weight }, macroGoals, calorieGoal);
  const hasCustom = targets.custom.protein || targets.custom.carbs || targets.custom.fat;
  const fam = familyStyle(WIDGET_FAMILY['MacroSplit']);
  // Daily averages vs daily targets. Only the harmful direction warns:
  // protein under target, fat over target. Carbs has no bad direction here.
  const avg = {
    protein: Math.round(totals.protein / 7),
    fat: Math.round(totals.fat / 7),
  };
  const tint = {
    protein: avg.protein < targets.protein ? theme.colors.warning : fam.accent,
    carbs: fam.accent,
    fat: avg.fat > targets.fat ? theme.colors.warning : fam.accent,
  };

  return (
    <WidgetCard
      family={WIDGET_FAMILY['MacroSplit']}
      title={WIDGET_TITLES['MacroSplit']}
      icon={PieChart}
      caption="energy share · last 7 days"
    >
      {totalKcal === 0 ? (
        <EmptyHint
          icon={PieChart}
          family="health"
          text="Log meals with macros to see where your calories come from."
        />
      ) : (
        <>
          <ChartDonut
            data={data}
            size={150}
            formatValue={(v) => `${Math.round(v)} kcal`}
          >
            <Typography style={styles.centerNum}>{Math.round(totalKcal / 7)}</Typography>
            <Typography style={styles.centerSub}>kcal/day avg</Typography>
          </ChartDonut>
          {hasCustom && (
            <View style={styles.targetRow}>
              <Typography style={[styles.targetItem, { color: tint.protein }]}>
                P {targets.protein}g
              </Typography>
              <Typography style={styles.targetSep}>·</Typography>
              <Typography style={[styles.targetItem, { color: tint.carbs }]}>
                C {targets.carbs}g
              </Typography>
              <Typography style={styles.targetSep}>·</Typography>
              <Typography style={[styles.targetItem, { color: tint.fat }]}>
                F {targets.fat}g
              </Typography>
              <Typography style={styles.targetSep}>goals</Typography>
            </View>
          )}
        </>
      )}
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  centerNum: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  centerSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  targetItem: {
    ...theme.typography.micro,
    fontFamily: theme.fonts.bold,
  },
  targetSep: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
});
