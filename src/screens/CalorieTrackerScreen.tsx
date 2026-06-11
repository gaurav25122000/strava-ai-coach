import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Coffee, Cookie, Flame, Pencil, Plus,
  Sandwich, Scale, Trash2, UtensilsCrossed, LucideIcon,
} from 'lucide-react-native';
import { Typography } from '../components/Typography';
import { PressableScale } from '../components/PressableScale';
import { DonutRing } from '../components/DonutRing';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { FieldBlock } from '../components/SheetUI';
import { StaggerItem } from '../components/Stagger';
import { theme, withAlpha } from '../theme';
import { familyStyle } from '../utils/widgetFamilies';
import { localDateStr } from '../utils/dates';
import {
  burnedOn, eatenOn, macrosOn, mealsOn, MEAL_LABELS, MEAL_ORDER, defaultMealForNow,
} from '../services/calories';
import { MealType, useStore } from '../store/useStore';

const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: UtensilsCrossed,
  snack: Cookie,
};

function dayTitle(dayKey: string, today: string): string {
  if (dayKey === today) return 'Today';
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  if (dayKey === yesterday) return 'Yesterday';
  return format(parseISO(dayKey), 'EEE, d MMM');
}

/**
 * The calorie tracker home: per-day energy balance (intake ring vs goal,
 * Strava burn, net), macro totals, and the day's food log grouped by meal.
 * Day navigation lets the athlete audit and backfill earlier days.
 */
