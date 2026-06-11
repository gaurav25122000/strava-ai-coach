import React, { memo, useMemo } from 'react';
import { PieChart } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { ChartDonut } from '../components/charts/ChartDonut';
import { EmptyHint } from './common';
import { theme } from '../theme';
import { WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { calorieWeekSeries, macrosOn } from '../services/calories';
import { useStore } from '../store/useStore';
import { StyleSheet } from 'react-native';

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
        <ChartDonut
          data={data}
          size={150}
          formatValue={(v) => `${Math.round(v)} kcal`}
        >
          <Typography style={styles.centerNum}>{Math.round(totalKcal / 7)}</Typography>
          <Typography style={styles.centerSub}>kcal/day avg</Typography>
        </ChartDonut>
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
});
