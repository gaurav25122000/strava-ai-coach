import { Activity, FoodLogEntry, MealType } from '../store/useStore';
import { activityDayKey, localDateStr } from '../utils/dates';

// ── Calorie tracker aggregations ─────────────────────────────────────────────
//
// Single source of truth for "eaten vs burned" math so the tracker screen and
// the dashboard widgets can never disagree. Burn comes from Strava activity
// calories (real kJ for rides, MET estimate otherwise — already resolved at
// sync time in strava.ts); eaten comes from the food log.

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** Sensible default meal for a fresh log entry, by wall clock. */
export function defaultMealForNow(now: Date = new Date()): MealType {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/** Total kcal eaten on a YYYY-MM-DD day. */
export function eatenOn(foodLog: FoodLogEntry[], dayKey: string): number {
  let sum = 0;
  for (const e of foodLog) if (e.date === dayKey) sum += e.calories;
  return Math.round(sum);
}

/** Active kcal burned on a day — sum of Strava activity calories. */
export function burnedOn(activities: Activity[], dayKey: string): number {
  let sum = 0;
  for (const a of activities) {
    if (activityDayKey(a) === dayKey) sum += a.calories ?? 0;
  }
  return Math.round(sum);
}

export interface DayMacros {
  protein: number;
  carbs: number;
  fat: number;
}

/** Macro totals (grams) eaten on a day. */
export function macrosOn(foodLog: FoodLogEntry[], dayKey: string): DayMacros {
  const m = { protein: 0, carbs: 0, fat: 0 };
  for (const e of foodLog) {
    if (e.date !== dayKey) continue;
    m.protein += e.protein ?? 0;
    m.carbs += e.carbs ?? 0;
    m.fat += e.fat ?? 0;
  }
  return {
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fat: Math.round(m.fat),
  };
}

/** Day's entries grouped by meal, each group newest-last (log order). */
export function mealsOn(foodLog: FoodLogEntry[], dayKey: string): Record<MealType, FoodLogEntry[]> {
  const out: Record<MealType, FoodLogEntry[]> = {
    breakfast: [], lunch: [], dinner: [], snack: [],
  };
  for (const e of foodLog) if (e.date === dayKey) out[e.meal].push(e);
  return out;
}

export interface CalorieDay {
  /** YYYY-MM-DD */
  day: string;
  /** "Mon".."Sun" */
  label: string;
  eaten: number;
  burned: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Last `days` days (oldest → today) of eaten vs burned. `today` is injectable
 * for tests.
 */
export function calorieWeekSeries(
  foodLog: FoodLogEntry[],
  activities: Activity[],
  days = 7,
  today: Date = new Date(),
): CalorieDay[] {
  const out: CalorieDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateStr(d);
    out.push({
      day: key,
      label: DOW[d.getDay()],
      eaten: eatenOn(foodLog, key),
      burned: burnedOn(activities, key),
    });
  }
  return out;
}
