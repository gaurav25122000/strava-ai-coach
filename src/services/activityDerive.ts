// Source-agnostic derivations shared by the Strava and Health mappers, so an
// activity gets identical steps/calorie estimates no matter where it came from.

export const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
export const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide']);

/**
 * Steps from cadence when available (runs count both feet), else a stride
 * estimate for foot-travel types. Undefined for everything else.
 */
export function deriveSteps(opts: {
  type: string;
  movingTime: number; // seconds
  distance: number; // meters
  averageCadence?: number;
}): number | undefined {
  const { type, movingTime, distance, averageCadence } = opts;
  const durationMins = movingTime / 60;
  const isRun = RUN_TYPES.has(type);
  if (averageCadence && movingTime) {
    return Math.round(isRun ? averageCadence * 2 * durationMins : averageCadence * durationMins);
  }
  if (distance && movingTime && (isRun || type === 'Walk' || type === 'Hike')) {
    const strideM = isRun ? 1.4 : 0.75;
    return Math.round(distance / strideM);
  }
  return undefined;
}

/**
 * MET-based calorie estimate from real body weight — the fallback when the
 * source doesn't report energy. Returns undefined for zero-duration entries.
 */
export function estimateCalories(opts: {
  type: string;
  movingTime: number; // seconds
  averageSpeed: number; // m/s
  weightKg: number;
}): number | undefined {
  const { type, movingTime, averageSpeed, weightKg } = opts;
  const hours = (movingTime || 0) / 3600;
  if (hours <= 0) return undefined;
  const met = RUN_TYPES.has(type)
    ? (averageSpeed > 3.5 ? 11.0 : averageSpeed > 2.7 ? 9.8 : 8.0)
    : RIDE_TYPES.has(type)
      ? (averageSpeed > 8.3 ? 10.0 : averageSpeed > 5.5 ? 8.0 : 6.0)
      : type === 'Walk' || type === 'Hike'
        ? 3.8
        : 5.0;
  return Math.round(met * weightKg * hours);
}
