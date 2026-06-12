import { deriveSteps, estimateCalories } from '../activityDerive';
import { mapSummaryActivity } from '../strava';

describe('deriveSteps', () => {
  it('doubles cadence for runs', () => {
    expect(deriveSteps({ type: 'Run', movingTime: 1800, distance: 5000, averageCadence: 80 }))
      .toBe(Math.round(80 * 2 * 30));
  });

  it('uses single cadence for non-runs', () => {
    expect(deriveSteps({ type: 'Walk', movingTime: 1800, distance: 2000, averageCadence: 50 }))
      .toBe(Math.round(50 * 30));
  });

  it('falls back to stride estimates for foot travel', () => {
    expect(deriveSteps({ type: 'Run', movingTime: 1800, distance: 5000 })).toBe(Math.round(5000 / 1.4));
    expect(deriveSteps({ type: 'Hike', movingTime: 3600, distance: 4000 })).toBe(Math.round(4000 / 0.75));
  });

  it('returns undefined for rides without cadence', () => {
    expect(deriveSteps({ type: 'Ride', movingTime: 3600, distance: 30000 })).toBeUndefined();
  });
});

describe('estimateCalories', () => {
  it('scales with MET, weight and duration', () => {
    // Fast run: MET 11 × 70 kg × 1 h.
    expect(estimateCalories({ type: 'Run', movingTime: 3600, averageSpeed: 4, weightKg: 70 })).toBe(770);
    // Easy walk: MET 3.8.
    expect(estimateCalories({ type: 'Walk', movingTime: 3600, averageSpeed: 1.4, weightKg: 70 })).toBe(266);
  });

  it('returns undefined for zero duration', () => {
    expect(estimateCalories({ type: 'Run', movingTime: 0, averageSpeed: 3, weightKg: 70 })).toBeUndefined();
  });
});

// Regression lock: extracting the shared helpers must not change how Strava
// summaries map — same numbers as the pre-refactor inline logic.
describe('mapSummaryActivity parity', () => {
  it('maps a Strava run summary exactly as before', () => {
    const a = mapSummaryActivity(
      {
        id: 123,
        name: 'Morning Run',
        sport_type: 'Run',
        distance: 10000,
        moving_time: 3000,
        elapsed_time: 3100,
        total_elevation_gain: 50,
        start_date: '2026-06-10T06:00:00Z',
        start_date_local: '2026-06-10T11:30:00Z',
        average_speed: 3.33,
        max_speed: 4.5,
        average_heartrate: 150,
        max_heartrate: 175,
        average_cadence: 82,
        suffer_score: 55,
        kudos_count: 7,
        start_latlng: [12.97, 77.59],
        map: { summary_polyline: 'abc' },
        total_photo_count: 2,
      },
      70,
    );
    expect(a.id).toBe('123');
    expect(a.type).toBe('Run');
    expect(a.steps).toBe(Math.round(82 * 2 * 50)); // cadence × 2 × minutes
    // No kilojoules → MET estimate: avg 3.33 m/s → MET 9.8 × 70 kg × (3000/3600) h.
    expect(a.calories).toBe(Math.round(9.8 * 70 * (3000 / 3600)));
    expect(a.caloriesEstimated).toBe(true);
    expect(a.startLatlng).toEqual([12.97, 77.59]);
    expect(a.polyline).toBe('abc');
    expect(a.kudosCount).toBe(7);
  });

  it('keeps kilojoules→kcal for rides (not flagged estimated)', () => {
    const a = mapSummaryActivity(
      {
        id: 9,
        sport_type: 'Ride',
        distance: 40000,
        moving_time: 5400,
        elapsed_time: 5600,
        total_elevation_gain: 300,
        start_date: '2026-06-09T06:00:00Z',
        average_speed: 7.4,
        max_speed: 15,
        kilojoules: 900.4,
        start_latlng: [],
      },
      70,
    );
    expect(a.calories).toBe(900);
    expect(a.caloriesEstimated).toBeUndefined();
    expect(a.startLatlng).toBeUndefined(); // [] from trainer rides stays undefined
  });
});
