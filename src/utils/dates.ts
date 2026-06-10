// Canonical date helpers. Every day-keyed feature (streaks, heatmap, weekly
// buckets, check-ins, notifications) must go through these so "which day did
// this activity happen" has exactly one answer app-wide.

import type { Activity } from '../store/useStore';

/** Local-timezone YYYY-MM-DD for a Date — never via toISOString (UTC shift). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The day an activity belongs to, as YYYY-MM-DD. Prefers Strava's
 * start_date_local (the athlete's wall clock at the recording site); falls
 * back to the UTC instant for legacy rows synced before startDateLocal existed.
 */
export function activityDayKey(a: Pick<Activity, 'startDate'> & { startDateLocal?: string }): string {
  return (a.startDateLocal ?? a.startDate).split('T')[0];
}

/** Monday 00:00 (local) of the week containing `d`. Handles Sunday correctly. */
export function mondayOf(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Monday-of-week as YYYY-MM-DD — the canonical week bucket key. */
export function weekKey(d: Date): string {
  return localDateStr(mondayOf(d));
}

/** 0 = Monday … 6 = Sunday, matching DailyPrescription.dayOfWeek. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** min/km float → "M:SS" (5.5 → "5:30"). */
export function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '0:00';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  if (secs === 60) return `${mins + 1}:00`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
