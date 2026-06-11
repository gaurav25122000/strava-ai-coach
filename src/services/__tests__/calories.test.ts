import { Activity, FoodLogEntry } from '../../store/useStore';
import {
  MEAL_ORDER,
  MEAL_LABELS,
  defaultMealForNow,
  eatenOn,
  burnedOn,
  macrosOn,
  mealsOn,
  calorieWeekSeries,
} from '../calories';

// Fixed calendar: 2026-06-01 is a Monday, so "today" 2026-06-11 is a Thursday.
const TODAY = new Date('2026-06-11T12:00:00');

let nextId = 1;
function food(over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: String(nextId++),
    date: '2026-06-10',
    meal: 'lunch',
    name: 'Dal bowl',
    calories: 400,
    quantity: 1,
    source: 'manual',
    loggedAt: '2026-06-10T13:00:00Z',
    ...over,
  };
}

function act(over: Partial<Activity> = {}): Activity {
  return {
    id: String(nextId++),
    type: 'Run',
    distance: 5000,
    movingTime: 1800,
    elapsedTime: 1900,
    totalElevationGain: 10,
    startDate: '2026-06-10T03:00:00Z',
    averageSpeed: 2.8,
    maxSpeed: 3.3,
    ...over,
  };
}

describe('meal constants', () => {
  it('MEAL_ORDER covers all four meals with labels', () => {
    expect(MEAL_ORDER).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    for (const m of MEAL_ORDER) {
      expect(MEAL_LABELS[m].length).toBeGreaterThan(0);
    }
  });
});

describe('defaultMealForNow', () => {
  it('07:00 → breakfast', () => {
    expect(defaultMealForNow(new Date('2026-06-11T07:00:00'))).toBe('breakfast');
  });

  it('12:00 → lunch', () => {
    expect(defaultMealForNow(new Date('2026-06-11T12:00:00'))).toBe('lunch');
  });

  it('18:00 → dinner', () => {
    expect(defaultMealForNow(new Date('2026-06-11T18:00:00'))).toBe('dinner');
  });

  it('22:30 → snack', () => {
    expect(defaultMealForNow(new Date('2026-06-11T22:30:00'))).toBe('snack');
  });
});

describe('eatenOn', () => {
  it('sums only entries on the requested day', () => {
    const log = [
      food({ date: '2026-06-10', calories: 300 }),
      food({ date: '2026-06-10', calories: 450 }),
      food({ date: '2026-06-11', calories: 999 }),
    ];
    expect(eatenOn(log, '2026-06-10')).toBe(750);
  });

  it('rounds the total', () => {
    const log = [
      food({ date: '2026-06-10', calories: 100.3 }),
      food({ date: '2026-06-10', calories: 100.3 }),
    ];
    expect(eatenOn(log, '2026-06-10')).toBe(201);
  });

  it('returns 0 for a day with no entries', () => {
    expect(eatenOn([food()], '2026-06-09')).toBe(0);
  });
});

describe('burnedOn', () => {
  it('sums activity calories per day', () => {
    const acts = [
      act({ startDate: '2026-06-10T03:00:00Z', calories: 320 }),
      act({ startDate: '2026-06-10T15:00:00Z', calories: 180 }),
      act({ startDate: '2026-06-11T03:00:00Z', calories: 500 }),
    ];
    expect(burnedOn(acts, '2026-06-10')).toBe(500);
  });

  it('buckets by startDateLocal when present, not startDate', () => {
    // UTC instant is late on 06-10, but the athlete's wall clock was 06-11.
    const a = act({
      startDate: '2026-06-10T22:30:00Z',
      startDateLocal: '2026-06-11T04:00:00Z',
      calories: 250,
    });
    expect(burnedOn([a], '2026-06-11')).toBe(250);
    expect(burnedOn([a], '2026-06-10')).toBe(0);
  });

  it('treats missing calories as 0', () => {
    const acts = [
      act({ startDate: '2026-06-10T03:00:00Z' }), // no calories field
      act({ startDate: '2026-06-10T15:00:00Z', calories: 100 }),
    ];
    expect(burnedOn(acts, '2026-06-10')).toBe(100);
  });
});

