import { DailyPrescription, Goal, WorkoutKind } from '../../store/useStore';
import { cycledGoalFor, macroTargets } from '../calories';

// ── macroTargets ─────────────────────────────────────────────────────────────

describe('macroTargets', () => {
  it('derives all defaults from weight and calorie goal', () => {
    const t = macroTargets({ weight: 70 }, {}, 2400);
    expect(t.protein).toBe(112); // 70 × 1.6
    expect(t.fat).toBe(67); // 2400 × 0.25 / 9
    expect(t.carbs).toBe(337); // (2400 − 112×4 − 67×9) / 4
    expect(t.custom).toEqual({ protein: false, carbs: false, fat: false });
  });

  it('falls back to 110 g protein without a body weight', () => {
    expect(macroTargets({}, {}, 2200).protein).toBe(110);
    expect(macroTargets({ weight: 0 }, {}, 2200).protein).toBe(110);
  });

  it('explicit goals win over defaults and flag as custom', () => {
    const t = macroTargets({ weight: 70 }, { protein: 150, carbs: 200, fat: 50 }, 2400);
    expect(t).toEqual({
      protein: 150,
      carbs: 200,
      fat: 50,
      custom: { protein: true, carbs: true, fat: true },
    });
  });

  it('mixes a custom protein goal with derived carbs and fat', () => {
    const t = macroTargets({ weight: 70 }, { protein: 150 }, 2400);
    expect(t.protein).toBe(150);
    expect(t.fat).toBe(67);
    expect(t.carbs).toBe(299); // (2400 − 150×4 − 67×9) / 4
    expect(t.custom).toEqual({ protein: true, carbs: false, fat: false });
  });

  it('never returns negative carbs', () => {
    const t = macroTargets({}, { protein: 200, fat: 60 }, 500);
    expect(t.carbs).toBe(0);
  });
});

// ── cycledGoalFor ────────────────────────────────────────────────────────────

// Plan calendar: 2026-06-08 and 2026-06-15 are Mondays.
const WEEK1 = '2026-06-08';
const WEEK2 = '2026-06-15';

function rx(dayOfWeek: DailyPrescription['dayOfWeek'], kind: WorkoutKind): DailyPrescription {
  return { dayOfWeek, kind, title: kind, description: '' };
}

function planGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Half marathon',
    targetDate: '2026-08-30',
    daysRemaining: 79,
    type: 'Race',
    metric: '21.1 km',
    progress: 10,
    phase: 'Base',
    weeklyVolume: { current: 20, target: 40 },
    longRun: { current: 8, target: 18 },
    keyWorkout: 'Tempo',
    phases: [
      {
        name: 'Base',
        description: 'Aerobic base',
        weeklyVolumeTarget: 40,
        longRunTarget: 18,
        keyWorkout: 'Tempo',
        weekStart: WEEK1,
        weekEnd: '2026-06-21',
        weeks: [
          {
            weekStart: WEEK1,
            schedule: [
              rx(0, 'EASY'),
              rx(1, 'INTERVALS'),
              rx(2, 'STRENGTH'),
              rx(3, 'TEMPO'),
              rx(4, 'REST'),
              rx(5, 'CROSS'),
              rx(6, 'LONG'),
            ],
          },
          {
            weekStart: WEEK2,
            schedule: [rx(0, 'RECOVERY')],
          },
        ],
      },
    ],
    ...over,
  };
}

function simpleGoal(): Goal {
  return planGoal({ id: 'g2', type: 'Simple', isSimple: true, phases: undefined });
}

const OPTS = { calorieGoal: 2400, calorieCycling: true, goals: [planGoal()] };

describe('cycledGoalFor', () => {
  it('returns the flat goal when cycling is off', () => {
    expect(cycledGoalFor('2026-06-14', { ...OPTS, calorieCycling: false }))
      .toEqual({ goal: 2400, delta: 0, reason: null });
  });

  it('returns the flat goal with no plan goal', () => {
    expect(cycledGoalFor('2026-06-14', { ...OPTS, goals: [] }))
      .toEqual({ goal: 2400, delta: 0, reason: null });
    expect(cycledGoalFor('2026-06-14', { ...OPTS, goals: [simpleGoal()] }))
      .toEqual({ goal: 2400, delta: 0, reason: null });
  });

  it('returns the flat goal for a day outside the plan calendar', () => {
    expect(cycledGoalFor('2026-07-01', OPTS)).toEqual({ goal: 2400, delta: 0, reason: null });
  });

  it.each([
    ['2026-06-14', 'LONG', 300, 'hard training day'],
    ['2026-06-09', 'INTERVALS', 300, 'hard training day'],
    ['2026-06-11', 'TEMPO', 300, 'hard training day'],
    ['2026-06-08', 'EASY', 150, 'training day'],
    ['2026-06-13', 'CROSS', 150, 'training day'],
    ['2026-06-10', 'STRENGTH', 150, 'training day'],
    ['2026-06-15', 'RECOVERY', 0, null],
    ['2026-06-12', 'REST', -200, 'rest day'],
  ] as const)('%s (%s) → delta %d', (dayKey, _kind, delta, reason) => {
    expect(cycledGoalFor(dayKey, OPTS)).toEqual({ goal: 2400 + delta, delta, reason });
  });

  it('skips simple goals and uses the first plan goal', () => {
    expect(cycledGoalFor('2026-06-14', { ...OPTS, goals: [simpleGoal(), planGoal()] }))
      .toEqual({ goal: 2700, delta: 300, reason: 'hard training day' });
  });
});
