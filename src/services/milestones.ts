import { Activity, Milestone, BestEffort } from '../store/useStore';
import { activityDayKey } from '../utils/dates';

// ── Milestone definitions ─────────────────────────────────────────────────────
//
// Each definition returns the ISO date the criterion was first met (or null).
// `computeMilestones` stamps `earnedAt` from that date, so a badge unlocked
// from a Strava back-sync gets the historical date, not "today".

export type MilestoneCategory = Milestone['category'];

export interface MilestoneStats {
  totalKm: number;
  currentStreak: number;
  bestStreak: number;
}

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: MilestoneCategory;
  // Returns ISO date string of the activity that completed the criterion,
  // or null if criterion isn't met yet. Used to back-date a badge unlocked
  // from history so the timeline reflects reality.
  metAt: (activities: Activity[], stats: MilestoneStats) => string | null;
}

// ── Helpers — reused across defs, kept DRY ────────────────────────────────────

function sortAsc(activities: Activity[]): Activity[] {
  return [...activities].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
}

// Earliest activity satisfying `predicate` — used for "first time X happened"
// criteria like "First 10 km" or "Sub-5 Pace".
function earliestMatching(activities: Activity[], predicate: (a: Activity) => boolean): string | null {
  const matches = sortAsc(activities).find(predicate);
  return matches ? matches.startDate : null;
}

// Date of the activity whose addition pushed a running sum past `threshold`.
// Used for lifetime totals like "100 km Club" or "Everest! (8849 m elev)".
function thresholdMetAt(
  activities: Activity[],
  value: (a: Activity) => number,
  threshold: number,
): string | null {
  let sum = 0;
  for (const a of sortAsc(activities)) {
    sum += value(a);
    if (sum >= threshold) return a.startDate;
  }
  return null;
}

// Date of the Nth activity matching `predicate` — used for "10 Runs", etc.
function nthMatchingAt(
  activities: Activity[],
  predicate: (a: Activity) => boolean,
  n: number,
): string | null {
  const matches = sortAsc(activities).filter(predicate);
  return matches[n - 1] ? matches[n - 1].startDate : null;
}

// Date the user first hit a daily-activity streak of `length`. Walks unique
// activity dates ascending and returns the date that completed the run.
function streakMetAt(activities: Activity[], length: number): string | null {
  const dates = Array.from(
    new Set(activities.map(a => activityDayKey(a))),
  ).sort();
  if (!dates.length) return null;
  let streak = 1;
  if (length === 1) return dates[0];
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round(
      (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000,
    );
    streak = diffDays === 1 ? streak + 1 : 1;
    if (streak >= length) return dates[i];
  }
  return null;
}

// "Triathlete" needs all three sport types logged at least once — the badge
// is earned on the latest of the earliest dates per sport.
function multiTypeMetAt(activities: Activity[], types: ReadonlyArray<Activity['type'] | string>): string | null {
  const earliestPerType = types.map(t => {
    const match = sortAsc(activities).find(a => (a.type as string) === t);
    return match ? new Date(match.startDate).getTime() : null;
  });
  if (earliestPerType.some(d => d === null)) return null;
  const latestOfFirsts = Math.max(...(earliestPerType as number[]));
  return new Date(latestOfFirsts).toISOString();
}

// ── Predicates ────────────────────────────────────────────────────────────────

const isRunOf = (minMetres: number) => (a: Activity) =>
  a.type === 'Run' && a.distance >= minMetres;
const isRunUnderPace = (minPerKm: number) => (a: Activity) =>
  a.type === 'Run' && a.averageSpeed > 0 && 1000 / a.averageSpeed / 60 < minPerKm;
const isRunWithElev = (minMetres: number) => (a: Activity) =>
  a.type === 'Run' && a.totalElevationGain >= minMetres;
const isRun = (a: Activity) => a.type === 'Run';
const isRide = (a: Activity) => a.type === 'Ride' || (a.type as string) === 'VirtualRide';
// Wall-clock hour at the recording site — startDateLocal carries the local
// time with a misleading Z suffix, so read the hour straight from the string
// instead of letting Date re-shift it into the device timezone.
const isAtHour = (predicate: (h: number) => boolean) => (a: Activity) =>
  a.type === 'Run' && predicate(parseInt((a.startDateLocal ?? a.startDate).slice(11, 13), 10));

// ── Defs ──────────────────────────────────────────────────────────────────────

