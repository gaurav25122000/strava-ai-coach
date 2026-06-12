import { Activity } from '../../store/useStore';
import { monthlyBestSeries } from '../effortsHistory';

let nextId = 1;

function run(overrides: Partial<Activity> = {}): Activity {
  return {
    id: `a${nextId++}`,
    type: 'Run',
    distance: 5000,
    movingTime: 1500,
    elapsedTime: 1500,
    totalElevationGain: 0,
    startDate: '2026-03-10T06:00:00Z',
    startDateLocal: '2026-03-10T11:30:00Z',
    averageSpeed: 3.0, // m/s
    maxSpeed: 4.0,
    ...overrides,
  };
}

describe('monthlyBestSeries', () => {
  it('estimates smaller seconds for a faster average speed', () => {
    const slow = monthlyBestSeries([run({ averageSpeed: 2.5 })], 5000);
    const fast = monthlyBestSeries([run({ averageSpeed: 3.5 })], 5000);
    expect(fast[0].seconds).toBeLessThan(slow[0].seconds);
  });

  it('matches the computeBestEfforts estimation formula', () => {
    // estSecs = round((dist/1000) * (1000/avgSpeed/60) * 60) — i.e. dist/speed.
    const [point] = monthlyBestSeries([run({ averageSpeed: 3.2 })], 5000);
    const paceMinPerKm = 1000 / 3.2 / 60;
    expect(point.seconds).toBe(Math.round(5 * paceMinPerKm * 60));
  });

  it('keeps only the fastest run within each month', () => {
    const series = monthlyBestSeries(
      [
        run({ averageSpeed: 2.8, startDateLocal: '2026-03-05T07:00:00Z' }),
        run({ averageSpeed: 3.4, startDateLocal: '2026-03-20T07:00:00Z' }),
      ],
      5000,
    );
    expect(series).toHaveLength(1);
    expect(series[0].month).toBe('2026-03');
    expect(series[0].seconds).toBe(Math.round(5000 / 3.4));
  });

  it('buckets by local month and skips months with no qualifying run', () => {
    const series = monthlyBestSeries(
      [
        run({ startDateLocal: '2026-01-15T07:00:00Z' }),
        run({ startDateLocal: '2026-03-15T07:00:00Z' }),
      ],
      5000,
    );
    expect(series.map((p) => p.month)).toEqual(['2026-01', '2026-03']);
  });

  it('returns months sorted ascending regardless of input order', () => {
    const series = monthlyBestSeries(
      [
        run({ startDateLocal: '2026-04-01T07:00:00Z' }),
        run({ startDateLocal: '2026-02-01T07:00:00Z' }),
      ],
      5000,
    );
    expect(series.map((p) => p.month)).toEqual(['2026-02', '2026-04']);
  });

  it('skips runs too short to cover the target distance', () => {
    // 5K requires distance >= 4250 m (85%); 1K requires the full 1000 m.
    expect(monthlyBestSeries([run({ distance: 3000 })], 5000)).toEqual([]);
    expect(monthlyBestSeries([run({ distance: 999 })], 1000)).toEqual([]);
    expect(monthlyBestSeries([run({ distance: 4300 })], 5000)).toHaveLength(1);
  });

  it('ignores non-run activities and zero-speed entries', () => {
    expect(monthlyBestSeries([run({ type: 'Ride', distance: 20000 })], 5000)).toEqual([]);
    expect(monthlyBestSeries([run({ averageSpeed: 0 })], 5000)).toEqual([]);
  });
});
