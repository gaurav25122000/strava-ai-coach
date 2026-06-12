import { Goal } from '../store/useStore';
import { localDateStr } from '../utils/dates';

// Taper window logic for the countdown widget. Pure date maths so the
// 0/6/13/21-day edges are testable without mounting anything.

export type TaperPhase = 'race week' | 'taper' | 'pre-taper';

export interface TaperState {
  goal: Goal;
  /** Whole days until race day (0 = today). */
  daysToRace: number;
  weekPhase: TaperPhase;
  volumeAdvice: string;
}

/** Pre-race checklist items, keyed for taperChecks persistence. */
export const TAPER_CHECKLIST = [
  { id: 'kit', label: 'Race kit tested' },
  { id: 'fuel', label: 'Fueling plan set' },
  { id: 'course', label: 'Course reviewed' },
  { id: 'sleep', label: 'Sleep banked' },
  { id: 'pace', label: 'Race pace dialed' },
] as const;

/**
 * First Race goal whose targetDate is 0–21 days ahead of `today`, with the
 * taper phase and volume advice for that window. Null when no race is close
 * enough — the widget stays invisible outside its window.
 */
export function taperState(goals: Goal[], today: Date = new Date()): TaperState | null {
  // Compare local day keys (both parse as UTC midnight) so device timezone
  // can never shift the race a day.
  const todayMs = new Date(localDateStr(today)).getTime();

  for (const goal of goals) {
    if (goal.type !== 'Race' || !goal.targetDate) continue;
    const raceDay = goal.targetDate.split('T')[0];
    const raceMs = new Date(raceDay).getTime();
    if (!Number.isFinite(raceMs)) continue;
    const daysToRace = Math.round((raceMs - todayMs) / 86400000);
    if (daysToRace < 0 || daysToRace > 21) continue;

    let weekPhase: TaperPhase;
    let volumeAdvice: string;
    if (daysToRace <= 6) {
      weekPhase = 'race week';
      volumeAdvice = 'Race week: short, sharp, lots of rest.';
    } else if (daysToRace <= 13) {
      weekPhase = 'taper';
      volumeAdvice = 'Cut weekly volume ~40–50% — keep some intensity, just less of it.';
    } else {
      weekPhase = 'pre-taper';
      volumeAdvice = 'Cut weekly volume ~20–30% while keeping your normal routine.';
    }
    return { goal, daysToRace, weekPhase, volumeAdvice };
  }
  return null;
}