const MILESTONE_DEFS: MilestoneDef[] = [
  // Distance — single run
  { id: 'km_5',     title: 'First 5 km',      description: 'Completed a 5 km run',                    icon: '🎽', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(5000))   },
  { id: 'km_10',    title: 'First 10 km',     description: 'Completed your first 10 km run',          icon: '🥇', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(10000))  },
  { id: 'km_15',    title: '15 km Warrior',   description: 'Ran 15 km in a single activity',          icon: '🏃', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(15000))  },
  { id: 'km_21',    title: 'Half Marathon',   description: 'Ran a half marathon (21.1 km)',           icon: '🏅', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(21097))  },
  { id: 'km_30',    title: '30 km Beast',     description: 'Ran 30 km in one go',                     icon: '💪', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(30000))  },
  { id: 'km_42',    title: 'Marathon Warrior',description: 'Completed a full marathon (42.2 km)',     icon: '🏆', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(42195))  },
  { id: 'km_50',    title: 'Ultra Runner',    description: 'Ran 50 km in a single activity',          icon: '🦁', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(50000))  },
  // Distance — total lifetime
  { id: 'km100',    title: '100 km Club',     description: 'Logged 100 km total',                     icon: '💯', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 100)   },
  { id: 'km250',    title: '250 km Milestone',description: 'Logged 250 km total',                     icon: '🌍', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 250)   },
  { id: 'km500',    title: '500 km Club',     description: 'Logged 500 km total',                     icon: '🌟', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 500)   },
  { id: 'km1000',   title: '1000 km Legend',  description: 'Logged 1,000 km total',                   icon: '🚀', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 1000)  },
  { id: 'km2000',   title: '2000 km Titan',   description: 'Logged 2,000 km total',                   icon: '🛸', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 2000)  },
  // Streak milestones — date the streak first reached the length.
  { id: 'streak3',  title: '3-Day Streak',    description: 'Active 3 days in a row',                  icon: '🔥', category: 'streak',    metAt: (a) => streakMetAt(a, 3)   },
  { id: 'streak7',  title: 'Week Warrior',    description: 'Active 7 days in a row',                  icon: '⚡', category: 'streak',    metAt: (a) => streakMetAt(a, 7)   },
  { id: 'streak14', title: 'Two-Week Grind',  description: 'Active 14 days in a row',                 icon: '🔑', category: 'streak',    metAt: (a) => streakMetAt(a, 14)  },
  { id: 'streak30', title: 'Iron Habit',      description: 'Active 30 days in a row',                 icon: '💎', category: 'streak',    metAt: (a) => streakMetAt(a, 30)  },
  { id: 'streak60', title: 'Unstoppable',     description: 'Active 60 days in a row',                 icon: '🌈', category: 'streak',    metAt: (a) => streakMetAt(a, 60)  },
  { id: 'streak100',title: 'Century Streak',  description: 'Active 100 days in a row',                icon: '🏺', category: 'streak',    metAt: (a) => streakMetAt(a, 100) },
  // Frequency milestones — date of the Nth qualifying activity.
  { id: 'runs5',    title: 'First 5 Runs',    description: 'Completed 5 runs',                        icon: '👟', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 5)    },
  { id: 'runs10',   title: '10 Runs',         description: 'Completed 10 runs',                       icon: '🎯', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 10)   },
  { id: 'runs25',   title: '25 Runs',         description: 'Completed 25 runs',                       icon: '🏅', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 25)   },
  { id: 'runs50',   title: '50 Runs',         description: 'Completed 50 runs',                       icon: '🎪', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 50)   },
  { id: 'runs100',  title: 'Centurion',       description: 'Completed 100 runs',                      icon: '👑', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 100)  },
  { id: 'runs200',  title: '200 Club',        description: 'Completed 200 runs',                      icon: '🌠', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 200)  },
  { id: 'acts100',  title: '100 Activities',  description: 'Logged 100 activities of any kind',       icon: '📊', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 100) },
  // Speed milestones
  { id: 'sub7',     title: 'Sub-7 Pace',      description: 'Ran at under 7:00 min/km',                icon: '🐢', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(7))   },
  { id: 'sub6',     title: 'Sub-6 Pace',      description: 'Ran at under 6:00 min/km',                icon: '💨', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(6))   },
  { id: 'sub5',     title: 'Sub-5 Pace',      description: 'Ran at under 5:00 min/km',                icon: '⚡', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(5))   },
  { id: 'sub4_5',   title: 'Speed Demon',     description: 'Ran at sub-4:30 min/km pace',             icon: '🔥', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(4.5)) },
  { id: 'sub4',     title: 'Elite Pacer',     description: 'Ran at sub-4:00 min/km pace',             icon: '🚀', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(4))   },
  // Elevation — single activity
  { id: 'elev200',  title: 'Hill Starter',    description: 'Climbed 200 m elevation in a run',        icon: '⛰️', category: 'elevation', metAt: (a) => earliestMatching(a, isRunWithElev(200))  },
  { id: 'elev500',  title: 'Hill Climber',    description: 'Climbed 500 m elevation in a run',        icon: '🏔️', category: 'elevation', metAt: (a) => earliestMatching(a, isRunWithElev(500))  },
  { id: 'elev1000', title: 'Mountain Goat',   description: 'Climbed 1000 m elevation in a run',       icon: '🦌', category: 'elevation', metAt: (a) => earliestMatching(a, isRunWithElev(1000)) },
  { id: 'elev2000', title: 'Everest Dreamer', description: 'Climbed 2000 m elevation in a run',       icon: '🌋', category: 'elevation', metAt: (a) => earliestMatching(a, isRunWithElev(2000)) },
  // Elevation — lifetime total
  { id: 'total_elev5000',  title: 'Altitude 5K', description: 'Climbed 5,000 m total elevation',     icon: '🗻', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 5000) },
  { id: 'total_elev10000', title: 'Everest!',    description: 'Climbed 8,849 m — the height of Everest', icon: '🏔️', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 8849) },
  // Time-of-day
  { id: 'early_bird', title: 'Early Bird',    description: 'Completed a run before 7am',              icon: '🌅', category: 'frequency', metAt: (a) => earliestMatching(a, isAtHour(h => h < 7))  },
  { id: 'night_owl',  title: 'Night Owl',     description: 'Completed a run after 9pm',               icon: '🌙', category: 'frequency', metAt: (a) => earliestMatching(a, isAtHour(h => h >= 21)) },
  // Multi-sport
  { id: 'cyclist',    title: 'Cyclist',       description: 'Logged a cycling activity',               icon: '🚴', category: 'frequency', metAt: (a) => earliestMatching(a, isRide) },
  { id: 'triathlete', title: 'Triathlete',    description: 'Logged a run, ride, and swim',            icon: '🏊', category: 'frequency', metAt: (a) => multiTypeMetAt(a, ['Run', 'Ride', 'Swim']) },
];

