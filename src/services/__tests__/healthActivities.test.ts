import {
  mapHKWorkout,
  mapHCSession,
  computeHrZoneBuckets,
  computeSplitsFromRoute,
  buildStreams,
  hrStatsFromSamples,
  elevationGainFromRoute,
  isHealthActivityId,
  cadenceFromSteps,
  averageByDay,
  foldDaily,
  HrSample,
  RoutePoint,
} from '../healthActivities';

const ZONES = [
  { min: 95, max: 114 },
  { min: 114, max: 133 },
  { min: 133, max: 152 },
  { min: 152, max: 171 },
  { min: 171, max: -1 },
];

describe('isHealthActivityId', () => {
  it('recognises health ids and rejects Strava ids', () => {
    expect(isHealthActivityId('hk:ABC-123')).toBe(true);
    expect(isHealthActivityId('hc:xyz')).toBe(true);
    expect(isHealthActivityId('1234567890')).toBe(false);
  });
});

describe('mapHKWorkout', () => {
  const base = {
    uuid: 'AAAA-BBBB',
    workoutActivityType: 37, // running
    startDate: '2026-06-10T06:00:00.000Z',
    endDate: '2026-06-10T06:50:00.000Z',
    duration: { quantity: 2940, unit: 's' },
    totalDistance: { quantity: 10000, unit: 'm' },
    totalEnergyBurned: { quantity: 640, unit: 'kcal' },
    metadata: {},
  };

  it('maps a HealthKit run onto the Activity shape', () => {
    const a = mapHKWorkout(base, 70, { avg: 152, max: 178 });
    expect(a.id).toBe('hk:AAAA-BBBB');
    expect(a.type).toBe('Run');
    expect(a.distance).toBe(10000);
    expect(a.movingTime).toBe(2940);
    expect(a.elapsedTime).toBe(3000);
    expect(a.startDate).toBe('2026-06-10T06:00:00.000Z');
    expect(a.averageSpeed).toBeCloseTo(10000 / 2940);
    expect(a.averageHeartRate).toBe(152);
    expect(a.maxHeartRate).toBe(178);
    // Real HealthKit energy — NOT flagged as estimated.
    expect(a.calories).toBe(640);
    expect(a.caloriesEstimated).toBeUndefined();
    // Run steps via stride estimate (no cadence from HK).
    expect(a.steps).toBe(Math.round(10000 / 1.4));
  });

  it('falls back to a MET calorie estimate when HK has no energy', () => {
    const a = mapHKWorkout({ ...base, totalEnergyBurned: undefined }, 70);
    expect(a.calories).toBeGreaterThan(0);
    expect(a.caloriesEstimated).toBe(true);
  });

  it('converts km distances and flags indoor workouts as trainer', () => {
    const a = mapHKWorkout(
      {
        ...base,
        workoutActivityType: 13, // cycling
        totalDistance: { quantity: 25, unit: 'km' },
        metadata: { HKIndoorWorkout: true },
      },
      70,
    );
    expect(a.type).toBe('Ride');
    expect(a.distance).toBe(25000);
    expect(a.trainer).toBe(true);
  });

  it('maps unknown activity types to Workout', () => {
    expect(mapHKWorkout({ ...base, workoutActivityType: 76 }, 70).type).toBe('Workout');
  });

  it('uses elapsed time when duration is missing', () => {
    const a = mapHKWorkout({ ...base, duration: undefined }, 70);
    expect(a.movingTime).toBe(3000);
  });
});

describe('mapHCSession', () => {
  it('maps a Health Connect session (distance/HR arrive via backfill)', () => {
    const a = mapHCSession(
      {
        metadata: { id: 'rec-1' },
        exerciseType: 56, // RUNNING
        startTime: '2026-06-10T06:00:00.000Z',
        endTime: '2026-06-10T06:45:00.000Z',
        title: 'Morning run',
      },
      70,
    );
    expect(a.id).toBe('hc:rec-1');
    expect(a.type).toBe('Run');
    expect(a.name).toBe('Morning run');
    expect(a.elapsedTime).toBe(2700);
    expect(a.distance).toBe(0);
    expect(a.caloriesEstimated).toBe(true);
  });

  it('flags stationary exercise types as trainer', () => {
    const a = mapHCSession(
      {
        metadata: { id: 'rec-2' },
        exerciseType: 9, // BIKING_STATIONARY
        startTime: '2026-06-10T06:00:00.000Z',
        endTime: '2026-06-10T07:00:00.000Z',
      },
      70,
    );
    expect(a.type).toBe('Ride');
    expect(a.trainer).toBe(true);
  });
});

