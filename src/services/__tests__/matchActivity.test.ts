import assert from 'node:assert/strict';
import type { Activity, DailyPrescription, WorkoutKind } from '../../store/useStore';
import { matchActivityToPrescription } from '../matchActivity';

// Minimal factories — only the fields the matcher reads need to be real.
function act(p: Partial<Activity>): Activity {
  return {
    id: 'a1',
    type: 'Run',
    distance: 0,
    movingTime: 0,
    elapsedTime: 0,
    totalElevationGain: 0,
    startDate: '2027-05-29T08:00:00Z',
    averageSpeed: 0,
    maxSpeed: 0,
    ...p,
  } as Activity;
}

function presc(p: Partial<DailyPrescription>): DailyPrescription {
  return {
    dayOfWeek: 4,
    kind: 'EASY',
    title: 't',
    description: 'd',
    ...p,
  } as DailyPrescription;
}

function hrZones(dominantZone: number): Activity['zones'] {
  // 5 buckets; put the most time in the dominant zone (1-indexed).
  const buckets = [0, 0, 0, 0, 0].map((_, i) => ({
    min: i * 30,
    max: i * 30 + 30,
    time: i === dominantZone - 1 ? 1000 : 10,
  })) as any;
  return [{ type: 'heartrate', buckets, fetchedAt: '2027-05-29T09:00:00Z' }];
}

const tests: Array<[string, () => void]> = [
  ['clean match: right discipline + full distance', () => {
    const r = matchActivityToPrescription(act({ type: 'Run', distance: 10000 }), presc({ kind: 'LONG', distanceKm: 10 }));
    assert.equal(r.verdict, 'matched');
    assert.equal(r.completed, true);
  }],
  ['wrong discipline: ride on a run day → mismatch, not done', () => {
    const r = matchActivityToPrescription(act({ type: 'Ride', distance: 30000 }), presc({ kind: 'LONG', distanceKm: 12 }));
    assert.equal(r.verdict, 'mismatch');
    assert.equal(r.completed, false);
    assert.match(r.reason, /Ride/);
  }],
  ['too short: 3km of a 12km long run → partial, not done', () => {
    const r = matchActivityToPrescription(act({ type: 'Run', distance: 3000 }), presc({ kind: 'LONG', distanceKm: 12 }));
    assert.equal(r.verdict, 'partial');
    assert.equal(r.completed, false);
    assert.match(r.reason, /3\.0 km of the 12 km/);
  }],
  ['close enough: 8.5km of a 10km run (>=70%) → matched', () => {
    const r = matchActivityToPrescription(act({ type: 'Run', distance: 8500 }), presc({ kind: 'EASY', distanceKm: 10 }));
    assert.equal(r.verdict, 'matched');
  }],
  ['intensity: easy Z2 day run hard (dominant Z5) → partial', () => {
    const r = matchActivityToPrescription(
      act({ type: 'Run', distance: 10000, zones: hrZones(5) }),
      presc({ kind: 'EASY', distanceKm: 10, intensity: 'Z2' }),
    );
    assert.equal(r.verdict, 'partial');
    assert.match(r.reason, /hard/i);
  }],
  ['intensity: hard Z4 session done easy (dominant Z1) → partial', () => {
    const r = matchActivityToPrescription(
      act({ type: 'Run', distance: 8000, zones: hrZones(1) }),
      presc({ kind: 'INTERVALS', distanceKm: 8, intensity: 'Z4' }),
    );
    assert.equal(r.verdict, 'partial');
  }],
  ['intensity matches: easy Z2 day at Z2 → matched', () => {
    const r = matchActivityToPrescription(
      act({ type: 'Run', distance: 10000, zones: hrZones(2) }),
      presc({ kind: 'EASY', distanceKm: 10, intensity: 'Z2' }),
    );
    assert.equal(r.verdict, 'matched');
  }],
  ['no zone data: intensity not penalised → matched', () => {
    const r = matchActivityToPrescription(act({ type: 'Run', distance: 10000 }), presc({ kind: 'EASY', distanceKm: 10, intensity: 'Z2' }));
    assert.equal(r.verdict, 'matched');
  }],
  ['duration target: 40min of a 60min strength → partial', () => {
    const r = matchActivityToPrescription(act({ type: 'Workout', movingTime: 40 * 60 }), presc({ kind: 'STRENGTH', durationMin: 60 }));
    assert.equal(r.verdict, 'partial');
  }],
  ['duration target met: 55min of a 60min strength → matched', () => {
    const r = matchActivityToPrescription(act({ type: 'Workout', movingTime: 55 * 60 }), presc({ kind: 'STRENGTH', durationMin: 60 }));
    assert.equal(r.verdict, 'matched');
  }],
  ['rest day bonus: any session on a REST day → matched (bonus)', () => {
    const r = matchActivityToPrescription(act({ type: 'Run', distance: 5000 }), presc({ kind: 'REST' }));
    assert.equal(r.verdict, 'matched');
    assert.equal(r.completed, true);
    assert.match(r.reason, /[Bb]onus/);
  }],
  ['recovery accepts a walk → matched', () => {
    const r = matchActivityToPrescription(act({ type: 'Walk', distance: 3000 }), presc({ kind: 'RECOVERY' }));
    assert.equal(r.verdict, 'matched');
  }],
];

let passed = 0;
const failures: string[] = [];
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${(e as Error).message.split('\n')[0]}`);
  }
}

console.log(`matchActivity: ${passed}/${tests.length} passed`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
