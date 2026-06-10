import { activityDayKey, formatPace, localDateStr, mondayIndex, mondayOf, weekKey } from '../dates';

describe('dates', () => {
  it('localDateStr never UTC-shifts', () => {
    expect(localDateStr(new Date(2026, 5, 10))).toBe('2026-06-10');
    expect(localDateStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('mondayOf handles Sunday (old inline math returned NEXT Monday)', () => {
    // 2026-06-07 is a Sunday → its week's Monday is 2026-06-01.
    expect(localDateStr(mondayOf(new Date(2026, 5, 7)))).toBe('2026-06-01');
    // A Monday maps to itself.
    expect(localDateStr(mondayOf(new Date(2026, 5, 1)))).toBe('2026-06-01');
    // Mid-week.
    expect(localDateStr(mondayOf(new Date(2026, 5, 10)))).toBe('2026-06-08');
  });

  it('weekKey buckets a full week to one key', () => {
    const keys = new Set(
      [1, 2, 3, 4, 5, 6, 7].map((d) => weekKey(new Date(2026, 5, d))),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('2026-06-01');
  });

  it('mondayIndex: Mon=0 … Sun=6', () => {
    expect(mondayIndex(new Date(2026, 5, 1))).toBe(0); // Monday
    expect(mondayIndex(new Date(2026, 5, 7))).toBe(6); // Sunday
  });

  it('activityDayKey prefers the athlete wall clock', () => {
    // Early-morning IST run: 2026-06-10 06:00 IST = 2026-06-09 00:30 UTC.
    const a = { startDate: '2026-06-09T00:30:00Z', startDateLocal: '2026-06-10T06:00:00Z' };
    expect(activityDayKey(a)).toBe('2026-06-10');
    // Legacy row without local date falls back to UTC.
    expect(activityDayKey({ startDate: '2026-06-09T00:30:00Z' })).toBe('2026-06-09');
  });

  it('formatPace converts decimal minutes to M:SS', () => {
    expect(formatPace(5.5)).toBe('5:30'); // the old toFixed hack said "5:50"
    expect(formatPace(4.0)).toBe('4:00');
    expect(formatPace(6.999)).toBe('7:00'); // rounds, never "6:60"
    expect(formatPace(0)).toBe('0:00');
    expect(formatPace(Infinity)).toBe('0:00');
  });
});
