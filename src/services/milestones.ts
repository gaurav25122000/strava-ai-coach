import { Activity, Milestone, BestEffort } from '../store/useStore';

// ── Milestone definitions ─────────────────────────────────────────────────────

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: Milestone['category'];
  check: (activities: Activity[], stats: { totalKm: number; currentStreak: number; bestStreak: number }) => boolean;
}

const MILESTONE_DEFS: MilestoneDef[] = [
  // Distance milestones
  { id: 'km_10',    title: 'First 10 km',     description: 'Completed your first 10 km run',      icon: '🥇', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 10000) },
  { id: 'km_21',    title: 'Half Marathon',   description: 'Ran a half marathon (21.1 km)',        icon: '🏅', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 21097) },
  { id: 'km_42',    title: 'Marathon Warrior',description: 'Completed a full marathon (42.2 km)', icon: '🏆', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 42195) },
  { id: 'km100',    title: '100 km Club',     description: 'Logged 100 km total',                 icon: '💯', category: 'distance',  check: (_, s) => s.totalKm >= 100 },
  { id: 'km500',    title: '500 km Club',     description: 'Logged 500 km total',                 icon: '🌟', category: 'distance',  check: (_, s) => s.totalKm >= 500 },
  { id: 'km1000',   title: '1000 km Legend',  description: 'Logged 1,000 km total',               icon: '🚀', category: 'distance',  check: (_, s) => s.totalKm >= 1000 },
  // Streak milestones
  { id: 'streak3',  title: '3-Day Streak',    description: 'Active 3 days in a row',              icon: '🔥', category: 'streak',    check: (_, s) => s.bestStreak >= 3 },
  { id: 'streak7',  title: 'Week Warrior',    description: 'Active 7 days in a row',              icon: '⚡', category: 'streak',    check: (_, s) => s.bestStreak >= 7 },
  { id: 'streak30', title: 'Iron Habit',      description: 'Active 30 days in a row',             icon: '💎', category: 'streak',    check: (_, s) => s.bestStreak >= 30 },
  // Frequency milestones
  { id: 'runs10',   title: '10 Runs',         description: 'Completed 10 runs',                   icon: '👟', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 10 },
  { id: 'runs50',   title: '50 Runs',         description: 'Completed 50 runs',                   icon: '🎯', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 50 },
  { id: 'runs100',  title: 'Centurion',       description: 'Completed 100 runs',                  icon: '👑', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 100 },
  // Speed milestones
  { id: 'sub6',     title: 'Sub-6 Pace',      description: 'Ran a km in under 6 min/km',          icon: '💨', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 6) },
  { id: 'sub5',     title: 'Sub-5 Pace',      description: 'Ran a km in under 5 min/km',          icon: '⚡', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 5) },
  { id: 'sub4_5',   title: 'Speed Demon',     description: 'Ran at sub-4:30 min/km pace',         icon: '🔥', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 4.5) },
  // Elevation milestones
  { id: 'elev500',  title: 'Hill Climber',    description: 'Climbed 500 m elevation in a run',    icon: '⛰️', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 500) },
  { id: 'elev1000', title: 'Mountain Goat',   description: 'Climbed 1000 m elevation in a run',   icon: '🏔️', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 1000) },
];

// ── Compute milestones from activities ────────────────────────────────────────

export function getAllMilestoneDefs(): MilestoneDef[] {
  return MILESTONE_DEFS;
}

export function computeMilestones(
  activities: Activity[],
  existingMilestones: Milestone[],
  stats: { totalKm: number; currentStreak: number; bestStreak: number }
): Milestone[] {
  const existing = new Set(existingMilestones.map(m => m.id));
  const newOnes: Milestone[] = [];

  for (const def of MILESTONE_DEFS) {
    if (existing.has(def.id)) continue;
    if (def.check(activities, stats)) {
      newOnes.push({
        id: def.id,
        title: def.title,
        description: def.description,
        icon: def.icon,
        category: def.category,
        earnedAt: new Date().toISOString(),
      });
    }
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

/** Returns the daily suffer score for the last N days */
function dailySufferScores(activities: Activity[], days: number): number[] {
  const scores = new Array(days).fill(0);
  const now = new Date();
  for (const act of activities) {
    const daysAgo = Math.floor((now.getTime() - new Date(act.startDate).getTime()) / 86400000);
    if (daysAgo >= 0 && daysAgo < days) {
      scores[days - 1 - daysAgo] += (act.sufferScore || 0);
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

export function computeTrainingLoad(activities: Activity[]): TrainingLoad {
  const DAYS = 42;
  const raw = dailySufferScores(activities, DAYS);
  const atlArr = ewma(raw, 7);
  const ctlArr = ewma(raw, 42);

  const today = new Date();
  const history = atlArr.slice(-14).map((atl, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return {
      day: `${d.getMonth() + 1}/${d.getDate()}`,
      atl,
      ctl: ctlArr[atlArr.length - 14 + i],
    };
  });

  const atl = atlArr[atlArr.length - 1];
  const ctl = ctlArr[ctlArr.length - 1];
  return { atl, ctl, tsb: Math.round((ctl - atl) * 10) / 10, history };
}
