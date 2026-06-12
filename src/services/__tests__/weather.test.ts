import { WeatherDay, WeatherHour, WeatherSnapshot } from '../../store/useStore';
import { bestWindow, weatherContext, weatherLine, wmoIcon } from '../weather';
import { mapSummaryActivity } from '../strava';

const YESTERDAY = '2026-06-11';
const DAY = '2026-06-12';
const TOMORROW = '2026-06-13';

function hour(day: string, h: number, apparentC: number, over: Partial<WeatherHour> = {}): WeatherHour {
  return {
    time: `${day}T${String(h).padStart(2, '0')}:00`,
    tempC: apparentC,
    apparentC,
    precipProb: 0,
    windKph: 5,
    code: 1,
    ...over,
  };
}

function day(date: string, over: Partial<WeatherDay> = {}): WeatherDay {
  return {
    date,
    tMaxC: 28,
    tMinC: 14,
    precipProb: 10,
    code: 1,
    sunrise: `${date}T05:50`,
    sunset: `${date}T18:40`,
    ...over,
  };
}

function snap(hourly: WeatherHour[], daily: WeatherDay[], fetchedAt = new Date().toISOString()): WeatherSnapshot {
  return { fetchedAt, lat: 12.97, lon: 77.59, hourly, daily };
}

/** Hours 06–20: cool morning, hot midday, mild evening. */
function typicalDay(d: string, over: (h: number) => Partial<WeatherHour> = () => ({})): WeatherHour[] {
  const out: WeatherHour[] = [];
  for (let h = 6; h <= 20; h++) {
    const apparent = h <= 8 ? 12 : h <= 10 ? 20 : h <= 15 ? 32 : h <= 17 ? 24 : 16;
    out.push(hour(d, h, apparent, over(h)));
  }
  return out;
}

describe('bestWindow', () => {
  it('picks the cool dry morning over hot noon', () => {
    const win = bestWindow(snap(typicalDay(DAY), [day(DAY)]), DAY);
    expect(win).not.toBeNull();
    expect(win!.startHour).toBeGreaterThanOrEqual(6);
    expect(win!.startHour).toBeLessThanOrEqual(7);
    expect(win!.endHour - win!.startHour).toBe(2);
    expect(win!.label).toContain('AM');
  });

  it('shifts the window away from a rainy morning', () => {
    const rainyMorning = typicalDay(DAY, (h) => (h <= 10 ? { precipProb: 90 } : {}));
    const win = bestWindow(snap(rainyMorning, [day(DAY)]), DAY);
    expect(win).not.toBeNull();
    // Mild dry evening (18–20h, 16°) now beats the cool-but-soaked morning.
    expect(win!.startHour).toBeGreaterThanOrEqual(18);
  });

  it('returns null when the snapshot has no hours for that day', () => {
    expect(bestWindow(snap(typicalDay(DAY), [day(DAY)]), TOMORROW)).toBeNull();
  });
});

describe('weatherLine', () => {
  it('includes current temp, best window and rain warning', () => {
    const hours = typicalDay(DAY, (h) => (h >= 14 ? { precipProb: 75 } : {}));
    const line = weatherLine(snap(hours, [day(DAY)]), DAY);
    expect(line).toContain('12° now');
    expect(line).toContain('best window');
    expect(line).toContain('rain likely from 14:00');
  });
});

describe('weatherContext', () => {
  // Labels are anchored to real dates, so pin "now" to 08:00 on DAY.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(`${DAY}T08:00:00`));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders a WEATHER block with today and tomorrow', () => {
    const hours = [...typicalDay(DAY), ...typicalDay(TOMORROW)];
    const ctx = weatherContext(snap(hours, [day(DAY), day(TOMORROW, { precipProb: 70 })]));
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('WEATHER (next 48h)');
    expect(ctx).toContain(`Today (${DAY}): 14–28°C, 10% precip`);
    expect(ctx).toContain(`Tomorrow (${TOMORROW})`);
    expect(ctx).toContain('70% precip');
    expect(ctx).toContain('best workout window');
  });

  it('skips yesterday in a still-fresh snapshot and labels the real dates', () => {
    // Fetched 21:00 yesterday — 11 h old, passes the 12 h staleness check,
    // but daily[0] is yesterday and must not be called "Today".
    const fetchedAt = new Date(`${YESTERDAY}T21:00:00`).toISOString();
    const hours = [...typicalDay(DAY), ...typicalDay(TOMORROW)];
    const ctx = weatherContext(
      snap(hours, [day(YESTERDAY), day(DAY), day(TOMORROW)], fetchedAt),
    );
    expect(ctx).not.toBeNull();
    expect(ctx).toContain(`Today (${DAY})`);
    expect(ctx).toContain(`Tomorrow (${TOMORROW})`);
    expect(ctx).not.toContain(YESTERDAY);
  });

  it('returns null when every daily entry is before today', () => {
    const fetchedAt = new Date(`${YESTERDAY}T21:00:00`).toISOString();
    expect(weatherContext(snap(typicalDay(YESTERDAY), [day(YESTERDAY)], fetchedAt))).toBeNull();
  });

  it('returns null for a null or stale snapshot', () => {
    expect(weatherContext(null)).toBeNull();
    const stale = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    expect(weatherContext(snap(typicalDay(DAY), [day(DAY)], stale))).toBeNull();
  });
});

describe('wmoIcon', () => {
  it('maps WMO codes to icon groups', () => {
    expect(wmoIcon(0)).toBe('sun');
    expect(wmoIcon(3)).toBe('cloud');
    expect(wmoIcon(61)).toBe('rain');
    expect(wmoIcon(80)).toBe('rain');
    expect(wmoIcon(71)).toBe('snow');
    expect(wmoIcon(95)).toBe('storm');
  });
});

describe('mapSummaryActivity start_latlng guard', () => {
  const item = {
    id: 123,
    name: 'Morning Run',
    sport_type: 'Run',
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1900,
    total_elevation_gain: 10,
    start_date: '2026-06-10T03:00:00Z',
    start_date_local: '2026-06-10T08:30:00',
    average_speed: 2.8,
    max_speed: 3.3,
  };

  it('maps a valid 2-element pair', () => {
    const a = mapSummaryActivity({ ...item, start_latlng: [12.97, 77.59] }, 70);
    expect(a.startLatlng).toEqual([12.97, 77.59]);
  });

  it('drops Strava\'s empty array (treadmill/trainer) and bad values', () => {
    expect(mapSummaryActivity({ ...item, start_latlng: [] }, 70).startLatlng).toBeUndefined();
    expect(mapSummaryActivity({ ...item, start_latlng: [null, 77.59] }, 70).startLatlng).toBeUndefined();
    expect(mapSummaryActivity({ ...item }, 70).startLatlng).toBeUndefined();
  });
});
