import { Activity, DailyPrescription, Goal, WorkoutKind } from '../../store/useStore';
import {
  dayInfo,
  groupActivitiesByDay,
  lastPlanDayKey,
  monthAdherence,
  monthMatrix,
} from '../calendarData';

// Fixed calendar: 2026-06-01 and 2026-06-08 are Mondays; "today" is
// Wednesday 2026-06-10, inside week 2 of the plan.
const TODAY_KEY = '2026-06-10';

function presc(dayOfWeek: number, kind: WorkoutKind, distanceKm?: number): DailyPrescription {
  return {
    dayOfWeek: dayOfWeek as DailyPrescription['dayOfWeek'],
    kind,
    title: `${kind} day`,
    description: 'd',
    distanceKm,
    ...(kind === 'REST' ? { rest: { kind: 'COMPLETE' as const, note: 'off' } } : {}),
  };
}

// Mon EASY 8k, Tue REST, Wed TEMPO 8k, Thu REST, Fri EASY 8k, Sat REST, Sun LONG 14k
function weekSchedule(): DailyPrescription[] {
  return [
    presc(0, 'EASY', 8),
    presc(1, 'REST'),
    presc(2, 'TEMPO', 8),
    presc(3, 'REST'),
    presc(4, 'EASY', 8),
    presc(5, 'REST'),
    presc(6, 'LONG', 14),
  ];
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: '10K',
    targetDate: '2026-06-14',
    daysRemaining: 4,
    type: 'Race',
    metric: '',
    progress: 0,
    phase: 'Build',
    weeklyVolume: { current: 0, target: 30 },
    longRun: { current: 0, target: 14 },
    keyWorkout: '',
    phases: [{
      name: 'Build',
      description: '',
      weeklyVolumeTarget: 30,
      longRunTarget: 14,
      keyWorkout: '',
      weekStart: '2026-06-01',
      weekEnd: '2026-06-14',
      schedule: weekSchedule(),
      weeks: [
        { weekStart: '2026-06-01', schedule: weekSchedule(), volumeKm: 30 },
        { weekStart: '2026-06-08', schedule: weekSchedule(), volumeKm: 30 },
      ],
    }],
    checkIns: [],
    ...overrides,
  };
}

function run(dayLocal: string, km: number, movingMin = km * 6): Activity {
  return {
    id: `${dayLocal}-${km}`,
    type: 'Run',
    distance: km * 1000,
    movingTime: movingMin * 60,
    elapsedTime: movingMin * 60,
    totalElevationGain: 0,
    startDate: `${dayLocal}T03:00:00Z`,
    startDateLocal: `${dayLocal}T08:30:00`,
    averageSpeed: 2.8,
    maxSpeed: 3.3,
  };
}

describe('monthMatrix', () => {
  it('covers June 2026 (1st is a Monday) in exactly 5 Monday-start weeks', () => {
    const weeks = monthMatrix(2026, 5);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ dayKey: '2026-06-01', inMonth: true });
    expect(weeks[4][6]).toEqual({ dayKey: '2026-07-05', inMonth: false });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('handles a 28-day February starting on Monday as exactly 4 fully in-month weeks', () => {
    // Feb 2021: Feb 1 is a Monday, Feb 28 a Sunday.
    const weeks = monthMatrix(2021, 1);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toEqual({ dayKey: '2021-02-01', inMonth: true });
    expect(weeks[3][6]).toEqual({ dayKey: '2021-02-28', inMonth: true });
    expect(weeks.flat().every((c) => c.inMonth)).toBe(true);
  });

  it('pads a Sunday-starting month back to the previous Monday', () => {
    // Feb 2026: Feb 1 is a Sunday → first row starts Mon Jan 26.
    const weeks = monthMatrix(2026, 1);
    expect(weeks[0][0]).toEqual({ dayKey: '2026-01-26', inMonth: false });
    expect(weeks[0][6]).toEqual({ dayKey: '2026-02-01', inMonth: true });
    expect(weeks).toHaveLength(5);
    // Last row Feb 23 – Mar 1: only the trailing Sunday spills over.
    expect(weeks[4].map((c) => c.inMonth)).toEqual([true, true, true, true, true, true, false]);
  });
});

