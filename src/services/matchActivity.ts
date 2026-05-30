import type { Activity, DailyPrescription, WorkoutKind } from '../store/useStore';

// Type-only imports above are erased at runtime, so this module has NO runtime
// dependencies — it stays a pure, unit-testable function.

export type MatchVerdict = 'matched' | 'partial' | 'mismatch';

export interface PrescriptionMatch {
  verdict: MatchVerdict;
  completed: boolean; // matched → true; partial/mismatch → false
  reason: string;     // short, human-readable
}

export const VERDICT_RANK: Record<MatchVerdict, number> = { matched: 2, partial: 1, mismatch: 0 };

// Readable kind labels for the match reason strings (kept local so this module
// has no dependency on the JSX-carrying workoutKinds helper).
const KIND_LABEL: Record<WorkoutKind, string> = {
  EASY: 'easy run',
  TEMPO: 'tempo',
  INTERVALS: 'intervals',
  LONG: 'long run',
  RECOVERY: 'recovery',
  CROSS: 'cross-training',
  STRENGTH: 'strength',
  REST: 'rest',
};

// Which Strava activity types can satisfy a given prescribed workout kind. A
// prescribed run is NOT satisfied by a ride; cross-training is the inverse.
export function disciplineMatches(kind: WorkoutKind, type: Activity['type']): boolean {
  switch (kind) {
    case 'EASY':
    case 'TEMPO':
    case 'INTERVALS':
    case 'LONG':
      return type === 'Run';
    case 'RECOVERY':
      return type === 'Run' || type === 'Walk';
    case 'CROSS':
      return type === 'Ride' || type === 'Workout' || type === 'Walk';
    case 'STRENGTH':
      return type === 'Workout';
    case 'REST':
      return false; // nothing "completes" a rest day — extra movement is a bonus
    default:
      return true;
  }
}

// Coarse effort band a prescribed zone implies.
function bandForZone(z?: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5'): 'easy' | 'moderate' | 'hard' | null {
  if (!z) return null;
  if (z === 'Z1' || z === 'Z2') return 'easy';
  if (z === 'Z3') return 'moderate';
  return 'hard';
}

// Dominant HR zone (1..5) from Strava's own per-activity time-in-zone buckets,
// if we have them cached. Null when there's no HR/zone data to judge intensity.
export function dominantHrZone(activity: Activity): number | null {
  const hr = activity.zones?.find(z => z.type === 'heartrate');
  if (!hr?.buckets?.length) return null;
  let bestIdx = -1;
  let bestTime = -1;
  hr.buckets.forEach((b: any, i: number) => {
    const t = typeof b?.time === 'number' ? b.time : 0;
    if (t > bestTime) {
      bestTime = t;
      bestIdx = i;
    }
  });
  return bestIdx >= 0 ? bestIdx + 1 : null;
}

/**
 * Decide whether a Strava activity actually satisfies a day's prescription —
 * by discipline (run vs ride vs strength), volume (distance or duration, ≥70%
 * of the target), and intensity zone (when HR-zone data is available). Only a
 * clean match auto-marks the day done; a short or wrong-intensity session is
 * 'partial' (logged, not done) and the wrong discipline is 'mismatch', both of
 * which the athlete can still override manually.
 */
export function matchActivityToPrescription(activity: Activity, presc: DailyPrescription): PrescriptionMatch {
  // Movement on a rest day is bonus credit, not a failed match.
  if (presc.kind === 'REST') {
    return { verdict: 'matched', completed: true, reason: 'Bonus session on a rest day' };
  }

  const km = activity.distance / 1000;
  const min = activity.movingTime / 60;

  // 1. Discipline must line up.
  if (!disciplineMatches(presc.kind, activity.type)) {
    return {
      verdict: 'mismatch',
      completed: false,
      reason: `${activity.type} logged, but a ${KIND_LABEL[presc.kind]} session was prescribed`,
    };
  }

  // 2. Volume — distance preferred, else duration, else a non-trivial floor.
  if (presc.distanceKm && presc.distanceKm > 0) {
    if (km < presc.distanceKm * 0.7) {
      return {
        verdict: 'partial',
        completed: false,
        reason: `Logged ${km.toFixed(1)} km of the ${presc.distanceKm} km prescribed`,
      };
    }
  } else if (presc.durationMin && presc.durationMin > 0) {
    if (min < presc.durationMin * 0.7) {
      return {
        verdict: 'partial',
        completed: false,
        reason: `Logged ${Math.round(min)} min of the ${presc.durationMin} min prescribed`,
      };
    }
  } else if (km < 1 && min < 10) {
    return { verdict: 'partial', completed: false, reason: `Only ${km.toFixed(1)} km logged` };
  }

  // 3. Intensity — soft check, only when HR-zone data lets us judge it.
  const band = bandForZone(presc.intensity);
  const zone = dominantHrZone(activity);
  if (band && zone != null) {
    const actBand = zone <= 2 ? 'easy' : zone === 3 ? 'moderate' : 'hard';
    if (band === 'easy' && actBand === 'hard') {
      return { verdict: 'partial', completed: false, reason: `Ran hard (Z${zone}) on an easy ${presc.intensity} day` };
    }
    if (band === 'hard' && actBand === 'easy') {
      return { verdict: 'partial', completed: false, reason: `Stayed easy (Z${zone}) on a ${presc.intensity} session` };
    }
  }

  return { verdict: 'matched', completed: true, reason: 'Matched the prescription' };
}
