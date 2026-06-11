import { Activity, FoodLogEntry, WeightEntry } from '../../store/useStore';
import {
  suggestedCalorieGoal,
  weightTrend,
  nutritionContext,
} from '../calories';

// Fixed calendar: 2026-06-01 is a Monday, so "today" 2026-06-11 is a Thursday.
const TODAY = new Date('2026-06-11T12:00:00');

let nextId = 1;
function food(over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: String(nextId++),
    date: '2026-06-10',
    meal: 'lunch',
    name: 'Dal bowl',
    calories: 400,
    quantity: 1,
    source: 'manual',
    loggedAt: '2026-06-10T13:00:00Z',
    ...over,
  };
}

function act(over: Partial<Activity> = {}): Activity {
  return {
    id: String(nextId++),
    type: 'Run',
    distance: 5000,
    movingTime: 1800,
    elapsedTime: 1900,
    totalElevationGain: 10,
    startDate: '2026-06-10T03:00:00Z',
    averageSpeed: 2.8,
    maxSpeed: 3.3,
    ...over,
  };
}

function weight(over: Partial<WeightEntry> = {}): WeightEntry {
  return { date: '2026-06-10', kg: 78, ...over };
}

describe('suggestedCalorieGoal', () => {
  const profile = { weight: 70, height: 175, dob: '1996-06-11' };

  // Mirror the implementation's formula so the expectations are derived,
  // not hardcoded: Mifflin-St Jeor with the sex-averaged constant, ×1.35,
  // plus avg daily burn, rounded to the nearest 50.
  function expected(avgBurn: number): number {
    const age = (TODAY.getTime() - new Date(profile.dob).getTime()) / (365.25 * 86400000);
    const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * age - 78;
    return Math.round((bmr * 1.35 + avgBurn) / 50) * 50;
  }

  it('returns null when weight, height, or dob is missing', () => {
    expect(suggestedCalorieGoal({ height: 175, dob: '1996-06-11' }, [], TODAY)).toBeNull();
    expect(suggestedCalorieGoal({ weight: 70, dob: '1996-06-11' }, [], TODAY)).toBeNull();
    expect(suggestedCalorieGoal({ weight: 70, height: 175 }, [], TODAY)).toBeNull();
  });

  it('returns null when age is out of the 10–100 range', () => {
    expect(suggestedCalorieGoal({ weight: 70, height: 175, dob: '2020-01-01' }, [], TODAY)).toBeNull();
    expect(suggestedCalorieGoal({ weight: 70, height: 175, dob: '1920-01-01' }, [], TODAY)).toBeNull();
  });

  it('computes the Mifflin-avg goal with zero activities', () => {
    const goal = suggestedCalorieGoal(profile, [], TODAY);
    expect(goal).toBe(expected(0));
    // Hand check: bmr ≈ 1565.75, ×1.35 ≈ 2113.8 → nearest 50.
    expect(goal).toBe(2100);
  });

  it('shifts the goal by the 14-day average burn', () => {
    const acts = [act({ startDate: '2026-06-10T03:00:00Z', calories: 500 })];
    const goal = suggestedCalorieGoal(profile, acts, TODAY);
    expect(goal).toBe(expected(500 / 14));
    // 500 kcal over 14 days ≈ +35.7/day, enough to tip the next 50-step.
    expect(goal).toBe(2150);
  });
});

describe('weightTrend', () => {
  it('returns null for an empty log', () => {
    expect(weightTrend([], 30, TODAY)).toBeNull();
  });

  it('single entry → current with null delta', () => {
    const only = weight({ date: '2026-06-10', kg: 77.5 });
    const trend = weightTrend([only], 30, TODAY);
    expect(trend).not.toBeNull();
    expect(trend!.current).toEqual(only);
    expect(trend!.deltaKg).toBeNull();
    expect(trend!.entries).toEqual([only]);
  });

  it('delta vs the newest entry at or before the 30-day cutoff', () => {
    const log = [
      weight({ date: '2026-04-01', kg: 80 }),
      weight({ date: '2026-05-10', kg: 78.5 }), // newest ≤ cutoff 2026-05-12
      weight({ date: '2026-06-10', kg: 77.2 }),
    ];
    const trend = weightTrend(log, 30, TODAY)!;
    expect(trend.current.date).toBe('2026-06-10');
    expect(trend.deltaKg).toBe(-1.3);
  });

  it('falls back to the oldest entry when all are inside the window', () => {
    const log = [
      weight({ date: '2026-06-01', kg: 80 }),
      weight({ date: '2026-06-10', kg: 79 }),
    ];
    const trend = weightTrend(log, 30, TODAY)!;
    expect(trend.current.date).toBe('2026-06-10');
    expect(trend.deltaKg).toBe(-1);
  });

  it('returns entries sorted ascending regardless of input order', () => {
    const log = [
      weight({ date: '2026-06-10', kg: 77 }),
      weight({ date: '2026-04-01', kg: 80 }),
      weight({ date: '2026-05-15', kg: 78 }),
    ];
    const trend = weightTrend(log, 30, TODAY)!;
    expect(trend.entries.map((w) => w.date)).toEqual([
      '2026-04-01', '2026-05-15', '2026-06-10',
    ]);
    expect(trend.current.date).toBe('2026-06-10');
  });
});

describe('nutritionContext', () => {
  it('returns null when the food log is empty', () => {
    expect(nutritionContext([], [act({ calories: 300 })], 2200, TODAY)).toBeNull();
  });

  it("includes today's eaten total, active burn, and the goal", () => {
    const log = [
      food({ date: '2026-06-11', calories: 500 }),
      food({ date: '2026-06-11', calories: 300 }),
    ];
    const acts = [act({ startDate: '2026-06-11T03:00:00Z', calories: 450 })];
    const ctx = nutritionContext(log, acts, 2200, TODAY)!;
    expect(ctx).toContain('800 kcal eaten');
    expect(ctx).toContain('450 kcal active burn');
    expect(ctx).toContain('goal 2200 kcal');
  });

  it('adds the 7-day average line when there are logged days', () => {
    const log = [
      food({ date: '2026-06-11', calories: 800 }),
      food({ date: '2026-06-09', calories: 600 }),
    ];
    const acts = [act({ startDate: '2026-06-11T03:00:00Z', calories: 450 })];
    const ctx = nutritionContext(log, acts, 2200, TODAY)!;
    // avg eaten (800+600)/2; avg net ((800-450)+(600-0))/2.
    expect(ctx).toContain('2/7 days logged');
    expect(ctx).toContain('avg 700 kcal eaten');
    expect(ctx).toContain('avg net +475 kcal');
  });

  it('omits the 7-day line when no logged day falls in the window', () => {
    const log = [food({ date: '2026-05-01', calories: 600 })];
    const ctx = nutritionContext(log, [], 2200, TODAY)!;
    expect(ctx).toContain('0 kcal eaten');
    expect(ctx).not.toContain('Last 7 days');
  });
});
