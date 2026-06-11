import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Fuel, Flame, UtensilsCrossed } from 'lucide-react-native';
import { WidgetCard } from '../components/WidgetCard';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { theme, withAlpha } from '../theme';
import { familyStyle, WIDGET_FAMILY, WIDGET_TITLES } from '../utils/widgetFamilies';
import { prescriptionFor } from '../services/goalProgress';
import { eatenOn } from '../services/calories';
import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';

// Flat-terrain running cost ≈ 1.0 kcal per kg per km; walking ≈ 0.55. Used
// only as a planning estimate — actual burn comes from Strava post-workout.
const RUN_KCAL_PER_KG_KM = 1.0;
const FALLBACK_WEIGHT_KG = 70;

/**
 * Marries the AI training plan with the calorie tracker: estimates today's
 * prescribed-workout burn from body weight and tells the athlete how to fuel
 * around it (eat more on big days, hold the line on rest days).
 */
export const FuelForecastWidget = memo(function FuelForecastWidget() {
  const goals = useStore((s) => s.goals);
  const foodLog = useStore((s) => s.foodLog);
  const weight = useStore((s) => s.userProfile.weight);
  const calorieGoal = useStore((s) => s.calorieGoal);
  const navigation = useNavigation<any>();

  const today = new Date();
  const todayKey = localDateStr(today);

  const presc = useMemo(() => {
    for (const g of goals) {
      const p = prescriptionFor(g, today, today);
      if (p) return p;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, todayKey]);

  const kg = weight > 0 ? weight : FALLBACK_WEIGHT_KG;
  const eaten = eatenOn(foodLog, todayKey);
  const fam = familyStyle('plan');
  const healthFam = familyStyle('health');

  let workoutLine: string;
  let estBurn = 0;
  let advice: string;

  if (!presc || presc.kind === 'REST') {
    workoutLine = presc?.rest ? `Rest day — ${presc.rest.note}` : 'Rest day';
    advice = `Maintenance day: aim for your ${calorieGoal} kcal goal, lean on protein.`;
  } else {
    const km = presc.distanceKm ?? 0;
    estBurn = km > 0
      ? Math.round(km * kg * RUN_KCAL_PER_KG_KM)
      : Math.round(((presc.durationMin ?? 45) / 60) * kg * 7); // ~7 kcal/kg/h tempo effort
    workoutLine = presc.title;
    advice = estBurn >= 600
      ? `Big session (~${estBurn} kcal): add ~${Math.round(estBurn * 0.5)} kcal, carbs before, protein after.`
      : `Moderate session (~${estBurn} kcal): your normal ${calorieGoal} kcal goal covers it.`;
  }

  return (
    <WidgetCard
      family={WIDGET_FAMILY['FuelForecast']}
      title={WIDGET_TITLES['FuelForecast']}
      icon={Fuel}
      caption="today's plan × calories"
    >
      <View style={styles.body}>
        <View style={styles.statRow}>
          <View style={[styles.iconBox, { backgroundColor: withAlpha(fam.accent, 'tint') }]}>
            <Flame size={15} color={fam.accent} />
          </View>
          <View style={styles.statBody}>
            <Typography style={styles.statTitle} numberOfLines={1}>{workoutLine}</Typography>
            <Typography style={styles.statSub}>
              {estBurn > 0 ? `~${estBurn} kcal planned burn` : 'no extra burn planned'}
            </Typography>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={[styles.iconBox, { backgroundColor: withAlpha(healthFam.accent, 'tint') }]}>
            <UtensilsCrossed size={15} color={healthFam.accent} />
          </View>
          <View style={styles.statBody}>
            <Typography style={styles.statTitle}>
              {eaten} / {calorieGoal + estBurn} kcal
            </Typography>
            <Typography style={styles.statSub}>eaten vs today's fueled target</Typography>
          </View>
        </View>
        <PressableScale
          onPress={() => navigation.navigate('Menu', { screen: 'CalorieTracker', initial: false })}
          style={[styles.advice, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
          accessibilityRole="button"
          accessibilityLabel="Open calorie tracker"
        >
          <Typography style={[styles.adviceTxt, { color: fam.accent }]}>{advice}</Typography>
        </PressableScale>
      </View>
    </WidgetCard>
  );
});

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBody: {
    flex: 1,
  },
  statTitle: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  statSub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  advice: {
    borderRadius: 12,
    padding: 11,
  },
  adviceTxt: {
    ...theme.typography.micro,
    lineHeight: 16,
  },
});
