// Chart data helpers: point-count reduction and axis rounding. Every chart in
// the app caps its series with `lttb` so Skia never draws thousands of
// segments, and rounds its y-domain with `niceCeil` so ticks land on
// human-friendly values.

export interface XYPoint {
  x: number;
  y: number;
}

/**
 * Largest-Triangle-Three-Buckets downsampling. Keeps the visual shape of a
 * series (peaks/valleys survive) while reducing to `threshold` points.
 * Returns the input untouched when it is already small enough.
 */
export function lttb<T extends XYPoint>(data: T[], threshold: number): T[] {
  if (threshold >= data.length || threshold < 3) return data;

  const sampled: T[] = [data[0]];
  const bucketSize = (data.length - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);

    // Average of the next bucket — the third triangle vertex.
    let avgX = 0;
    let avgY = 0;
    for (let j = rangeStart; j < rangeEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    const count = rangeEnd - rangeStart || 1;
    avgX /= count;
    avgY /= count;

    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);

    let maxArea = -1;
    let chosen = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (data[a].x - avgX) * (data[j].y - data[a].y) -
        (data[a].x - data[j].x) * (avgY - data[a].y),
      );
      if (area > maxArea) {
        maxArea = area;
        chosen = j;
      }
    }
    sampled.push(data[chosen]);
    a = chosen;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/** Default point budget for full-width charts. */
export const MAX_CHART_POINTS = 80;

/**
 * Round up to a "nice" axis ceiling: 1/2/2.5/5 × 10^k just above `value`.
 * niceCeil(87) → 100, niceCeil(34) → 40, niceCeil(7.3) → 8.
 */
export function niceCeil(value: number): number {
  if (!isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const frac = value / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 4 ? 4 : frac <= 5 ? 5 : frac <= 8 ? 8 : 10;
  return nice * base;
}

/** Mirror of niceCeil for negative-capable domains (TSB etc). */
export function niceFloor(value: number): number {
  if (value >= 0) return 0;
  return -niceCeil(-value);
}
