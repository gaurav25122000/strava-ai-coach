import { Activity, Milestone } from '../../store/useStore';
import { monthStats, monthsWithData, monthTitle } from '../wrapped';

// Fixed calendar: 2026-06-01 is a Monday, so Jun 1-7 and Jun 8-14 are whole
// Monday-Sunday weeks inside the month.

let nextId = 1;
function act(over: Partial<Activity> = {}): Activity {
  return {
    id: String(nextId++),
    type: 'Run',
    distance: 5000,
    movingTime: 1800,
    elapsedTime: 1900,
    totalElevationGain: 0,
    startDate: '2026-06-03T06:30:00Z',
    startDateLocal: '2026-06-03T12:00:00Z',
    averageSpeed: 2.78,
    maxSpeed: 3,
    ...over,
  };
}

function on(day: string, over: Partial<Activity> = {}): Activity {
  return act({ startDate: `${day}T06:30:00Z`, startDateLocal: `${day}T12:00:00Z`, ...over });
}

function badge(id: string, earnedAt: string): Milestone {
  return { id, title: id, description: id, icon: '🏅', category: 'distance', earnedAt };
}

describe('monthsWithData', () => {
  it('returns unique months, newest first', () => {
    const months = monthsWithData([
      on('2026-04-10'),
      on('2026-06-02'),
      on('2026-06-20'),
      on('2025-12-31'),
    ]);
    expect(months).toEqual(['2026-06', '2026-04', '2025-12']);
  });

  it('is empty with no activities', () => {
    expect(monthsWithData([])).toEqual([]);
  });
});

describe('monthStats', () => {
  it('only counts activities inside the requested month', () => {
    const s = monthStats(
      [
        on('2026-06-02', { distance: 10000, movingTime: 3600, totalElevationGain: 120, kudosCount: 3, calories: 600 }),
        on('2026-06-15', { distance: 5000, movingTime: 1800, totalElevationGain: 30, kudosCount: 2, calories: 300 }),
        on('2026-05-20', { distance: 99000, kudosCount: 50, calories: 9000 }),
      ],
      [],
      '2026-06',
    );
    expect(s.km).toBeCloseTo(15);
    expect(s.hours).toBeCloseTo(1.5);
    expect(s.elevation).toBe(150);
    expect(s.count).toBe(2);
    expect(s.totalKudos).toBe(5);
    expect(s.calories).toBe(900);
  });

  it('activeDays counts distinct days, not activities', () => {
    const s = monthStats(
      [on('2026-06-02'), on('2026-06-02'), on('2026-06-03')],
      [],
      '2026-06',
    );
    expect(s.count).toBe(3);
    expect(s.activeDays).toBe(2);
  });

  it('topSport is the sport with the higher count', () => {
    const s = monthStats(
      [
        on('2026-06-02', { type: 'Run', distance: 1000 }),
        on('2026-06-03', { type: 'Run', distance: 1000 }),
        on('2026-06-04', { type: 'Ride', distance: 90000 }),
      ],
      [],
      '2026-06',
    );
    expect(s.topSport).toEqual({ type: 'Run', count: 2 });
  });

  it('topSport count tie breaks on distance', () => {
    const s = monthStats(
      [
        on('2026-06-02', { type: 'Run', distance: 5000 }),
        on('2026-06-03', { type: 'Ride', distance: 40000 }),
      ],
      [],
      '2026-06',
    );
    expect(s.topSport).toEqual({ type: 'Ride', count: 1 });
  });

  it('longest picks the biggest single activity with name and day key', () => {
    const s = monthStats(
      [
        on('2026-06-02', { distance: 8000, name: 'Easy loop' }),
        on('2026-06-14', { distance: 21100, name: 'Half marathon!' }),
      ],
      [],
      '2026-06',
    );
    expect(s.longest).toEqual({ name: 'Half marathon!', km: 21.1, dayKey: '2026-06-14' });
  });

  it('longest falls back to the sport type when unnamed, null on empty month', () => {
    const named = monthStats([on('2026-06-02', { type: 'Ride' })], [], '2026-06');
    expect(named.longest?.name).toBe('Ride');
    const empty = monthStats([on('2026-05-02')], [], '2026-06');
    expect(empty.longest).toBeNull();
    expect(empty.topSport).toBeNull();
  });

  it('bestWeekKm is the biggest Monday-Sunday week inside the month', () => {
    const s = monthStats(
      [
        on('2026-06-02', { distance: 5000 }),  // week of Jun 1
        on('2026-06-03', { distance: 5000 }),  // week of Jun 1
        on('2026-06-09', { distance: 12000 }), // week of Jun 8
      ],
      [],
      '2026-06',
    );
    expect(s.bestWeekKm).toBeCloseTo(12);
  });

  it('deltaPct compares against the previous month', () => {
    const s = monthStats(
      [on('2026-05-10', { distance: 10000 }), on('2026-06-10', { distance: 15000 })],
      [],
      '2026-06',
    );
    expect(s.prevMonthKm).toBeCloseTo(10);
    expect(s.deltaPct).toBeCloseTo(50);
  });

  it('deltaPct handles a year boundary (Dec → Jan)', () => {
    const s = monthStats(
      [on('2025-12-10', { distance: 20000 }), on('2026-01-10', { distance: 10000 })],
      [],
      '2026-01',
    );
    expect(s.deltaPct).toBeCloseTo(-50);
  });

  it('deltaPct is null when the previous month has no data', () => {
    const s = monthStats([on('2026-06-10')], [], '2026-06');
    expect(s.prevMonthKm).toBe(0);
    expect(s.deltaPct).toBeNull();
  });

  it('badges keeps only milestones earned in the month', () => {
    const s = monthStats(
      [on('2026-06-10')],
      [
        badge('june_day', '2026-06-14'),
        badge('june_iso', '2026-06-02T07:15:00Z'),
        badge('may', '2026-05-30'),
      ],
      '2026-06',
    );
    expect(s.badges.map((b) => b.id)).toEqual(['june_day', 'june_iso']);
  });
});

describe('monthTitle', () => {
  it('formats long and short month names', () => {
    expect(monthTitle('2026-06')).toBe('June 2026');
    expect(monthTitle('2026-06', true)).toBe('Jun 2026');
    expect(monthTitle('2025-12', true)).toBe('Dec 2025');
  });
});
