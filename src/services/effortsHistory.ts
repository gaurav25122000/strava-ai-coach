import { Activity } from '../store/useStore';
import { activityDayKey } from '../utils/dates';

// Monthly best-effort progression. Mirrors computeBestEfforts in
// milestones.ts: without raw GPS splits we estimate the time to cover the
// target distance from each qualifying run's average pace, so the two
// surfaces (PB tiles, PB progression chart) always agree on methodology.

export interface MonthlyBest {
  /** Local calendar month, 'YYYY-MM'. */
  month: string;
  /** Estimated fastest time over the target distance that month. */
  seconds: number;
}

/**
 * Fastest estimated time over `distanceMeters` per calendar month, among
 * Run activities long enough to plausibly cover it. Months with no
 * qualifying run are skipped (honest gaps, no fabricated points).
 * Returned sorted by month ascending.
 */
export function monthlyBestSeries(activities: Activity[], distanceMeters: number): MonthlyBest[] {
  // Same qualification rule as computeBestEfforts: 1 km accepts any run that
  // covers it; longer targets accept runs within ~15% short of the distance.
  const minDist = distanceMeters === 1000 ? 1000 : distanceMeters * 0.85;

  const bestByMonth = new Map<string, number>();
  for (const act of activities) {
    if (act.type !== 'Run' || act.averageSpeed <= 0) continue;
    if (act.distance < minDist) continue;

    const paceMinPerKm = 1000 / act.averageSpeed / 60;
    const estSecs = Math.round((distanceMeters / 1000) * paceMinPerKm * 60);
    const month = activityDayKey(act).slice(0, 7);
    const prev = bestByMonth.get(month);
    if (prev === undefined || estSecs < prev) bestByMonth.set(month, estSecs);
  }

  return Array.from(bestByMonth.entries())
    .map(([month, seconds]) => ({ month, seconds }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}