describe('groupActivitiesByDay', () => {
  it('buckets by athlete-local day key', () => {
    const byDay = groupActivitiesByDay([run('2026-06-01', 8), run('2026-06-01', 4), run('2026-06-03', 8)]);
    expect(byDay.get('2026-06-01')).toHaveLength(2);
    expect(byDay.get('2026-06-03')).toHaveLength(1);
  });
});

describe('dayInfo', () => {
  it('done: prescribed day with a non-trivial activity', () => {
    const byDay = groupActivitiesByDay([run('2026-06-01', 8)]);
    const info = dayInfo(goal(), byDay, '2026-06-01', TODAY_KEY);
    expect(info.status).toBe('done');
    expect(info.planned?.kind).toBe('EASY');
    expect(info.acts).toHaveLength(1);
  });

  it('a trivial (<10 min) activity does not complete a prescribed day', () => {
    const byDay = groupActivitiesByDay([run('2026-06-01', 1, 5)]);
    expect(dayInfo(goal(), byDay, '2026-06-01', TODAY_KEY).status).toBe('missed');
  });

  it('missed: prescribed past day with no activities', () => {
    const info = dayInfo(goal(), new Map(), '2026-06-03', TODAY_KEY);
    expect(info.status).toBe('missed');
    expect(info.acts).toHaveLength(0);
  });

  it('planned: prescribed today and future days with no activities', () => {
    expect(dayInfo(goal(), new Map(), '2026-06-10', TODAY_KEY).status).toBe('planned');
    expect(dayInfo(goal(), new Map(), '2026-06-12', TODAY_KEY).status).toBe('planned');
  });

  it('rest: REST prescription, even with a bonus activity logged', () => {
    const byDay = groupActivitiesByDay([run('2026-06-02', 5)]);
    expect(dayInfo(goal(), byDay, '2026-06-02', TODAY_KEY).status).toBe('rest');
  });

  it('extra: activity on a day outside the plan window', () => {
    const byDay = groupActivitiesByDay([run('2026-05-20', 5)]);
    const info = dayInfo(goal(), byDay, '2026-05-20', TODAY_KEY);
    expect(info.status).toBe('extra');
    expect(info.planned).toBeNull();
  });

  it('free: no plan and no activities', () => {
    expect(dayInfo(goal(), new Map(), '2026-05-20', TODAY_KEY).status).toBe('free');
    expect(dayInfo(null, new Map(), '2026-06-01', TODAY_KEY).status).toBe('free');
  });
});

describe('monthAdherence', () => {
  it('counts elapsed planned days only and ignores future days', () => {
    // Closed planned days through 06-09: Mon 1, Wed 3, Fri 5, Sun 7, Mon 8;
    // Wed 10 (today, no act) is still open. Done: 06-01 and 06-08.
    const byDay = groupActivitiesByDay([run('2026-06-01', 8), run('2026-06-08', 8)]);
    const a = monthAdherence(goal(), byDay, 2026, 5, TODAY_KEY);
    expect(a).toEqual({ planned: 5, completed: 2, pct: 40 });
  });

  it('today counts once done, but is not a miss while still open', () => {
    const byDay = groupActivitiesByDay([
      run('2026-06-01', 8), run('2026-06-03', 8), run('2026-06-05', 8),
      run('2026-06-07', 14), run('2026-06-08', 8), run('2026-06-10', 6),
    ]);
    const a = monthAdherence(goal(), byDay, 2026, 5, TODAY_KEY);
    expect(a).toEqual({ planned: 6, completed: 6, pct: 100 });
  });

  it('null pct when no planned days have elapsed', () => {
    expect(monthAdherence(goal(), new Map(), 2026, 4, TODAY_KEY).pct).toBeNull();
    expect(monthAdherence(null, new Map(), 2026, 5, TODAY_KEY).pct).toBeNull();
  });
});

describe('lastPlanDayKey', () => {
  it('takes the max of phase weekEnd and week starts + 6 days', () => {
    expect(lastPlanDayKey(goal())).toBe('2026-06-14');
  });

  it('null without phases', () => {
    expect(lastPlanDayKey(goal({ phases: undefined }))).toBeNull();
    expect(lastPlanDayKey(null)).toBeNull();
  });
});
