import { lttb, niceCeil, niceFloor } from '../downsample';

describe('lttb', () => {
  const series = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 100 }));

  it('caps long series at the threshold', () => {
    expect(lttb(series, 80)).toHaveLength(80);
  });

  it('keeps first and last points', () => {
    const out = lttb(series, 80);
    expect(out[0]).toEqual(series[0]);
    expect(out[out.length - 1]).toEqual(series[series.length - 1]);
  });

  it('returns short series untouched', () => {
    const short = series.slice(0, 50);
    expect(lttb(short, 80)).toBe(short);
  });

  it('preserves extremes (peak survives downsampling)', () => {
    const spiky = Array.from({ length: 300 }, (_, i) => ({ x: i, y: i === 150 ? 999 : 1 }));
    const out = lttb(spiky, 30);
    expect(out.some((p) => p.y === 999)).toBe(true);
  });
});

describe('niceCeil / niceFloor', () => {
  it('rounds up to friendly axis values', () => {
    expect(niceCeil(87)).toBe(100);
    expect(niceCeil(34)).toBe(40);
    expect(niceCeil(7.3)).toBe(8);
    expect(niceCeil(2.1)).toBe(2.5);
    expect(niceCeil(100)).toBe(100);
  });

  it('handles degenerate input', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(NaN)).toBe(1);
  });

  it('niceFloor mirrors for negatives, clamps positives to 0', () => {
    expect(niceFloor(-34)).toBe(-40);
    expect(niceFloor(12)).toBe(0);
  });
});
