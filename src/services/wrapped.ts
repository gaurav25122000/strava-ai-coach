// Pure stats behind the Monthly Wrapped story cards. Everything is keyed by
// athlete-local months ('YYYY-MM' from activityDayKey) so a late-night session
// lands in the month the athlete experienced, not the UTC one.

import { Activity, Milestone } from '../store/useStore';
import { activityDayKey, weekKey } from '../utils/dates';

export interface MonthStats {
  km: number;
  hours: number;
  elevation: number;
  count: number;
  activeDays: number;
  topSport: { type: string; count: number } | null;
  longest: { name: string; km: number; dayKey: string } | null;
  /** Badges whose earnedAt falls inside the month. */
  badges: Milestone[];
  /** Biggest single-week (Mon-Sun) distance inside the month. */
  bestWeekKm: number;
  prevMonthKm: number;
  /** % change vs the previous month, null when there is no previous data. */
  deltaPct: number | null;
  totalKudos: number;
  calories: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' → 'June 2026' (or 'Jun 2026' when short). */
export function monthTitle(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[m - 1] ?? '';
  return `${short ? name.slice(0, 3) : name} ${y}`;
}

/** Months that have at least one activity, 'YYYY-MM' newest first. */
export function monthsWithData(activities: Activity[]): string[] {
  const months = new Set(activities.map((a) => activityDayKey(a).slice(0, 7)));
  return Array.from(months).sort().reverse();
}

function prevMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m - 1 is this month's index; one more back
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthStats(
  activities: Activity[],
  milestones: Milestone[],
  month: string,
): MonthStats {
  let meters = 0;
  let seconds = 0;
  let elevation = 0;
  let totalKudos = 0;
  let calories = 0;
  let prevMeters = 0;
  const prevMonth = prevMonthKey(month);
  const days = new Set<string>();
  const sportCount = new Map<string, number>();
  const sportMeters = new Map<string, number>();
  const weekMeters = new Map<string, number>();
  let count = 0;
  let longestAct: Activity | null = null;

  for (const a of activities) {
    const dayKey = activityDayKey(a);
    if (dayKey.startsWith(prevMonth)) prevMeters += a.distance;
    if (!dayKey.startsWith(month)) continue;
    count++;
    meters += a.distance;
    seconds += a.movingTime;
    elevation += a.totalElevationGain;
    totalKudos += a.kudosCount ?? 0;
    calories += a.calories ?? 0;
    days.add(dayKey);
    sportCount.set(a.type, (sportCount.get(a.type) ?? 0) + 1);
    sportMeters.set(a.type, (sportMeters.get(a.type) ?? 0) + a.distance);
    // Local midnight (not bare 'YYYY-MM-DD', which Date parses as UTC) so
    // weekKey buckets the same way everywhere.
    const wk = weekKey(new Date(`${dayKey}T00:00:00`));
    weekMeters.set(wk, (weekMeters.get(wk) ?? 0) + a.distance);
    if (!longestAct || a.distance > longestAct.distance) longestAct = a;
  }

  let topSport: { type: string; count: number } | null = null;
  for (const [type, c] of sportCount) {
    if (
      !topSport ||
      c > topSport.count ||
      (c === topSport.count && (sportMeters.get(type) ?? 0) > (sportMeters.get(topSport.type) ?? 0))
    ) {
      topSport = { type, count: c };
    }
  }

  const km = meters / 1000;
  const prevMonthKm = prevMeters / 1000;

  return {
    km,
    hours: seconds / 3600,
    elevation,
    count,
    activeDays: days.size,
    topSport,
    longest: longestAct
      ? {
          name: longestAct.name ?? longestAct.type,
          km: longestAct.distance / 1000,
          dayKey: activityDayKey(longestAct),
        }
      : null,
    badges: milestones.filter((m) => m.earnedAt.slice(0, 7) === month),
    bestWeekKm: weekMeters.size ? Math.max(...Array.from(weekMeters.values())) / 1000 : 0,
    prevMonthKm,
    deltaPct: prevMonthKm > 0 ? ((km - prevMonthKm) / prevMonthKm) * 100 : null,
    totalKudos,
    calories,
  };
}
