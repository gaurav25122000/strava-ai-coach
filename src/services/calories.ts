import { Activity, FoodLogEntry, Goal, MacroGoals, MealType, WeightEntry, WorkoutKind } from '../store/useStore';
import { activityDayKey, localDateStr } from '../utils/dates';
import { prescriptionForDate } from './planSchedule';

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

// ── Smart goal (BMR-based) ───────────────────────────────────────────────────

/**
 * Suggested daily intake: Mifflin-St Jeor BMR (sex-averaged constant — the
 * profile doesn't record sex) × 1.35 non-exercise activity factor, plus the
 * athlete's average daily Strava burn over the last 14 days. Rounded to 50.
 * Null when the profile lacks weight/height/dob.
 */
export function suggestedCalorieGoal(
  profile: { weight?: number; height?: number; dob?: string },
  activities: Activity[],
  today: Date = new Date(),
): number | null {
  const { weight, height, dob } = profile;
  if (!weight || !height || !dob) return null;
  const age = (today.getTime() - new Date(dob).getTime()) / (365.25 * 86400000);
  if (!Number.isFinite(age) || age < 10 || age > 100) return null;
  const bmr = 10 * weight + 6.25 * height - 5 * age - 78;
  const recent = calorieWeekSeries([], activities, 14, today);
  const avgBurn = recent.reduce((s, d) => s + d.burned, 0) / recent.length;
  return Math.round((bmr * 1.35 + avgBurn) / 50) * 50;
}

// ── Macro targets ────────────────────────────────────────────────────────────

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
  /** Which targets came from the athlete's own macro goals vs our defaults. */
  custom: { protein: boolean; carbs: boolean; fat: boolean };
}

/**
 * Daily macro targets in grams. Explicit macroGoals fields win; defaults are
 * endurance-athlete protein (1.6 g/kg, 110 g without a body weight), fat at
 * 25% of the calorie goal, carbs as whatever energy remains (never negative).
 */
export function macroTargets(
  profile: { weight?: number },
  macroGoals: MacroGoals,
  calorieGoal: number,
): MacroTargets {
  const custom = {
    protein: macroGoals.protein != null,
    carbs: macroGoals.carbs != null,
    fat: macroGoals.fat != null,
  };
  const protein = custom.protein
    ? macroGoals.protein!
    : profile.weight && profile.weight > 0
      ? Math.round(profile.weight * 1.6)
      : 110;
  const fat = custom.fat ? macroGoals.fat! : Math.round((calorieGoal * 0.25) / 9);
  const carbs = custom.carbs
    ? macroGoals.carbs!
    : Math.max(0, Math.round((calorieGoal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat, custom };
}

// ── Training-day calorie cycling ─────────────────────────────────────────────

const CYCLE_DELTAS: Record<WorkoutKind, { delta: number; reason: string | null }> = {
  LONG: { delta: 300, reason: 'hard training day' },
  INTERVALS: { delta: 300, reason: 'hard training day' },
  TEMPO: { delta: 300, reason: 'hard training day' },
  EASY: { delta: 150, reason: 'training day' },
  CROSS: { delta: 150, reason: 'training day' },
  STRENGTH: { delta: 150, reason: 'training day' },
  RECOVERY: { delta: 0, reason: null },
  REST: { delta: -200, reason: 'rest day' },
};

/**
 * The day's calorie goal adjusted for what the training plan prescribes:
 * hard sessions earn more fuel, rest days trim the budget. Falls back to the
 * flat goal when cycling is off, no plan goal exists, or the day is outside
 * the plan calendar.
 */
export function cycledGoalFor(
  dayKey: string,
  opts: { calorieGoal: number; calorieCycling: boolean; goals: Goal[] },
): { goal: number; delta: number; reason: string | null } {
  const { calorieGoal, calorieCycling, goals } = opts;
  const flat = { goal: calorieGoal, delta: 0, reason: null };
  if (!calorieCycling) return flat;
  const planGoal = goals.find((g) => !g.isSimple && g.phases?.length);
  if (!planGoal) return flat;
  const [y, m, d] = dayKey.split('-').map(Number);
  const rx = prescriptionForDate(planGoal, new Date(y, m - 1, d, 12));
  if (!rx) return flat;
  const { delta, reason } = CYCLE_DELTAS[rx.kind];
  return { goal: calorieGoal + delta, delta, reason };
}

// ── Weight trend ─────────────────────────────────────────────────────────────

export interface WeightTrend {
  /** Most recent weigh-in. */
  current: WeightEntry;
  /** Change vs the closest entry ≥ `days` ago (or the oldest available). */
  deltaKg: number | null;
  entries: WeightEntry[];
}

export function weightTrend(weightLog: WeightEntry[], days = 30, today: Date = new Date()): WeightTrend | null {
  if (!weightLog.length) return null;
  const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = localDateStr(cutoff);
  // Baseline = newest entry at or before the cutoff; fall back to the oldest
  // entry so a short log still shows its full-range delta.
  const baseline = [...sorted].reverse().find((w) => w.date <= cutoffKey) ?? sorted[0];
  const deltaKg = baseline.date === current.date
    ? null
    : Math.round((current.kg - baseline.kg) * 10) / 10;
  return { current, deltaKg, entries: sorted };
}

/** One shared delta string so every surface renders the stat identically. */
export function formatWeightDelta(deltaKg: number | null, days = 30): string {
  if (deltaKg == null) return `— · ${days}d`;
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '−' : '±';
  return `${sign}${Math.abs(deltaKg)} kg · ${days}d`;
}

// ── Coach context ────────────────────────────────────────────────────────────

/**
 * Compact nutrition block for LLM prompts (coach chat, weekly digest).
 * Null when the athlete has never logged food — the coach shouldn't nag
 * about a feature they don't use.
 */
export function nutritionContext(
  foodLog: FoodLogEntry[],
  activities: Activity[],
  calorieGoal: number,
  today: Date = new Date(),
): string | null {
  if (!foodLog.length) return null;
  const todayKey = localDateStr(today);
  const week = calorieWeekSeries(foodLog, activities, 7, today);
  const loggedDays = week.filter((d) => d.eaten > 0);
  const m = macrosOn(foodLog, todayKey);
  const lines = [
    `- Today: ${eatenOn(foodLog, todayKey)} kcal eaten, ${burnedOn(activities, todayKey)} kcal active burn, goal ${calorieGoal} kcal (P ${m.protein} g / C ${m.carbs} g / F ${m.fat} g so far)`,
  ];
  if (loggedDays.length) {
    const avgEaten = Math.round(loggedDays.reduce((s, d) => s + d.eaten, 0) / loggedDays.length);
    const avgNet = Math.round(loggedDays.reduce((s, d) => s + d.eaten - d.burned, 0) / loggedDays.length);
    lines.push(`- Last 7 days: ${loggedDays.length}/7 days logged, avg ${avgEaten} kcal eaten, avg net ${avgNet >= 0 ? '+' : ''}${avgNet} kcal vs active burn`);
  }
  return `NUTRITION LOG (athlete's calorie tracker):\n${lines.join('\n')}`;
}