// ── Compute milestones from activities ────────────────────────────────────────

export function getAllMilestoneDefs(): MilestoneDef[] {
  return MILESTONE_DEFS;
}

// ── Progress toward unearned milestones ──────────────────────────────────────
//
// Powers the partial rings on locked badges and the "Next Badge" widget.
// Binary badges (early bird, cyclist…) have no meaningful progress → null.

export interface MilestoneProgress {
  current: number;
  target: number;
  /** 0..1, clamped. */
  pct: number;
  unit: string;
  /** Short human line: "412 / 500 km". */
  label: string;
}

interface ProgressSpec {
  target: number;
  unit: string;
  measure: keyof ProgressMeasures;
  /** Pace-style goals: lower value = better. */
  lowerIsBetter?: boolean;
}

interface ProgressMeasures {
  bestSingleRunKm: number;
  totalKm: number;
  bestStreak: number;
  runCount: number;
  activityCount: number;
  bestPaceMinKm: number;
  bestSingleElev: number;
  totalElev: number;
}

function computeMeasures(activities: Activity[]): ProgressMeasures {
  let bestSingleRunKm = 0;
  let totalKm = 0;
  let runCount = 0;
  let bestPaceMinKm = Infinity;
  let bestSingleElev = 0;
  let totalElev = 0;

  for (const a of activities) {
    totalKm += a.distance / 1000;
    totalElev += a.totalElevationGain;
    if (a.type === 'Run') {
      runCount++;
      bestSingleRunKm = Math.max(bestSingleRunKm, a.distance / 1000);
      bestSingleElev = Math.max(bestSingleElev, a.totalElevationGain);
      if (a.averageSpeed > 0) {
        bestPaceMinKm = Math.min(bestPaceMinKm, 1000 / a.averageSpeed / 60);
      }
    }
  }

  // bestStreak via the same unique-day walk streakMetAt uses.
  const dates = Array.from(new Set(activities.map(a => activityDayKey(a)))).sort();
  let bestStreak = dates.length ? 1 : 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
    streak = diff === 1 ? streak + 1 : 1;
    if (streak > bestStreak) bestStreak = streak;
  }

  return {
    bestSingleRunKm,
    totalKm,
    bestStreak,
    runCount,
    activityCount: activities.length,
    bestPaceMinKm,
    bestSingleElev,
    totalElev,
  };
}

