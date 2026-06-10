import { computeStreaks, Activity } from '../useStore';
import { localDateStr } from '../../utils/dates';

function act(startDateLocal: string, startDate?: string): Activity {
  return {
    id: startDateLocal,
    type: 'Run',
    distance: 5000,
    movingTime: 1800,
    elapsedTime: 1800,
    totalElevationGain: 10,
    startDate: startDate ?? `${startDateLocal}T06:00:00Z`,
    startDateLocal: `${startDateLocal}T06:00:00Z`,
    averageSpeed: 2.8,
    maxSpeed: 3.5,
  };
}

function daysAgo(n: number): string {
  return localDateStr(new Date(Date.now() - n * 86400000));
}

describe('computeStreaks', () => {
  it('counts consecutive local days ending today', () => {
    const acts = [act(daysAgo(0)), act(daysAgo(1)), act(daysAgo(2))];
    expect(computeStreaks(acts).currentStreak).toBe(3);
  });

  it('grace: streak survives if last run was yesterday', () => {
    const acts = [act(daysAgo(1)), act(daysAgo(2))];
    expect(computeStreaks(acts).currentStreak).toBe(2);
  });

  it('dead streak: nothing for two days', () => {
    const acts = [act(daysAgo(2)), act(daysAgo(3))];
    expect(computeStreaks(acts).currentStreak).toBe(0);
  });

  it('bestStreak finds the longest historical run of days', () => {
    const acts = [
      act('2026-01-01'), act('2026-01-02'), act('2026-01-03'), act('2026-01-04'),
      act('2026-02-10'), act('2026-02-11'),
    ];
    expect(computeStreaks(acts).bestStreak).toBe(4);
  });

  it('buckets by the athlete wall clock, not UTC (IST early-morning run)', () => {
    // Local days are consecutive; UTC instants land both on the same UTC day.
    // Pre-fix code bucketed by UTC and saw one day instead of two.
    const acts = [
      act('2026-01-02', '2026-01-01T19:30:00Z'), // Jan 2 01:00 IST
      act('2026-01-01', '2026-01-01T01:30:00Z'), // Jan 1 07:00 IST
    ];
    expect(computeStreaks(acts).bestStreak).toBe(2);
  });
});
