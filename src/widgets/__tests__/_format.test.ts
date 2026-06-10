import {
  activityWeekKey,
  dayKeyToDate,
  formatDuration,
  monthlyKmBuckets,
  paceMinPerKm,
} from '../_format';
import { localDateStr } from '../../utils/dates';

describe('_format widget helpers', () => {
  it('formatDuration renders h/m and bare minutes', () => {
    expect(formatDuration(3900)).toBe('1h 5m');
    expect(formatDuration(540)).toBe('9m');
  });

  it('paceMinPerKm converts m/s and guards non-positive speeds', () => {
    expect(paceMinPerKm(1000 / 300)).toBeCloseTo(5);
    expect(paceMinPerKm(0)).toBe(0);
  });

  it('dayKeyToDate round-trips a local day key without UTC shift', () => {
    expect(localDateStr(dayKeyToDate('2026-06-08'))).toBe('2026-06-08');
  });

  it('activityWeekKey buckets by the local day, Monday-keyed', () => {
    // 2026-06-07 is a Sunday → its week's Monday is 2026-06-01.
    expect(activityWeekKey({ startDate: '2026-06-07T22:00:00Z' })).toBe('2026-06-01');
    // startDateLocal wins over the UTC instant.
    expect(
      activityWeekKey({ startDate: '2026-06-08T01:00:00Z', startDateLocal: '2026-06-07T18:00:00Z' }),
    ).toBe('2026-06-01');
  });

  it('monthlyKmBuckets sums the current month and drops months outside the window', () => {
    const now = new Date();
    const thisMonth = localDateStr(new Date(now.getFullYear(), now.getMonth(), 15));
    const tooOld = localDateStr(new Date(now.getFullYear(), now.getMonth() - 13, 15));
    const buckets = monthlyKmBuckets(
      [
        { startDate: `${thisMonth}T07:00:00Z`, distance: 5000 },
        { startDate: `${thisMonth}T17:00:00Z`, distance: 5400 },
        { startDate: `${tooOld}T07:00:00Z`, distance: 99000 },
      ],
      12,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[11].km).toBe(10); // 10.4 km rounded
    expect(buckets.slice(0, 11).every((b) => b.km === 0)).toBe(true);
  });
});
