import { Activity, SleepEntry } from '../store/useStore';
import { activityDayKey, localDateStr } from '../utils/dates';

// ── Readiness score ──────────────────────────────────────────────────────────
//
// One morning number (0–100) blending three signals:
//   sleep  45% — last night's hours vs an 8 h target, nudged by quality
//   load   35% — acute (7d) vs chronic (28d) daily-strain ratio
//   strain 20% — yesterday's strain vs the 28-day daily average
// Missing sleep doesn't fake a value — the score renormalises over the
// remaining parts and parts.sleep comes back null so the UI can say so.

const SLEEP_TARGET_HOURS = 8;
const QUALITY_MODIFIER = 10;
const WEIGHTS = { sleep: 45, load: 35, strain: 20 } as const;

export type ReadinessLabel = 'Primed' | 'Ready' | 'Steady' | 'Tired' | 'Run down';

export interface ReadinessInput {
  sleepLog: Record<string, SleepEntry>;
  activities: Activity[];
  /** Defaults to now — injectable for tests. */
  today?: Date;
}

export interface ReadinessResult {
  /** 0–100, rounded. */
  score: number;
  /** Per-signal 0–100 sub-scores. sleep is null when nothing was logged today. */
  parts: { sleep: number | null; load: number; strain: number };
  /** Acute(7d) : chronic(28d) daily-strain ratio behind parts.load. */
  loadRatio: number;
  label: ReadinessLabel;
  advice: string;
}

/**
 * Training strain of a single activity. Uses Strava's Relative Effort
 * (sufferScore) when present. Otherwise a heuristic stand-in: minutes of work
 * scaled by how hard the heart worked — avg HR relative to ~130 bpm (a typical
 * aerobic effort), so an easy hour ≈ 60 and a hard hour climbs toward 90. The
 * multiplier is clamped to 0.5–1.5 so bad HR readings can't explode the
 * number; with no HR at all, plain minutes stand in.
 */
export function dailyStrain(a: Activity): number {
  if (a.sufferScore && a.sufferScore > 0) return a.sufferScore;
  const minutes = a.movingTime / 60;
  if (!a.averageHeartRate) return minutes;
  const multiplier = Math.min(1.5, Math.max(0.5, a.averageHeartRate / 130));
  return minutes * multiplier;
}

// Acute:chronic ratio → 0–100. The 0.8–1.3 band is the healthy build zone;
// under 0.8 is taper-fresh (slight reward); past 1.5 the ramp is the classic
// injury red flag, so it falls off hard (hits 0 around 2.2).
function loadPart(ratio: number): number {
  if (ratio < 0.8) return 100; // fresh — light week, fully recovered
  if (ratio <= 1.3) return 95; // healthy build band
  if (ratio <= 1.5) return 95 - (ratio - 1.3) * 200; // ramping fast: 95 → 55
  return Math.max(0, 55 - (ratio - 1.5) * 80); // overreaching
}

// Yesterday vs the 28-day daily average: at or under the norm is fully
// recovered; each multiple above it costs 40 points (2× the norm → 60).
function strainPart(yesterday: number, dailyAvg: number): number {
  if (dailyAvg <= 0 || yesterday <= dailyAvg) return 100;
  return Math.max(0, 100 - (yesterday / dailyAvg - 1) * 40);
}

const ADVICE: Record<ReadinessLabel, (weak: string) => string> = {
  Primed: (weak) => `All systems green — even ${weak} held up. Go big today.`,
  Ready: (weak) => `Good to train hard — just keep an eye on ${weak}.`,
  Steady: (weak) => `A normal session is fine, but ${weak} says don't chase a breakthrough.`,
  Tired: (weak) => `Keep it easy today — ${weak} needs a lighter day.`,
  'Run down': (weak) => `Recovery day: ${weak} is in the red. Sleep, eat, walk.`,
};

export function readinessScore(input: ReadinessInput): ReadinessResult {
  const today = input.today ?? new Date();

  // Strain per local day, then the 7/28-day windows ending today.
  const strainByDay = new Map<string, number>();
  for (const a of input.activities) {
    const k = activityDayKey(a);
    strainByDay.set(k, (strainByDay.get(k) ?? 0) + dailyStrain(a));
  }
  let sum7 = 0;
  let sum28 = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const s = strainByDay.get(localDateStr(d)) ?? 0;
    sum28 += s;
    if (i < 7) sum7 += s;
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStrain = strainByDay.get(localDateStr(yesterday)) ?? 0;

  const chronic = sum28 / 28;
  const acute = sum7 / 7;
  // The 7-day window sits inside the 28-day one, so chronic can only be 0
  // when acute is too — treat the no-history case as a neutral ratio.
  const ratio = chronic > 0 ? acute / chronic : 1;

  const load = loadPart(ratio);
  const strain = strainPart(yesterdayStrain, chronic);

  const entry = input.sleepLog[localDateStr(today)];
  let sleep: number | null = null;
  if (entry) {
    let s = Math.min(1, entry.hours / SLEEP_TARGET_HOURS) * 100;
    if (entry.quality === 3) s += QUALITY_MODIFIER;
    else if (entry.quality === 1) s -= QUALITY_MODIFIER;
    sleep = Math.max(0, Math.min(100, s));
  }

  let weighted = WEIGHTS.load * load + WEIGHTS.strain * strain;
  let totalWeight = WEIGHTS.load + WEIGHTS.strain;
  if (sleep !== null) {
    weighted += WEIGHTS.sleep * sleep;
    totalWeight += WEIGHTS.sleep;
  }
  const score = Math.round(weighted / totalWeight);

  const label: ReadinessLabel =
    score >= 85 ? 'Primed' : score >= 70 ? 'Ready' : score >= 55 ? 'Steady' : score >= 40 ? 'Tired' : 'Run down';

  const candidates: Array<[string, number]> = [
    ['training load', load],
    ["yesterday's effort", strain],
  ];
  if (sleep !== null) candidates.push(['sleep', sleep]);
  candidates.sort((a, b) => a[1] - b[1]);
  const advice = ADVICE[label](candidates[0][0]);

  return {
    score,
    parts: { sleep, load, strain },
    loadRatio: Math.round(ratio * 100) / 100,
    label,
    advice,
  };
}
