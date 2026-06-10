import { DailyPrescription, Goal, Phase } from '../store/useStore';
import { localDateStr, mondayIndex, mondayOf } from '../utils/dates';

// Canonical plan-calendar resolution. Previously four files re-implemented
// "which phase is active / what's prescribed today" with drifting rules
// (TodayHero, WeekStrip, notifications, goalProgress) — they should all
// resolve through here.

/** The phase whose [weekStart, weekEnd] window contains `date`, else null. */
export function phaseForDate(phases: Phase[] | undefined, date: Date): Phase | null {
  if (!phases?.length) return null;
  const key = localDateStr(date);
  for (const p of phases) {
    if (p.weekStart && p.weekEnd && key >= p.weekStart && key <= p.weekEnd) return p;
  }
  return null;
}

/**
 * The 7-day schedule in force for the week containing `date`.
 * weeks[] (per-week progression) wins; the legacy single template is the
 * fallback. Null when the date is outside the plan — callers must NOT
 * default to phase one (that bug matched months-old activities to week 1).
 */
export function scheduleForDate(phases: Phase[] | undefined, date: Date): DailyPrescription[] | null {
  const phase = phaseForDate(phases, date);
  if (!phase) return null;
  const monday = localDateStr(mondayOf(date));
  const week = phase.weeks?.find((w) => w.weekStart === monday);
  if (week?.schedule?.length) return week.schedule;
  return phase.schedule?.length ? phase.schedule : null;
}

/** Today's prescription for a goal, or null when nothing is scheduled. */
export function prescriptionForDate(goal: Goal, date: Date): DailyPrescription | null {
  const schedule = scheduleForDate(goal.phases, date);
  if (!schedule) return null;
  const idx = mondayIndex(date);
  return schedule.find((d) => d.dayOfWeek === idx) ?? null;
}

/** Compact one-line summary of a prescription for prompts/notifications. */
export function prescriptionSummary(p: DailyPrescription): string {
  const bits = [p.kind, p.title];
  if (p.distanceKm) bits.push(`${p.distanceKm} km`);
  if (p.durationMin) bits.push(`${p.durationMin} min`);
  if (p.intensity) bits.push(p.intensity);
  return bits.join(' · ');
}
