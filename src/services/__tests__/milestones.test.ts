import { Activity } from '../../store/useStore';
import {
  computeMilestoneProgress,
  computeMilestones,
  getAllMilestoneDefs,
} from '../milestones';

// Fixed calendar: 2026-06-01 is a Monday, so 2026-06-06 is a Saturday and
// 2026-06-07 is a Sunday.

let nextId = 1;
function act(over: Partial<Activity> = {}): Activity {
  return {
    id: String(nextId++),
    type: 'Walk',
    distance: 3000,
    movingTime: 1800,
    elapsedTime: 1900,
    totalElevationGain: 0,
    startDate: '2026-06-01T06:30:00Z',
    averageSpeed: 1.67,
    maxSpeed: 2,
    ...over,
  };
}

function earned(activities: Activity[]): Map<string, string> {
  const ms = computeMilestones(activities, [], { totalKm: 0, currentStreak: 0, bestStreak: 0 });
  return new Map(ms.map((m) => [m.id, m.earnedAt]));
}

describe('milestone registry', () => {
  it('has ~100 unique badge definitions', () => {
    const defs = getAllMilestoneDefs();
    expect(defs.length).toBeGreaterThanOrEqual(100);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.icon.length).toBeGreaterThan(0);
    }
  });

  it('every progress spec maps to a real badge', () => {
    const ids = new Set(getAllMilestoneDefs().map((d) => d.id));
    for (const key of Object.keys(computeMilestoneProgress([]))) {
      expect(ids.has(key)).toBe(true);
    }
  });
});

describe('walk badges', () => {
  it('a 5 km walk earns walk_5k but not the run-only km_5', () => {
    const e = earned([act({ distance: 5200 })]);
    expect(e.has('walk_5k')).toBe(true);
    expect(e.has('km_5')).toBe(false);
  });

  it('hikes count as walks', () => {
    const e = earned([act({ type: 'Hike', distance: 11000 })]);
    expect(e.has('walk_10k')).toBe(true);
  });

  it('brisk 3 km+ walk earns Power Walker; a short stroll does not', () => {
    // 1.8 m/s ≈ 9:15 min/km
    expect(earned([act({ distance: 3200, averageSpeed: 1.8 })]).has('walk_pace10')).toBe(true);
    expect(earned([act({ distance: 800, averageSpeed: 1.8 })]).has('walk_pace10')).toBe(false);
  });
});

describe('time-of-day badges are sport-agnostic', () => {
  it('a 5am walk earns Early Bird', () => {
    const e = earned([act({ startDateLocal: '2026-06-01T05:30:00Z' })]);
    expect(e.has('early_bird')).toBe(true);
  });

  it('Sunrise Chaser needs 10 distinct early days', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      act({
        startDate: `2026-05-${String(i + 1).padStart(2, '0')}T06:00:00Z`,
        startDateLocal: `2026-05-${String(i + 1).padStart(2, '0')}T06:00:00Z`,
      }),
    );
    expect(earned(nine).has('early10')).toBe(false);
    const tenth = act({
      startDate: '2026-05-10T06:00:00Z',
      startDateLocal: '2026-05-10T06:00:00Z',
    });
    expect(earned([...nine, tenth]).get('early10')).toBe(tenth.startDate);
  });
});

