import { Goal, Phase } from '../../../store/useStore';
import { planWeekStarts } from '../planWeekStarts';
import { weekKey } from '../../../utils/dates';

function goal(phases?: Phase[]): Goal {
  return {
    id: 'g1',
    title: 'Test 10k',
    targetDate: '2026-08-30',
    daysRemaining: 0,
    type: 'Race',
    metric: 'days',
    progress: 0,
    phase: 'Base',
    weeklyVolume: { current: 0, target: 30 },
    longRun: { current: 0, target: 10 },
    keyWorkout: '',
    phases,
  };
}

const day = { dayOfWeek: 0 as const, kind: 'EASY' as const, title: 'Easy', description: 'd' };

describe('planWeekStarts', () => {
  it('returns an empty list when there is no plan', () => {
    expect(planWeekStarts(goal())).toEqual([]);
    expect(planWeekStarts(goal([]))).toEqual([]);
  });

  it('enumerates weekStart Mondays from phases[].weeks, sorted across phases', () => {
    const phases: Phase[] = [
      {
        name: 'Base', description: '', weeklyVolumeTarget: 30, longRunTarget: 10, keyWorkout: '',
        weekStart: '2026-06-01', weekEnd: '2026-06-14',
        weeks: [
          { weekStart: '2026-06-08', schedule: [day] },
          { weekStart: '2026-06-01', schedule: [day] },
        ],
      },
      {
        name: 'Build', description: '', weeklyVolumeTarget: 35, longRunTarget: 12, keyWorkout: '',
        weekStart: '2026-06-15', weekEnd: '2026-06-21',
        weeks: [{ weekStart: '2026-06-15', schedule: [day] }],
      },
    ];
    expect(planWeekStarts(goal(phases))).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
  });

  it('falls back to enumerating Mondays inside a windowed phase without weeks', () => {
    const phases: Phase[] = [{
      name: 'Base', description: '', weeklyVolumeTarget: 30, longRunTarget: 10, keyWorkout: '',
      weekStart: '2026-06-01', weekEnd: '2026-06-21',
    }];
    expect(planWeekStarts(goal(phases))).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
  });

  it('covers only the current week for legacy template plans', () => {
    const phases: Phase[] = [{
      name: 'Base', description: '', weeklyVolumeTarget: 30, longRunTarget: 10, keyWorkout: '',
      schedule: [day],
    }];
    expect(planWeekStarts(goal(phases))).toEqual([weekKey(new Date())]);
  });

  it('de-duplicates overlapping Mondays', () => {
    const phases: Phase[] = [
      {
        name: 'A', description: '', weeklyVolumeTarget: 30, longRunTarget: 10, keyWorkout: '',
        weekStart: '2026-06-01', weekEnd: '2026-06-07',
        weeks: [{ weekStart: '2026-06-01', schedule: [day] }],
      },
      {
        name: 'B', description: '', weeklyVolumeTarget: 30, longRunTarget: 10, keyWorkout: '',
        weekStart: '2026-06-01', weekEnd: '2026-06-14',
        weeks: [
          { weekStart: '2026-06-01', schedule: [day] },
          { weekStart: '2026-06-08', schedule: [day] },
        ],
      },
    ];
    expect(planWeekStarts(goal(phases))).toEqual(['2026-06-01', '2026-06-08']);
  });
});
