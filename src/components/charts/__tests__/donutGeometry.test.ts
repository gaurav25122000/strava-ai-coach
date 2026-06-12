import { donutArcLayout } from '../ChartDonut';

const GAP = 2; // ChartDonut default

describe('donutArcLayout', () => {
  it('lays out flat segments separated by exactly the gap', () => {
    const [a, b, c] = donutArcLayout([1, 1, 2]);
    expect(b.startDeg).toBeCloseTo(a.startDeg + a.sweepDeg + GAP, 6);
    expect(c.startDeg).toBeCloseTo(b.startDeg + b.sweepDeg + GAP, 6);
    // No overlap anywhere: every segment ends before the next begins.
    expect(a.startDeg + a.sweepDeg).toBeLessThan(b.startDeg);
    expect(b.startDeg + b.sweepDeg).toBeLessThan(c.startDeg);
  });

  it('segments plus gaps cover the full circle', () => {
    const specs = donutArcLayout([3, 1, 4, 1, 5]);
    const swept = specs.reduce((s, x) => s + x.sweepDeg, 0);
    expect(swept + GAP * specs.length).toBeCloseTo(360, 6);
  });

  it('keeps sweeps proportional to values', () => {
    const [a, , c] = donutArcLayout([1, 1, 2]);
    expect(c.sweepDeg).toBeCloseTo(a.sweepDeg * 2, 6);
  });

  it('renders a single slice as one uninterrupted 360° ring', () => {
    const [only] = donutArcLayout([42]);
    expect(only.sweepDeg).toBeCloseTo(360, 6);
  });

  it('returns nothing for empty or zero-total input', () => {
    expect(donutArcLayout([])).toEqual([]);
    expect(donutArcLayout([0, 0])).toEqual([]);
  });
});
