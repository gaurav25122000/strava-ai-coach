import { Goal } from '../../store/useStore';
import { TAPER_CHECKLIST, taperState } from '../taper';

// Fixed "today" so the 0/6/13/21-day window edges are deterministic.
const TODAY = new Date('2026-06-12T10:00:00');

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'City 10K',
    targetDate: '2026-06-28',
    daysRemaining: 16,
    type: 'Race',
    metric: '',
    progress: 0,
    phase: 'Taper',
    weeklyVolume: { current: 0, target: 30 },
    longRun: { current: 0, target: 14 },
    keyWorkout: '',
    ...overrides,
  };
}

function daysAhead(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('taperState', () => {
  it('returns null when the race is more than 21 days out', () => {
    expect(taperState([goal({ targetDate: daysAhead(22) })], TODAY)).toBeNull();
  });

  it('enters pre-taper exactly at 21 days', () => {
    const state = taperState([goal({ targetDate: daysAhead(21) })], TODAY);
    expect(state?.daysToRace).toBe(21);
    expect(state?.weekPhase).toBe('pre-taper');
  });

  it('switches pre-taper → taper at the 13-day edge', () => {
    expect(taperState([goal({ targetDate: daysAhead(14) })], TODAY)?.weekPhase).toBe('pre-taper');
    expect(taperState([goal({ targetDate: daysAhead(13) })], TODAY)?.weekPhase).toBe('taper');
    expect(taperState([goal({ targetDate: daysAhead(7) })], TODAY)?.weekPhase).toBe('taper');
  });

  it('switches taper → race week at the 6-day edge', () => {
    expect(taperState([goal({ targetDate: daysAhead(6) })], TODAY)?.weekPhase).toBe('race week');
  });

  it('treats race day itself as race week', () => {
    const state = taperState([goal({ targetDate: daysAhead(0) })], TODAY);
    expect(state?.daysToRace).toBe(0);
    expect(state?.weekPhase).toBe('race week');
  });

  it('returns null for a past race', () => {
    expect(taperState([goal({ targetDate: daysAhead(-1) })], TODAY)).toBeNull();
  });

  it('skips non-race goals', () => {
    const simple = goal({ id: 'simple', type: 'Simple', targetDate: daysAhead(5) });
    const volume = goal({ id: 'vol', type: 'Volume', targetDate: daysAhead(5) });
    expect(taperState([simple, volume], TODAY)).toBeNull();
  });

  it('picks the first in-window race goal', () => {
    const farRace = goal({ id: 'far', targetDate: daysAhead(40) });
    const nearRace = goal({ id: 'near', targetDate: daysAhead(10) });
    const state = taperState([farRace, nearRace], TODAY);
    expect(state?.goal.id).toBe('near');
  });

  it('tolerates a full ISO timestamp in targetDate', () => {
    const state = taperState([goal({ targetDate: `${daysAhead(3)}T00:00:00Z` })], TODAY);
    expect(state?.daysToRace).toBe(3);
  });

  it('gives each phase its own volume advice', () => {
    const advice = [21, 13, 3].map(
      (d) => taperState([goal({ targetDate: daysAhead(d) })], TODAY)?.volumeAdvice,
    );
    expect(new Set(advice).size).toBe(3);
    expect(advice[2]).toContain('Race week');
  });
});

describe('TAPER_CHECKLIST', () => {
  it('has the five canonical items', () => {
    expect(TAPER_CHECKLIST.map((i) => i.id)).toEqual(['kit', 'fuel', 'course', 'sleep', 'pace']);
  });
});
