// Tiny shared formatting helpers for dashboard widgets.

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
