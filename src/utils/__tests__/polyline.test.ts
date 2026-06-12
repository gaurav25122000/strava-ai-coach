import { decodePolyline, encodePolyline } from '../polyline';

describe('polyline encode/decode', () => {
  it('round-trips coordinates at 1e-5 precision', () => {
    const points = [
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('matches the canonical Google example encoding', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points = [
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('handles empty input', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
  });

  it('round-trips a dense GPS-like track', () => {
    const points = Array.from({ length: 200 }, (_, i) => ({
      latitude: Math.round((12.9716 + i * 0.0001) * 1e5) / 1e5,
      longitude: Math.round((77.5946 + i * 0.00007) * 1e5) / 1e5,
    }));
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });
});