describe('hrStatsFromSamples', () => {
  it('returns empty stats for no samples', () => {
    expect(hrStatsFromSamples([])).toEqual({});
  });

  it('computes duration-weighted average and max', () => {
    const t = Date.parse('2026-06-10T06:00:00Z');
    const samples: HrSample[] = [
      { bpm: 100, startMs: t, endMs: t + 10_000 },
      { bpm: 160, startMs: t + 10_000, endMs: t + 40_000 },
    ];
    const stats = hrStatsFromSamples(samples);
    expect(stats.max).toBe(160);
    expect(stats.avg).toBe(Math.round((100 * 10 + 160 * 30) / 40));
  });
});

describe('computeHrZoneBuckets', () => {
  it('buckets sample time into the matching zones', () => {
    const t = Date.parse('2026-06-10T06:00:00Z');
    const samples: HrSample[] = [
      { bpm: 120, startMs: t, endMs: t + 20_000 },
      { bpm: 140, startMs: t + 20_000, endMs: t + 50_000 },
      { bpm: 180, startMs: t + 50_000, endMs: t + 60_000 },
    ];
    const buckets = computeHrZoneBuckets(samples, ZONES);
    expect(buckets).toHaveLength(5);
    expect(buckets[1].time).toBe(20); // 120 bpm → Z2
    expect(buckets[2].time).toBe(30); // 140 bpm → Z3
    expect(buckets[4].time).toBe(10); // 180 bpm → Z5 (open-ended max -1)
    expect(buckets[0].time).toBe(0);
  });

  it('caps point-sample gaps so pauses do not inflate a zone', () => {
    const t = Date.parse('2026-06-10T06:00:00Z');
    // Instantaneous samples 10 min apart — each capped at 30 s of influence.
    const samples: HrSample[] = [
      { bpm: 120, startMs: t, endMs: t },
      { bpm: 120, startMs: t + 600_000, endMs: t + 600_000 },
    ];
    const buckets = computeHrZoneBuckets(samples, ZONES);
    expect(buckets[1].time).toBeLessThanOrEqual(60);
  });

  it('returns zero-time buckets when there are no samples', () => {
    expect(computeHrZoneBuckets([], ZONES).every((b) => b.time === 0)).toBe(true);
  });
});

// A straight north track: 1° latitude ≈ 111.32 km, so 0.00009° ≈ 10 m.
function track(points: number, stepM = 10, stepMs = 5000, altitude?: (i: number) => number): RoutePoint[] {
  const t0 = Date.parse('2026-06-10T06:00:00Z');
  return Array.from({ length: points }, (_, i) => ({
    latitude: 12 + (i * stepM) / 111_320,
    longitude: 77,
    altitude: altitude?.(i),
    timeMs: t0 + i * stepMs,
  }));
}

describe('computeSplitsFromRoute', () => {
  it('produces per-km splits with a partial tail', () => {
    // 250 points × 10 m = 2.49 km over 5 s steps.
    const splits = computeSplitsFromRoute(track(250));
    expect(splits.length).toBe(3);
    expect(splits[0].distance).toBe(1000);
    expect(splits[0].split).toBe(1);
    expect(splits[0].movingTime).toBeGreaterThan(0);
    expect(splits[2].distance).toBeLessThan(1000);
    expect(splits[2].distance).toBeGreaterThan(100);
  });

  it('returns nothing for routes under 100 m', () => {
    expect(computeSplitsFromRoute(track(3))).toEqual([]);
  });
});