export default function CalorieTrackerScreen({ navigation }: any) {
  const foodLog = useStore((s) => s.foodLog);
  const activities = useStore((s) => s.activities);
  const goal = useStore((s) => s.calorieGoal);
  const setCalorieGoal = useStore((s) => s.setCalorieGoal);
  const removeFoodEntry = useStore((s) => s.removeFoodEntry);

  const today = localDateStr(new Date());
  const [dayKey, setDayKey] = useState(today);
  const [goalSheet, setGoalSheet] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(goal));

  const fam = familyStyle('health');
  const burnFam = familyStyle('activity');

  const { eaten, burned, macros, meals } = useMemo(
    () => ({
      eaten: eatenOn(foodLog, dayKey),
      burned: burnedOn(activities, dayKey),
      macros: macrosOn(foodLog, dayKey),
      meals: mealsOn(foodLog, dayKey),
    }),
    [foodLog, activities, dayKey],
  );

  const net = eaten - burned;
  const over = eaten > goal;
  const remaining = Math.max(0, goal - eaten);

  const shiftDay = (delta: number) => {
    const d = parseISO(dayKey);
    d.setDate(d.getDate() + delta);
    const next = localDateStr(d);
    if (next > today) return;
    setDayKey(next);
  };

  const openAdd = (meal?: MealType) =>
    navigation.navigate('AddFood', { date: dayKey, meal: meal ?? defaultMealForNow() });

  const saveGoal = () => {
    const v = parseInt(goalDraft, 10);
    if (!Number.isFinite(v) || v < 800 || v > 8000) {
      useStore.getState().setToast({
        title: 'Goal out of range',
        message: 'Pick a daily goal between 800 and 8,000 kcal.',
        type: 'error',
      });
      return;
    }
    setCalorieGoal(v);
    setGoalSheet(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          hitSlop={theme.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </PressableScale>
        <Typography style={styles.headerTitle}>Calorie Tracker</Typography>
        <View style={{ width: 24 }} />
      </View>

      {/* Day switcher */}
      <View style={styles.dayRow}>
        <PressableScale onPress={() => shiftDay(-1)} hitSlop={theme.hitSlop} accessibilityLabel="Previous day">
          <ChevronLeft size={20} color={theme.colors.textSecondary} />
        </PressableScale>
        <Typography style={styles.dayTitle}>{dayTitle(dayKey, today)}</Typography>
        <PressableScale
          onPress={() => shiftDay(1)}
          hitSlop={theme.hitSlop}
          accessibilityLabel="Next day"
          style={{ opacity: dayKey === today ? 0.25 : 1 }}
        >
          <ChevronRight size={20} color={theme.colors.textSecondary} />
        </PressableScale>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Energy balance card */}
        <StaggerItem index={0}>
          <View style={styles.balanceCard}>
            <DonutRing
              size={132}
              stroke={13}
              progress={goal > 0 ? eaten / goal : 0}
              color={over ? theme.colors.warning : fam.accent}
              gradient={over ? undefined : fam.gradient}
              trackColor={withAlpha(fam.accent, 'soft')}
            >
              <AnimatedNumber value={over ? eaten - goal : remaining} style={styles.ringNum as any} />
              <Typography style={styles.ringUnit}>{over ? 'kcal over' : 'kcal left'}</Typography>
            </DonutRing>
            <View style={styles.balanceStats}>
              <View style={styles.balanceRow}>
                <UtensilsCrossed size={15} color={fam.accent} />
                <Typography style={styles.balanceLabel}>Eaten</Typography>
                <Typography style={styles.balanceVal}>{eaten}</Typography>
              </View>
              <View style={styles.balanceRow}>
                <Flame size={15} color={burnFam.accent} />
                <Typography style={styles.balanceLabel}>Burned</Typography>
                <Typography style={styles.balanceVal}>{burned}</Typography>
              </View>
              <View style={styles.balanceRow}>
                <Scale size={15} color={theme.colors.families.recovery.accent} />
                <Typography style={styles.balanceLabel}>Net</Typography>
                <Typography style={styles.balanceVal}>{net >= 0 ? `+${net}` : net}</Typography>
              </View>
              <PressableScale
                onPress={() => { setGoalDraft(String(goal)); setGoalSheet(true); }}
                style={[styles.goalChip, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                accessibilityRole="button"
                accessibilityLabel="Edit daily goal"
              >
                <Typography style={[styles.goalChipTxt, { color: fam.accent }]}>
                  Goal {goal} kcal
                </Typography>
                <Pencil size={12} color={fam.accent} />
              </PressableScale>
            </View>
          </View>
        </StaggerItem>

        {/* Macros */}
        <StaggerItem index={1}>
          <View style={styles.macroCard}>
            {([
              ['Protein', macros.protein, '#67E8F9'],
              ['Carbs', macros.carbs, '#FCD34D'],
              ['Fat', macros.fat, '#FDA4AF'],
            ] as const).map(([label, grams, color]) => (
              <View key={label} style={styles.macroCol}>
                <Typography style={[styles.macroVal, { color }]}>{grams} g</Typography>
                <Typography style={styles.macroLabel}>{label}</Typography>
              </View>
            ))}
          </View>
        </StaggerItem>

        {/* Meals */}
        {MEAL_ORDER.map((meal, i) => {
          const entries = meals[meal];
          const mealKcal = Math.round(entries.reduce((s, e) => s + e.calories, 0));
          const MealIcon = MEAL_ICONS[meal];
          return (
            <StaggerItem key={meal} index={i + 2}>
              <View style={styles.mealCard}>
                <View style={styles.mealHeader}>
                  <View style={[styles.mealIcon, { backgroundColor: withAlpha(fam.accent, 'tint') }]}>
                    <MealIcon size={15} color={fam.accent} />
                  </View>
                  <Typography style={styles.mealTitle}>{MEAL_LABELS[meal]}</Typography>
                  {mealKcal > 0 && (
                    <Typography style={styles.mealKcal}>{mealKcal} kcal</Typography>
                  )}
                  <PressableScale
                    onPress={() => openAdd(meal)}
                    style={[styles.mealAdd, { backgroundColor: withAlpha(fam.accent, 'tint') }]}
                    hitSlop={theme.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={`Add to ${MEAL_LABELS[meal]}`}
                  >
                    <Plus size={15} color={fam.accent} />
                  </PressableScale>
                </View>
                {entries.length === 0 ? (
                  <Typography style={styles.mealEmpty}>Nothing logged yet</Typography>
                ) : (
                  entries.map((e) => (
                    <View key={e.id} style={styles.entryRow}>
                      <View style={styles.entryBody}>
                        <Typography style={styles.entryName} numberOfLines={1}>{e.name}</Typography>
                        <Typography style={styles.entrySub}>
                          {e.quantity !== 1 ? `${e.quantity} × ` : ''}
                          {e.serving || 'serving'}
                          {e.source === 'photo' ? ' · 📷 AI' : ''}
                        </Typography>
                      </View>
                      <Typography style={styles.entryKcal}>{Math.round(e.calories)} kcal</Typography>
                      <PressableScale
                        onPress={() => removeFoodEntry(e.id)}
                        hitSlop={theme.hitSlop}
                        haptic="medium"
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${e.name}`}
                      >
                        <Trash2 size={15} color={theme.colors.textSecondary} />
                      </PressableScale>
                    </View>
                  ))
                )}
              </View>
            </StaggerItem>
          );
        })}

        <Button
          title="Add food"
          icon={Plus}
          family="health"
          fullWidth
          onPress={() => openAdd()}
        />
      </ScrollView>

      {/* Goal editor */}
      <Sheet
        visible={goalSheet}
        onClose={() => setGoalSheet(false)}
        title="Daily calorie goal"
        caption="Intake target the ring fills against."
      >
        <View style={styles.goalSheetBody}>
          <FieldBlock
            label="Goal (kcal)"
            family="health"
            value={goalDraft}
            onChangeText={setGoalDraft}
            keyboardType="number-pad"
            numeric
            placeholder="2200"
          />
          <Button title="Save goal" family="health" fullWidth onPress={saveGoal} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingBottom: 8,
  },
  dayTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
    minWidth: 130,
    textAlign: 'center',
  },
  scroll: {
    padding: 16,
    paddingTop: 6,
    paddingBottom: 130,
    gap: 12,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
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
  balanceStats: {
    flex: 1,
    gap: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  balanceVal: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    marginTop: 2,
  },
  goalChipTxt: {
    ...theme.typography.micro,
  },
  macroCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
  },
  macroCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  macroVal: {
    ...theme.typography.subtitle,
  },
  macroLabel: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
  },
  mealCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  mealIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.text,
    flex: 1,
  },
  mealKcal: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
  },
  mealAdd: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealEmpty: {
    ...theme.typography.footnote,
    color: theme.colors.textSecondary,
    paddingLeft: 37,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 37,
  },
  entryBody: {
    flex: 1,
  },
  entryName: {
    ...theme.typography.footnote,
    color: theme.colors.text,
  },
  entrySub: {
    ...theme.typography.micro,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  entryKcal: {
    ...theme.typography.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  goalSheetBody: {
    gap: 14,
    paddingVertical: 6,
  },
});