describe('macrosOn', () => {
  it('totals protein/carbs/fat for the day, defaulting missing macros to 0', () => {
    const log = [
      food({ date: '2026-06-10', protein: 20, carbs: 50, fat: 10 }),
      food({ date: '2026-06-10', protein: 15 }), // carbs/fat missing
      food({ date: '2026-06-11', protein: 99, carbs: 99, fat: 99 }),
    ];
    expect(macrosOn(log, '2026-06-10')).toEqual({ protein: 35, carbs: 50, fat: 10 });
  });

  it('rounds each macro total', () => {
    const log = [
      food({ date: '2026-06-10', protein: 10.4, carbs: 20.6, fat: 5.5 }),
    ];
    expect(macrosOn(log, '2026-06-10')).toEqual({ protein: 10, carbs: 21, fat: 6 });
  });

  it('returns zeros for an empty day', () => {
    expect(macrosOn([], '2026-06-10')).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});

describe('mealsOn', () => {
  it('groups the day entries by meal, preserving log order', () => {
    const b1 = food({ date: '2026-06-10', meal: 'breakfast', name: 'Poha' });
    const l1 = food({ date: '2026-06-10', meal: 'lunch', name: 'Thali' });
    const l2 = food({ date: '2026-06-10', meal: 'lunch', name: 'Lassi' });
    const other = food({ date: '2026-06-11', meal: 'lunch', name: 'Wrap' });
    const out = mealsOn([b1, l1, l2, other], '2026-06-10');
    expect(out.breakfast).toEqual([b1]);
    expect(out.lunch).toEqual([l1, l2]);
    expect(out.dinner).toEqual([]);
    expect(out.snack).toEqual([]);
  });

  it('always has all four meal keys, even for an empty day', () => {
    const out = mealsOn([], '2026-06-10');
    expect(Object.keys(out).sort()).toEqual(['breakfast', 'dinner', 'lunch', 'snack']);
    for (const m of MEAL_ORDER) expect(out[m]).toEqual([]);
  });
});

describe('calorieWeekSeries', () => {
  it('returns 7 days oldest → newest, ending on the injected today', () => {
    const series = calorieWeekSeries([], [], 7, TODAY);
    expect(series.map((d) => d.day)).toEqual([
      '2026-06-05', '2026-06-06', '2026-06-07',
      '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11',
    ]);
    expect(series[series.length - 1].day).toBe('2026-06-11');
  });

  it('labels each day with the weekday short name', () => {
    const series = calorieWeekSeries([], [], 7, TODAY);
    // 2026-06-05 is a Friday; today 2026-06-11 is a Thursday.
    expect(series.map((d) => d.label)).toEqual([
      'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu',
    ]);
  });

  it('populates eaten and burned per day', () => {
    const log = [
      food({ date: '2026-06-09', calories: 600 }),
      food({ date: '2026-06-11', calories: 350 }),
      food({ date: '2026-06-11', calories: 150 }),
    ];
    const acts = [
      act({ startDate: '2026-06-09T03:00:00Z', calories: 200 }),
      act({ startDate: '2026-06-11T03:00:00Z', calories: 450 }),
    ];
    const series = calorieWeekSeries(log, acts, 7, TODAY);
    const byDay = new Map(series.map((d) => [d.day, d]));
    expect(byDay.get('2026-06-09')).toMatchObject({ eaten: 600, burned: 200 });
    expect(byDay.get('2026-06-11')).toMatchObject({ eaten: 500, burned: 450 });
    expect(byDay.get('2026-06-10')).toMatchObject({ eaten: 0, burned: 0 });
  });

  it('respects a custom day count', () => {
    const series = calorieWeekSeries([], [], 3, TODAY);
    expect(series.map((d) => d.day)).toEqual(['2026-06-09', '2026-06-10', '2026-06-11']);
  });
});
