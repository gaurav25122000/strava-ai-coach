import { Activity, DailyHealthEntry, SleepEntry } from '../store/useStore';
import { activityDayKey, localDateStr } from '../utils/dates';

// ── Readiness score ──────────────────────────────────────────────────────────
//
// One morning number (0–100) blending three signals:
//   sleep  45% — last night's hours vs an 8 h target, nudged by quality
//   load   35% — acute (7d) vs chronic (28d) daily-strain ratio
//   strain 20% — yesterday's strain vs the 28-day daily average
// When Watch recovery data is available (health source), a fourth signal
// joins and the weights shift to sleep 35 / load 30 / strain 15 / recovery 20:
//   recovery — resting HR and HRV vs their 28-day baselines
// Missing signals don't fake values — the score renormalises over the
// remaining parts and the part comes back null so the UI can say so.

const SLEEP_TARGET_HOURS = 8;
const QUALITY_MODIFIER = 10;
const WEIGHTS = { sleep: 45, load: 35, strain: 20 } as const;
const WEIGHTS_WITH_RECOVERY = { sleep: 35, load: 30, strain: 15, recovery: 20 } as const;
/** Minimum baseline days before RHR/HRV deviations are trusted. */
const RECOVERY_BASELINE_MIN_DAYS = 5;

export type ReadinessLabel = 'Primed' | 'Ready' | 'Steady' | 'Tired' | 'Run down';

export interface ReadinessInput {
  sleepLog: Record<string, SleepEntry>;
  activities: Activity[];
  /** Daily Watch rollups (health source) — enables the recovery part. */
  dailyHealth?: Record<string, DailyHealthEntry>;
  /** Defaults to now — injectable for tests. */
  today?: Date;
}

export interface ReadinessResult {
  /** 0–100, rounded. */
  score: number;
  /** Per-signal 0–100 sub-scores. sleep is null when nothing was logged
   *  today; recovery is null without recent RHR/HRV data. */
  parts: { sleep: number | null; load: number; strain: number; recovery: number | null };
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

/**
 * Resting HR + HRV vs their 28-day baselines → 0–100, or null without a
 * recent (≤2-day-old) reading on a trustworthy (≥5-day) baseline.
 * Elevated RHR costs 8 points per % above baseline; suppressed HRV costs
 * 2 points per % below — both classic overnight fatigue flags. At-or-better
 * than baseline scores 100.
 */
export function recoveryPart(
  dailyHealth: Record<string, DailyHealthEntry> | undefined,
  today: Date,
): number | null {
  if (!dailyHealth) return null;

  const score = (metric: 'restingHR' | 'hrv', costPerPct: number, higherIsWorse: boolean): number | null => {
    let latest: number | undefined;
    const baseline: number[] = [];
    for (let i = 0; i < 28; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const v = dailyHealth[localDateStr(d)]?.[metric];
      if (v === undefined) continue;
      if (latest === undefined && i <= 2) {
        latest = v;
      } else {
        baseline.push(v);
      }
    }
    if (latest === undefined || baseline.length < RECOVERY_BASELINE_MIN_DAYS) return null;
    const base = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    if (base <= 0) return null;
    const deltaPct = ((latest - base) / base) * 100;
    const badPct = higherIsWorse ? Math.max(0, deltaPct) : Math.max(0, -deltaPct);
    return Math.max(0, Math.min(100, 100 - badPct * costPerPct));
  };

  const rhr = score('restingHR', 8, true);
  const hrv = score('hrv', 2, false);
  if (rhr === null && hrv === null) return null;
  if (rhr === null) return Math.round(hrv!);
  if (hrv === null) return Math.round(rhr);
  return Math.round((rhr + hrv) / 2);
}

const ADVICE: Record<ReadinessLabel, (weak: string) => string> = {
  Primed: (weak) => `All systems green — even ${weak} held up. Go big today.`,
  Ready: (weak) => `Good to train hard — just keep an eye on ${weak}.`,
  Steady: (weak) => `A normal session is fine, but ${weak} says don't chase a breakthrough.`,
  Tired: (weak) => `Keep it easy today — ${weak} needs a lighter day.`,
  'Run down': (weak) => `Recovery day: ${weak} is in the red. Sleep, eat, walk.`,
};

/**
 * Compact recovery block for AI prompts (chat + plan generation). Empty
 * string when no daily health data exists — Strava-source prompts stay
 * byte-identical.
 */
export function recoveryContext(input: ReadinessInput): string {
  const dh = input.dailyHealth ?? {};
  if (!Object.keys(dh).length) return '';
  const today = input.today ?? new Date();

  const last7 = (pick: (e: DailyHealthEntry) => number | undefined): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const v = dh[localDateStr(d)] && pick(dh[localDateStr(d)]);
      if (v !== undefined) out.push(v);
    }
    return out;
  };
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined);

  const rhr = avg(last7((e) => e.restingHR));
  const hrv = avg(last7((e) => e.hrv));
  const sleep = avg(
    Object.entries(input.sleepLog)
      .filter(([day]) => {
        const diff = (today.getTime() - new Date(day).getTime()) / 86400000;
        return diff >= 0 && diff < 7;
      })
      .map(([, e]) => e.hours),
  );
  const vo2 = last7((e) => e.vo2max)[0];

  const r = readinessScore(input);
  const lines = [`Readiness today: ${r.score}/100 (${r.label})`];
  if (rhr !== undefined) lines.push(`7-day avg resting HR: ${rhr} bpm`);
  if (hrv !== undefined) lines.push(`7-day avg HRV: ${hrv} ms`);
  if (sleep !== undefined) lines.push(`7-day avg sleep: ${sleep} h/night`);
  if (vo2 !== undefined) lines.push(`Latest VO2max: ${vo2} ml/kg/min`);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = dh[localDateStr(yesterday)];
  if (y && (y.activeEnergy || y.exerciseMin || y.steps)) {
    const bits = [
      y.activeEnergy ? `${y.activeEnergy} kcal active` : null,
      y.exerciseMin ? `${y.exerciseMin} exercise min` : null,
      y.steps ? `${y.steps} steps` : null,
    ].filter(Boolean);
    lines.push(`Yesterday: ${bits.join(', ')}`);
  }
  return lines.join('\n');
}

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

  const recovery = recoveryPart(input.dailyHealth, today);

  // Without recovery data the weights are EXACTLY the original three-part
  // split, so Strava-source scores are unchanged.
  const W = recovery !== null ? WEIGHTS_WITH_RECOVERY : { ...WEIGHTS, recovery: 0 };
  let weighted = W.load * load + W.strain * strain;
  let totalWeight = W.load + W.strain;
  if (sleep !== null) {
    weighted += W.sleep * sleep;
    totalWeight += W.sleep;
  }
  if (recovery !== null) {
    weighted += W.recovery * recovery;
    totalWeight += W.recovery;
  }
  const score = Math.round(weighted / totalWeight);

  const label: ReadinessLabel =
    score >= 85 ? 'Primed' : score >= 70 ? 'Ready' : score >= 55 ? 'Steady' : score >= 40 ? 'Tired' : 'Run down';

  const candidates: Array<[string, number]> = [
    ['training load', load],
    ["yesterday's effort", strain],
  ];
  if (sleep !== null) candidates.push(['sleep', sleep]);
  if (recovery !== null) candidates.push(['recovery', recovery]);
  candidates.sort((a, b) => a[1] - b[1]);
  const advice = ADVICE[label](candidates[0][0]);

  return {
    score,
    parts: { sleep, load, strain, recovery },
    loadRatio: Math.round(ratio * 100) / 100,
    label,
    advice,
  };
}
