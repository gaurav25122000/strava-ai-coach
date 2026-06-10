import { Activity, DailyPrescription, Goal, WorkoutKind } from '../../store/useStore';
import { computeProgress, expectedTrainingDays, prescriptionFor, currentWeekKm } from '../goalProgress';

// Fixed calendar: 2026-06-01 and 2026-06-08 are Mondays. "Today" is
// Wednesday 2026-06-10 in week 2 of the plan.
const TODAY = new Date('2026-06-10T10:00:00');

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

// Week 2 differs: Wednesday is INTERVALS (tests weeks[] resolution).
function week2Schedule(): DailyPrescription[] {
  const s = weekSchedule();
  s[2] = presc(2, 'INTERVALS', 6);
  return s;
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
        { weekStart: '2026-06-08', schedule: week2Schedule(), volumeKm: 33 },
      ],
    }],
    checkIns: [],
    ...overrides,
  };
}

function run(dayLocal: string, km: number, type = 'Run'): Activity {
  return {
    id: `${dayLocal}-${type}-${km}`,
    type,
    distance: km * 1000,
    movingTime: km * 360,
    elapsedTime: km * 360,
    totalElevationGain: 0,
    startDate: `${dayLocal}T03:00:00Z`,
    startDateLocal: `${dayLocal}T08:30:00Z`,
    averageSpeed: 2.8,
    maxSpeed: 3.3,
  };
}

describe('expectedTrainingDays', () => {
  it('counts non-REST days from plan start through the given date', () => {
    // Through Tue 06-09: week-1 Mon/Wed/Fri/Sun + week-2 Mon = 5 expected.
    expect(expectedTrainingDays(goal(), new Date('2026-06-09T12:00:00'), TODAY)).toEqual([
      '2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07', '2026-06-08',
    ]);
  });
});

describe('prescriptionFor (weeks[] resolution)', () => {
  it('uses the specific week schedule, not the phase template', () => {
    // Wed of week 2 is INTERVALS in weeks[], TEMPO in the legacy template.
    const p = prescriptionFor(goal(), new Date('2026-06-10T08:00:00'), TODAY);
    expect(p?.kind).toBe('INTERVALS');
  });

  it('returns undefined outside the plan window', () => {
    expect(prescriptionFor(goal(), new Date('2026-05-20T08:00:00'), TODAY)).toBeUndefined();
  });
});

describe('computeProgress', () => {
  it('progress = completed ÷ expected through yesterday (no 100% pinning)', () => {
    // Expected through Tue 06-09: 5 days. Completed: Mon1, Wed1, Sun long = 3.
    const acts = [run('2026-06-01', 8), run('2026-06-03', 8), run('2026-06-07', 14)];
    const g = computeProgress(goal(), acts, TODAY);
    expect(g.progress).toBe(60); // 3/5 — the old formula said 100 here
  });

  it('pre-plan activities create no check-ins and no progress', () => {
    const acts = [run('2026-05-10', 10), run('2026-05-12', 10)];
    const g = computeProgress(goal(), acts, TODAY);
    expect(g.checkIns?.filter((c) => c.source === 'STRAVA')).toHaveLength(0);
    expect(g.progress).toBe(0);
  });

  it('rest-day bonus shows as a completed check-in but does not move progress', () => {
    // Tue 06-02 is REST; an 8k run that day = bonus.
    const acts = [run('2026-06-02', 8)];
    const g = computeProgress(goal(), acts, TODAY);
    const bonus = g.checkIns?.find((c) => c.date === '2026-06-02');
    expect(bonus?.completed).toBe(true);
    expect(bonus?.matchVerdict).toBe('matched');
    expect(g.progress).toBe(0); // 0 of 5 expected days done
  });

  it('auto-skips missed expected days, and a late sync replaces the auto-skip', () => {
    const first = computeProgress(goal(), [], TODAY);
    const skipped = first.checkIns?.find((c) => c.date === '2026-06-03');
    expect(skipped?.auto).toBe(true);
    expect(skipped?.completed).toBe(false);

    // Late sync: the Wed 06-03 tempo shows up afterwards.
    const second = computeProgress(first, [run('2026-06-03', 8)], TODAY);
    const reclaimed = second.checkIns?.filter((c) => c.date === '2026-06-03');
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed?.[0].source).toBe('STRAVA');
    expect(reclaimed?.[0].completed).toBe(true);
  });

  it('real manual check-ins beat Strava for the same date', () => {
    const manual = {
      date: '2026-06-03',
      dayOfWeek: 2 as const,
      source: 'MANUAL' as const,
      workoutKind: 'TEMPO' as const,
      completed: false,
      notes: 'Felt a niggle, bailed early',
    };
    const g = computeProgress(goal({ checkIns: [manual] }), [run('2026-06-03', 8)], TODAY);
    const day = g.checkIns?.filter((c) => c.date === '2026-06-03');
    expect(day).toHaveLength(1);
    expect(day?.[0].source).toBe('MANUAL');
    expect(day?.[0].completed).toBe(false);
  });
});

describe('currentWeekKm', () => {
  it('counts runs only — rides no longer inflate run volume', () => {
    const acts = [run('2026-06-08', 10), run('2026-06-09', 20, 'Ride')];
    expect(currentWeekKm(acts, TODAY)).toBe(10);
  });
});
