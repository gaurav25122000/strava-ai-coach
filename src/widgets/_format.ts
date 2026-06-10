// Tiny shared formatting + bucketing helpers for dashboard widgets.

import type { Activity } from '../store/useStore';
import { activityDayKey, weekKey } from '../utils/dates';

/** Seconds → "3h 24m" / "45m". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Strava speed (m/s) → pace in min/km. Returns 0 for non-positive speeds. */
export function paceMinPerKm(metersPerSecond: number): number {
  if (!metersPerSecond || metersPerSecond <= 0) return 0;
  return 1000 / metersPerSecond / 60;
}

/** Day key (YYYY-MM-DD) → Date at local midnight (never UTC-shifted). */
export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/**
 * Canonical Monday week-bucket key for an activity, derived from the
 * athlete's local day via activityDayKey → weekKey.
 */
export function activityWeekKey(a: Pick<Activity, 'startDate'> & { startDateLocal?: string }): string {
  return weekKey(dayKeyToDate(activityDayKey(a)));
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthBucket {
  /** YYYY-MM */
  key: string;
  /** Short month name ("Jun"). */
  label: string;
  km: number;
}

/**
 * Rolling calendar-month km buckets ending in the current month. Activities
 * bucket by their local day (activityDayKey), km rounded per bucket.
 */
export function monthlyKmBuckets(
  activities: Array<Pick<Activity, 'startDate' | 'distance'> & { startDateLocal?: string }>,
  months: number,
): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    index.set(key, buckets.length);
    buckets.push({ key, label: MONTH_LABELS[d.getMonth()], km: 0 });
  }
  for (const a of activities) {
    const idx = index.get(activityDayKey(a).slice(0, 7));
    if (idx !== undefined) buckets[idx].km += a.distance / 1000;
  }
  return buckets.map((b) => ({ ...b, km: Math.round(b.km) }));
}