describe('consistency badges', () => {
  it('Weekend Warrior needs Sat + Sun of the SAME weekend', () => {
    const sat = act({ startDate: '2026-06-06T08:00:00Z' });
    const sun = act({ startDate: '2026-06-07T08:00:00Z' });
    expect(earned([sat, sun]).get('weekend')).toBe(sun.startDate);

    // Sunday then Saturday of the NEXT weekend — no pair.
    const nextSat = act({ startDate: '2026-06-13T08:00:00Z' });
    expect(earned([sun, nextSat]).has('weekend')).toBe(false);
  });

  it('Daily Double and Hat Trick', () => {
    const day = [
      act({ startDate: '2026-06-01T06:00:00Z' }),
      act({ startDate: '2026-06-01T18:00:00Z' }),
    ];
    const e2 = earned(day);
    expect(e2.get('double_day')).toBe('2026-06-01T18:00:00Z');
    expect(e2.has('triple_day')).toBe(false);
    const e3 = earned([...day, act({ startDate: '2026-06-01T21:00:00Z' })]);
    expect(e3.has('triple_day')).toBe(true);
  });

  it('Habit Builder needs 4 consecutive active weeks', () => {
    const weekly = ['2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01'].map((d) =>
      act({ startDate: `${d}T08:00:00Z` }),
    );
    expect(earned(weekly).get('weeks4')).toBe('2026-06-01T08:00:00Z');

    const gapped = ['2026-05-11', '2026-05-18', '2026-06-01', '2026-06-08'].map((d) =>
      act({ startDate: `${d}T08:00:00Z` }),
    );
    expect(earned(gapped).has('weeks4')).toBe(false);
  });

  it('Big Month needs 100 km inside ONE calendar month', () => {
    const sameMonth = [
      act({ type: 'Ride', distance: 60000, startDate: '2026-06-02T08:00:00Z' }),
      act({ type: 'Ride', distance: 60000, startDate: '2026-06-20T08:00:00Z' }),
    ];
    expect(earned(sameMonth).get('month100')).toBe('2026-06-20T08:00:00Z');

    const split = [
      act({ type: 'Ride', distance: 60000, startDate: '2026-05-31T08:00:00Z' }),
      act({ type: 'Ride', distance: 60000, startDate: '2026-06-01T08:00:00Z' }),
    ];
    const e = earned(split);
    expect(e.has('month100')).toBe(false);
    expect(e.has('month50')).toBe(true);
  });
});

describe('duration badges', () => {
  it('a 90-minute activity earns Hour of Power but not Two-Hour Epic', () => {
    const e = earned([act({ movingTime: 5400 })]);
    expect(e.has('hour_1')).toBe(true);
    expect(e.has('hour_2')).toBe(false);
  });

  it('Ten Hours In back-dates to the activity that crossed 10 h', () => {
    const acts = Array.from({ length: 11 }, (_, i) =>
      act({
        movingTime: 3600,
        startDate: `2026-05-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      }),
    );
    expect(earned(acts).get('time10h')).toBe('2026-05-10T08:00:00Z');
  });
});

describe('variety and community badges', () => {
  it('Variety Pack unlocks on the third distinct sport', () => {
    const acts = [
      act({ type: 'Walk', startDate: '2026-06-01T08:00:00Z' }),
      act({ type: 'Run', startDate: '2026-06-02T08:00:00Z' }),
      act({ type: 'Ride', startDate: '2026-06-03T08:00:00Z' }),
    ];
    const e = earned(acts);
    expect(e.get('sports3')).toBe('2026-06-03T08:00:00Z');
    expect(e.has('sports5')).toBe(false);
  });

  it('kudos badges', () => {
    expect(earned([act({ kudosCount: 12 })]).has('kudos10')).toBe(true);
    expect(earned([act({ kudosCount: 9 })]).has('kudos10')).toBe(false);
  });

  it('elevation badges are sport-agnostic', () => {
    const e = earned([act({ type: 'Hike', totalElevationGain: 250 })]);
    expect(e.has('elev100')).toBe(true);
    expect(e.has('elev200')).toBe(true);
    expect(e.has('elev500')).toBe(false);
  });
});

describe('progress toward new badges', () => {
  it('walk count and week streak progress', () => {
    const acts = [
      act({ startDate: '2026-05-25T08:00:00Z' }),
      act({ startDate: '2026-06-01T08:00:00Z' }),
      act({ startDate: '2026-06-02T08:00:00Z' }),
      act({ startDate: '2026-06-03T08:00:00Z' }),
      act({ startDate: '2026-06-04T08:00:00Z' }),
    ];
    const p = computeMilestoneProgress(acts);
    expect(p.walks10.current).toBe(5);
    expect(p.walks10.pct).toBe(0.5);
    expect(p.weeks4.current).toBe(2);
    expect(p.weeks4.pct).toBe(0.5);
    expect(p.hour_1.current).toBe(30);
    expect(p.month50.current).toBeCloseTo(12, 5);
  });
});
