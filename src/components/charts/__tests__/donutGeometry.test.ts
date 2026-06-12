import { donutArcGeometry } from '../ChartDonut';

// Default ChartDonut proportions: size 150, innerRadius 0.66.
const STROKE = 25.5;
const RADIUS = 60.25;
const CAP_DEG = (STROKE / 2 / RADIUS) * (180 / Math.PI);

/** Painted angular extent including round-cap overhang. */
function paintedSpan(spec: { startDeg: number; sweepDeg: number }) {
  const geo = donutArcGeometry(spec, STROKE, RADIUS);
  const cap = geo.rounded ? CAP_DEG : 0;
  return { from: geo.startDeg - cap, to: geo.startDeg + geo.sweepDeg + cap };
}

describe('donutArcGeometry', () => {
  it('insets large slices by the cap angle on both ends and keeps round caps', () => {
    const geo = donutArcGeometry({ startDeg: 0, sweepDeg: 120 }, STROKE, RADIUS);
    expect(geo.rounded).toBe(true);
    expect(geo.startDeg).toBeCloseTo(CAP_DEG, 3);
    expect(geo.sweepDeg).toBeCloseTo(120 - CAP_DEG * 2, 3);
  });

  it('keeps the painted stroke (caps included) inside the allotted span', () => {
    const spec = { startDeg: -90, sweepDeg: 200 };
    const { from, to } = paintedSpan(spec);
    expect(from).toBeGreaterThanOrEqual(spec.startDeg - 1e-6);
    expect(to).toBeLessThanOrEqual(spec.startDeg + spec.sweepDeg + 1e-6);
  });

  it('falls back to butt caps without inset for slices too thin to absorb it', () => {
    const sliver = { startDeg: 10, sweepDeg: 6 };
    const geo = donutArcGeometry(sliver, STROKE, RADIUS);
    expect(geo.rounded).toBe(false);
    expect(geo.startDeg).toBe(10);
    expect(geo.sweepDeg).toBe(6);
  });

  it('adjacent gapped segments no longer overlap', () => {
    // Two segments separated by ChartDonut's 3.5° gap.
    const a = { startDeg: 0, sweepDeg: 150 };
    const b = { startDeg: 153.5, sweepDeg: 150 };
    expect(paintedSpan(a).to).toBeLessThan(paintedSpan(b).from);
  });

  it('never produces a negative or zero sweep at the rounding threshold', () => {
    const justOver = { startDeg: 0, sweepDeg: CAP_DEG * 2 + 2.01 };
    const geo = donutArcGeometry(justOver, STROKE, RADIUS);
    expect(geo.sweepDeg).toBeGreaterThanOrEqual(0.5);
  });
});