describe('elevationGainFromRoute', () => {
  it('sums positive deltas above the noise floor', () => {
    const route = track(5, 10, 5000, (i) => [100, 110, 105, 120, 120][i]);
    expect(elevationGainFromRoute(route)).toBe(25); // +10 and +15 climbs
  });

  it('ignores missing altitudes', () => {
    expect(elevationGainFromRoute(track(10))).toBe(0);
  });
});

describe('buildStreams', () => {
  it('resamples HR and route onto one Strava-shaped timeline', () => {
    const t0 = Date.parse('2026-06-10T06:00:00Z');
    const hr: HrSample[] = Array.from({ length: 60 }, (_, i) => ({
      bpm: 130 + (i % 20),
      startMs: t0 + i * 10_000,
      endMs: t0 + i * 10_000,
    }));
    const route = track(120, 10, 5000, (i) => 100 + i * 0.5);
    const streams = buildStreams(hr, route, t0, 600);

    expect(streams.time.data.length).toBeGreaterThan(50);
    expect(streams.heartrate.data.length).toBe(streams.time.data.length);
    expect(streams.altitude.data.length).toBe(streams.time.data.length);
    expect(streams.distance.data.length).toBe(streams.time.data.length);
    // Monotone cumulative distance.
    const d = streams.distance.data;
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
    expect(Math.max(...streams.heartrate.data)).toBeLessThanOrEqual(149);
  });

  it('returns empty when there is nothing to chart', () => {
    expect(buildStreams([], [], 0, 600)).toEqual({});
  });
});

describe('cadenceFromSteps', () => {
  it('halves SPM for runs (per-leg Strava convention)', () => {
    // 5400 steps over 30 min = 180 spm → 90 per-leg.
    expect(cadenceFromSteps('Run', 5400, 1800)).toBe(90);
  });

  it('keeps full SPM for walks', () => {
    expect(cadenceFromSteps('Walk', 3000, 1800)).toBe(100);
  });

  it('returns undefined without steps or duration', () => {
    expect(cadenceFromSteps('Run', 0, 1800)).toBeUndefined();
    expect(cadenceFromSteps('Run', 5400, 0)).toBeUndefined();
  });
});

describe('mapHKWorkout power', () => {
  const base = {
    uuid: 'P-1',
    workoutActivityType: 37,
    startDate: '2026-06-10T06:00:00.000Z',
    endDate: '2026-06-10T06:50:00.000Z',
    duration: { quantity: 3000, unit: 's' },
    totalDistance: { quantity: 10000, unit: 'm' },
    metadata: {},
  };

  it('carries running power into averageWatts as device watts', () => {
    const a = mapHKWorkout(base, 70, { avg: 150, max: 175, watts: 285 });
    expect(a.averageWatts).toBe(285);
    expect(a.deviceWatts).toBe(true);
  });

  it('leaves watts fields off without power data', () => {
    const a = mapHKWorkout(base, 70, { avg: 150 });
    expect(a.averageWatts).toBeUndefined();
    expect(a.deviceWatts).toBeUndefined();
  });
});

describe('daily rollup helpers', () => {
  it('averageByDay buckets instantaneous records per local day', () => {
    // Local-time Dates keep the day bucketing timezone-independent.
    const byDay = averageByDay([
      { time: new Date(2026, 5, 10, 6, 0), value: 50 },
      { time: new Date(2026, 5, 10, 22, 0), value: 54 },
      { time: new Date(2026, 5, 11, 6, 0), value: 48 },
      { time: new Date(2026, 5, 11, 7, 0), value: Number.NaN },
    ]);
    expect(byDay).toEqual({ '2026-06-10': 52, '2026-06-11': 48 });
  });

  it('foldDaily merges fields without clobbering other metrics', () => {
    const into: Record<string, any> = { '2026-06-10': { restingHR: 50 } };
    foldDaily(into, 'hrv', { '2026-06-10': 62, '2026-06-11': 58, '2026-06-12': Number.NaN });
    expect(into['2026-06-10']).toEqual({ restingHR: 50, hrv: 62 });
    expect(into['2026-06-11']).toEqual({ hrv: 58 });
    expect(into['2026-06-12']).toBeUndefined();
  });
});