const PROGRESS_SPECS: Record<string, ProgressSpec> = {
  km_5:     { target: 5,     unit: 'km',   measure: 'bestSingleRunKm' },
  km_10:    { target: 10,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_15:    { target: 15,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_21:    { target: 21.1,  unit: 'km',   measure: 'bestSingleRunKm' },
  km_30:    { target: 30,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_42:    { target: 42.2,  unit: 'km',   measure: 'bestSingleRunKm' },
  km_50:    { target: 50,    unit: 'km',   measure: 'bestSingleRunKm' },
  km100:    { target: 100,   unit: 'km',   measure: 'totalKm' },
  km250:    { target: 250,   unit: 'km',   measure: 'totalKm' },
  km500:    { target: 500,   unit: 'km',   measure: 'totalKm' },
  km1000:   { target: 1000,  unit: 'km',   measure: 'totalKm' },
  km2000:   { target: 2000,  unit: 'km',   measure: 'totalKm' },
  streak3:  { target: 3,     unit: 'days', measure: 'bestStreak' },
  streak7:  { target: 7,     unit: 'days', measure: 'bestStreak' },
  streak14: { target: 14,    unit: 'days', measure: 'bestStreak' },
  streak30: { target: 30,    unit: 'days', measure: 'bestStreak' },
  streak60: { target: 60,    unit: 'days', measure: 'bestStreak' },
  streak100:{ target: 100,   unit: 'days', measure: 'bestStreak' },
  runs5:    { target: 5,     unit: 'runs', measure: 'runCount' },
  runs10:   { target: 10,    unit: 'runs', measure: 'runCount' },
  runs25:   { target: 25,    unit: 'runs', measure: 'runCount' },
  runs50:   { target: 50,    unit: 'runs', measure: 'runCount' },
  runs100:  { target: 100,   unit: 'runs', measure: 'runCount' },
  runs200:  { target: 200,   unit: 'runs', measure: 'runCount' },
  acts100:  { target: 100,   unit: 'activities', measure: 'activityCount' },
  sub7:     { target: 7,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub6:     { target: 6,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub5:     { target: 5,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub4_5:   { target: 4.5,   unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub4:     { target: 4,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  elev200:  { target: 200,   unit: 'm',    measure: 'bestSingleElev' },
  elev500:  { target: 500,   unit: 'm',    measure: 'bestSingleElev' },
  elev1000: { target: 1000,  unit: 'm',    measure: 'bestSingleElev' },
  elev2000: { target: 2000,  unit: 'm',    measure: 'bestSingleElev' },
  total_elev5000:  { target: 5000, unit: 'm', measure: 'totalElev' },
  total_elev10000: { target: 8849, unit: 'm', measure: 'totalElev' },
};

function fmtMeasure(v: number, unit: string): string {
  if (unit === 'min/km') {
    if (!isFinite(v)) return '—';
    const m = Math.floor(v);
    const s = Math.round((v - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return v >= 100 ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}`;
}

/**
 * Progress for every milestone id in one call (measures computed once).
 * Ids without a spec (binary badges) are absent from the result.
 */
export function computeMilestoneProgress(activities: Activity[]): Record<string, MilestoneProgress> {
  const m = computeMeasures(activities);
  const out: Record<string, MilestoneProgress> = {};

  for (const [id, spec] of Object.entries(PROGRESS_SPECS)) {
    const value = m[spec.measure];
    let pct: number;
    if (spec.lowerIsBetter) {
      pct = isFinite(value) && value > 0 ? Math.min(1, spec.target / value) : 0;
    } else {
      pct = Math.min(1, value / spec.target);
    }
    const currentLabel = spec.lowerIsBetter
      ? fmtMeasure(value, spec.unit)
      : fmtMeasure(Math.min(value, spec.target), spec.unit);
    out[id] = {
      current: spec.lowerIsBetter ? value : Math.min(value, spec.target),
      target: spec.target,
      pct,
      unit: spec.unit,
      label: spec.lowerIsBetter
        ? `Best ${currentLabel} → ${fmtMeasure(spec.target, spec.unit)} ${spec.unit}`
        : `${currentLabel} / ${fmtMeasure(spec.target, spec.unit)} ${spec.unit}`,
    };
  }

  return out;
}

export function computeMilestones(
  activities: Activity[],
  existingMilestones: Milestone[],
  stats: MilestoneStats,
): Milestone[] {
  const existing = new Set(existingMilestones.map(m => m.id));
  const newOnes: Milestone[] = [];

  for (const def of MILESTONE_DEFS) {
    if (existing.has(def.id)) continue;
    const earnedAt = def.metAt(activities, stats);
    if (!earnedAt) continue;
    newOnes.push({
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      category: def.category,
      earnedAt,
    });
  }

  return [...existingMilestones, ...newOnes];
}

// ── Best efforts ──────────────────────────────────────────────────────────────

const DISTANCES = [1000, 5000, 10000]; // metres

/**
 * For each target distance, find the activity with the best average pace
 * (we can't do true splits without raw GPS data, so we use activities
 * whose distance is within 20% of the target as a proxy).
 */
export function computeBestEfforts(activities: Activity[]): Record<number, BestEffort> {
  const result: Record<number, BestEffort> = {};

  for (const dist of DISTANCES) {
    let bestPace = Infinity;
    let bestEffort: BestEffort | null = null;

    for (const act of activities) {
      if (act.type !== 'Run' || act.averageSpeed <= 0) continue;
      // For 1km: any run ≥ 1km qualifies (best avg pace proxy)
      // For 5km/10km: run must be within 20% of target distance
      const minDist = dist === 1000 ? 1000 : dist * 0.85;
      if (act.distance < minDist) continue;

      const paceMinPerKm = 1000 / act.averageSpeed / 60;
      if (paceMinPerKm < bestPace) {
        bestPace = paceMinPerKm;
        // Estimated time to cover the target distance at this pace
        const estSecs = Math.round((dist / 1000) * paceMinPerKm * 60);
        bestEffort = {
          distance: dist,
          time: estSecs,
          pace: paceMinPerKm,
          date: act.startDate.split('T')[0],
          activityName: act.name,
        };
      }
    }

    if (bestEffort) result[dist] = bestEffort;
  }

  return result;
}

// ── Training load (ATL / CTL / TSB) ──────────────────────────────────────────

/** Returns the daily training load for the last N days.
 *  Uses sufferScore if available, otherwise falls back to
 *  distance-based proxy (km × 10) so the widget works for
 *  users without HR data or Strava premium suffer scores.
 *  Buckets by the athlete's wall clock (start_date_local).
 */
function dailySufferScores(activities: Activity[], days: number): number[] {
  const scores = new Array(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const act of activities) {
    const dayKey = activityDayKey(act);
    const actDay = new Date(dayKey);
    actDay.setHours(0, 0, 0, 0);
    const daysAgo = Math.round((today.getTime() - actDay.getTime()) / 86400000);
    if (daysAgo >= 0 && daysAgo < days) {
      // prefer real suffer score; fall back to km-based proxy
      const load = act.sufferScore
        ? act.sufferScore
        : Math.round((act.distance / 1000) * 10);
      scores[days - 1 - daysAgo] += load;
    }
  }
  return scores;
}

function ewma(values: number[], decay: number): number[] {
  const result: number[] = [];
  let v = 0;
  for (const x of values) {
    v = v + (x - v) / decay;
    result.push(Math.round(v * 10) / 10);
  }
  return result;
}

export interface TrainingLoad {
  atl: number;  // Acute Training Load (7-day EWMA)
  ctl: number;  // Chronic Training Load (42-day EWMA)
  tsb: number;  // Training Stress Balance = CTL - ATL (form)
  history: { day: string; atl: number; ctl: number }[];
}

export interface TrainingLoadSeries {
  /** "M/D" labels, oldest → newest. */
  labels: string[];
  atl: number[];
  ctl: number[];
  /** Today's values. */
  current: { atl: number; ctl: number; tsb: number };
}

// 42 warm-up days stabilise the EWMAs before the visible window starts, so
// the left edge of the chart isn't a ramp from zero.
const EWMA_WARMUP_DAYS = 42;

/**
 * ATL/CTL series for the last `days` days in ONE pass over the activities.
 * Replaces the old per-day full recompute (56 × O(n) → O(n + days)).
 */
export function computeTrainingLoadSeries(activities: Activity[], days = 56): TrainingLoadSeries {
  const total = days + EWMA_WARMUP_DAYS;
  const raw = dailySufferScores(activities, total);
  const atlArr = ewma(raw, 7).slice(-days);
  const ctlArr = ewma(raw, 42).slice(-days);

  const today = new Date();
  const labels = atlArr.map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const atl = atlArr[atlArr.length - 1] ?? 0;
  const ctl = ctlArr[ctlArr.length - 1] ?? 0;
  return {
    labels,
    atl: atlArr,
    ctl: ctlArr,
    current: { atl, ctl, tsb: Math.round((ctl - atl) * 10) / 10 },
  };
}

export function computeTrainingLoad(activities: Activity[]): TrainingLoad {
  const series = computeTrainingLoadSeries(activities, 14);
  return {
    atl: series.current.atl,
    ctl: series.current.ctl,
    tsb: series.current.tsb,
    history: series.labels.map((day, i) => ({ day, atl: series.atl[i], ctl: series.ctl[i] })),
  };
}
