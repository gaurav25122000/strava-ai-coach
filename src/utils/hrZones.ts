import type { HRZone, UserProfile } from '../store/useStore';

// The ONE place heart-rate zones are resolved. Previously four drifted
// fallback tables lived in Overview/Insights/ActivityDetail — they disagreed
// with each other and ignored the athlete's real Strava zones half the time.

export interface ResolvedZones {
  /** Where the bounds came from — surfaces in info sheets for honesty. */
  source: 'strava' | 'profile' | 'estimated';
  /** Lower bound of Z1..Z5 (bpm). Z5 upper bound is open. */
  bounds: [number, number, number, number, number];
  maxHR: number;
}

const AGE_FALLBACK_MAX_HR = 190;

export function resolveHrZones(
  stravaZones: HRZone[] | undefined,
  profile: Pick<UserProfile, 'maxHR' | 'dob'>,
): ResolvedZones {
  // 1. Athlete's actual Strava zone settings.
  if (stravaZones && stravaZones.length >= 5) {
    const bounds = stravaZones.slice(0, 5).map((z) => z.min) as ResolvedZones['bounds'];
    const top = stravaZones[4];
    const maxHR = top.max > 0 ? top.max : Math.round(bounds[4] * 1.08);
    return { source: 'strava', bounds, maxHR };
  }

  // 2. Profile maxHR, or 3. age formula, then %-of-max bands (50/60/70/80/90).
  let maxHR = profile.maxHR || 0;
  let source: ResolvedZones['source'] = 'profile';
  if (!maxHR) {
    source = 'estimated';
    const age = profile.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / 31557600000) : 0;
    maxHR = age > 0 && age < 110 ? 220 - age : AGE_FALLBACK_MAX_HR;
  }
  const pct = (p: number) => Math.round(maxHR * p);
  return { source, bounds: [pct(0.5), pct(0.6), pct(0.7), pct(0.8), pct(0.9)], maxHR };
}

/** 1-indexed zone for a bpm reading. */
export function zoneOf(bpm: number, zones: ResolvedZones): 1 | 2 | 3 | 4 | 5 {
  const b = zones.bounds;
  if (bpm >= b[4]) return 5;
  if (bpm >= b[3]) return 4;
  if (bpm >= b[2]) return 3;
  if (bpm >= b[1]) return 2;
  return 1;
}

/** 80/20 polarisation bucket for a zone. */
export function intensityBucket(zone: number): 'easy' | 'moderate' | 'hard' {
  if (zone <= 2) return 'easy';
  if (zone === 3) return 'moderate';
  return 'hard';
}

export const ZONE_LABELS = ['Z1 Recovery', 'Z2 Aerobic', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max'] as const;
