import type { BestEffort } from '../store/useStore';
import { formatPace } from './dates';

// Race-time prediction from REAL best efforts. The old widget seeded Riegel
// with the fastest average pace of ANY run — a 400 m strider or GPS glitch
// poisoned every prediction — and showed invented "confidence" bars.

export interface RacePrediction {
  label: '5K' | '10K' | 'Half' | 'Marathon';
  distanceM: number;
  /** Predicted finish, seconds. */
  seconds: number;
  /** Predicted pace, "M:SS" /km. */
  pace: string;
  /** Extrapolation honesty: how far we're projecting from the basis. */
  confidence: 'high' | 'medium' | 'low';
}

export interface RacePredictorResult {
  predictions: RacePrediction[];
  /** What the model was seeded with — shown in the widget caption. */
  basis: { distanceM: number; seconds: number; label: string };
}

const TARGETS: Array<{ label: RacePrediction['label']; m: number }> = [
  { label: '5K', m: 5000 },
  { label: '10K', m: 10000 },
  { label: 'Half', m: 21097 },
  { label: 'Marathon', m: 42195 },
];

const RIEGEL_EXPONENT = 1.06;

/**
 * Riegel projection seeded from the longest reliable best effort (10K > 5K >
 * 1K). Returns null when no best efforts exist yet — the widget shows an
 * empty-state hint instead of fabricated numbers.
 */
export function predictRaceTimes(bestEfforts: Record<number, BestEffort>): RacePredictorResult | null {
  const basisEffort = bestEfforts[10000] ?? bestEfforts[5000] ?? bestEfforts[1000];
  if (!basisEffort || basisEffort.time <= 0) return null;

  const basisLabel = basisEffort.distance >= 10000 ? '10K' : basisEffort.distance >= 5000 ? '5K' : '1K';

  const predictions = TARGETS.map(({ label, m }) => {
    const ratio = m / basisEffort.distance;
    const seconds = Math.round(basisEffort.time * Math.pow(ratio, RIEGEL_EXPONENT));
    // Confidence honestly reflects extrapolation distance: projecting a 5K
    // to a marathon (ratio 8.4) is a guess; 5K→10K (ratio 2) is solid.
    const stretch = Math.max(ratio, 1 / ratio);
    const confidence: RacePrediction['confidence'] =
      stretch <= 2.5 ? 'high' : stretch <= 5 ? 'medium' : 'low';
    return {
      label,
      distanceM: m,
      seconds,
      pace: formatPace(seconds / 60 / (m / 1000)),
      confidence,
    };
  });

  return {
    predictions,
    basis: { distanceM: basisEffort.distance, seconds: basisEffort.time, label: basisLabel },
  };
}

/** Seconds → "H:MM:SS" / "MM:SS". */
export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
