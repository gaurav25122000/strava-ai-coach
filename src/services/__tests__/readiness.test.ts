import { Activity, SleepEntry } from '../../store/useStore';
import { dailyStrain, readinessScore } from '../readiness';
import { localDateStr } from '../../utils/dates';

// Fixed local "this morning" so day-window math is deterministic.
const TODAY = new Date(2026, 5, 12, 8, 0, 0); // 2026-06-12 08:00 local

let nextId = 1;
function act(over: Partial<Activity> = {}): Activity {
  return {
    id: String(nextId++),
    type: 'Run',
    distance: 10000,
    movingTime: 3600,
    elapsedTime: 3700,
    totalElevationGain: 0,
    startDate: '2026-06-01T06:30:00Z',
    averageSpeed: 2.8,
    maxSpeed: 4,
    ...over,
  };
}

function actDaysAgo(daysAgo: number, sufferScore: number): Activity {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  const key = localDateStr(d);
  return act({
    sufferScore,
    startDate: `${key}T06:30:00Z`,
    startDateLocal: `${key}T06:30:00`,
  });
}

function sleep(hours: number, quality?: 1 | 2 | 3): Record<string, SleepEntry> {
  return { [localDateStr(TODAY)]: { hours, quality } };
}

/** One activity per day for the whole 28-day window — acute:chronic = 1. */
const balanced = Array.from({ length: 28 }, (_, i) => actDaysAgo(i, 50));

/** All training packed into the last 7 days — acute:chronic = 4. */
const spike = Array.from({ length: 7 }, (_, i) => actDaysAgo(i, 100));

describe('dailyStrain', () => {
  it('uses sufferScore when present', () => {
    expect(dailyStrain(act({ sufferScore: 80, movingTime: 7200 }))).toBe(80);
  });

  it('falls back to minutes when there is no HR', () => {
    expect(dailyStrain(act({ movingTime: 3600 }))).toBe(60);
  });

  it('scales minutes by avg HR relative to 130 bpm', () => {
    expect(dailyStrain(act({ movingTime: 3600, averageHeartRate: 156 }))).toBeCloseTo(72);
  });

  it('clamps the HR multiplier to 0.5–1.5', () => {
    expect(dailyStrain(act({ movingTime: 3600, averageHeartRate: 260 }))).toBeCloseTo(90);
    expect(dailyStrain(act({ movingTime: 3600, averageHeartRate: 40 }))).toBeCloseTo(30);
  });
});

describe('readinessScore', () => {
  it('great sleep + balanced load scores high', () => {
    const r = readinessScore({ sleepLog: sleep(8, 3), activities: balanced, today: TODAY });
    expect(r.parts.sleep).toBe(100);
    expect(r.parts.strain).toBe(100);
    expect(r.loadRatio).toBeCloseTo(1);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.label).toBe('Primed');
  });

  it('renormalises over load + strain when sleep is missing', () => {
    const r = readinessScore({ sleepLog: {}, activities: balanced, today: TODAY });
    expect(r.parts.sleep).toBeNull();
    expect(r.score).toBe(Math.round((r.parts.load * 35 + r.parts.strain * 20) / 55));
  });

  it('tanks the load part on an acute spike', () => {
    const r = readinessScore({ sleepLog: sleep(8), activities: spike, today: TODAY });
    expect(r.loadRatio).toBeCloseTo(4);
    expect(r.parts.load).toBe(0);
    const rBalanced = readinessScore({ sleepLog: sleep(8), activities: balanced, today: TODAY });
    expect(r.score).toBeLessThan(rBalanced.score);
  });

  it('applies quality modifiers of ±10 around the hours base', () => {
    const rough = readinessScore({ sleepLog: sleep(6, 1), activities: [], today: TODAY });
    const okay = readinessScore({ sleepLog: sleep(6, 2), activities: [], today: TODAY });
    const great = readinessScore({ sleepLog: sleep(6, 3), activities: [], today: TODAY });
    expect(rough.parts.sleep).toBe(65);
    expect(okay.parts.sleep).toBe(75);
    expect(great.parts.sleep).toBe(85);
  });

  it('clamps the sleep part at 100 for long great sleep', () => {
    const r = readinessScore({ sleepLog: sleep(12, 3), activities: [], today: TODAY });
    expect(r.parts.sleep).toBe(100);
  });

  it('labels a wrecked morning Run down', () => {
    const r = readinessScore({ sleepLog: sleep(2, 1), activities: spike, today: TODAY });
    expect(r.label).toBe('Run down');
    expect(r.advice.length).toBeGreaterThan(0);
  });

  it('advice calls out the weakest part', () => {
    const r = readinessScore({ sleepLog: sleep(3), activities: balanced, today: TODAY });
    expect(r.parts.sleep).toBeLessThan(r.parts.load);
    expect(r.advice).toContain('sleep');
  });
});
