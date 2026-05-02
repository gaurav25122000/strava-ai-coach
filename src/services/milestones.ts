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
  // Distance — single run
  { id: 'km_5',     title: 'First 5 km',        description: 'Completed a 5 km run',                icon: '🎽', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 5000) },
  { id: 'km_10',    title: 'First 10 km',        description: 'Completed your first 10 km run',      icon: '🥇', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 10000) },
  { id: 'km_15',    title: '15 km Warrior',      description: 'Ran 15 km in a single activity',      icon: '🏃', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 15000) },
  { id: 'km_21',    title: 'Half Marathon',      description: 'Ran a half marathon (21.1 km)',        icon: '🏅', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 21097) },
  { id: 'km_30',    title: '30 km Beast',        description: 'Ran 30 km in one go',                 icon: '💪', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 30000) },
  { id: 'km_42',    title: 'Marathon Warrior',   description: 'Completed a full marathon (42.2 km)', icon: '🏆', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 42195) },
  { id: 'km_50',    title: 'Ultra Runner',       description: 'Ran 50 km in a single activity',      icon: '🦁', category: 'distance',  check: (acts) => acts.some(a => a.type === 'Run' && a.distance >= 50000) },
  // Distance — total lifetime
  { id: 'km100',    title: '100 km Club',        description: 'Logged 100 km total',                 icon: '💯', category: 'distance',  check: (_, s) => s.totalKm >= 100 },
  { id: 'km250',    title: '250 km Milestone',   description: 'Logged 250 km total',                 icon: '🌍', category: 'distance',  check: (_, s) => s.totalKm >= 250 },
  { id: 'km500',    title: '500 km Club',        description: 'Logged 500 km total',                 icon: '🌟', category: 'distance',  check: (_, s) => s.totalKm >= 500 },
  { id: 'km1000',   title: '1000 km Legend',     description: 'Logged 1,000 km total',               icon: '🚀', category: 'distance',  check: (_, s) => s.totalKm >= 1000 },
  { id: 'km2000',   title: '2000 km Titan',      description: 'Logged 2,000 km total',               icon: '🛸', category: 'distance',  check: (_, s) => s.totalKm >= 2000 },
  // Streak milestones
  { id: 'streak3',  title: '3-Day Streak',       description: 'Active 3 days in a row',              icon: '🔥', category: 'streak',    check: (_, s) => s.bestStreak >= 3 },
  { id: 'streak7',  title: 'Week Warrior',       description: 'Active 7 days in a row',              icon: '⚡', category: 'streak',    check: (_, s) => s.bestStreak >= 7 },
  { id: 'streak14', title: 'Two-Week Grind',     description: 'Active 14 days in a row',             icon: '🔑', category: 'streak',    check: (_, s) => s.bestStreak >= 14 },
  { id: 'streak30', title: 'Iron Habit',         description: 'Active 30 days in a row',             icon: '💎', category: 'streak',    check: (_, s) => s.bestStreak >= 30 },
  { id: 'streak60', title: 'Unstoppable',        description: 'Active 60 days in a row',             icon: '🌈', category: 'streak',    check: (_, s) => s.bestStreak >= 60 },
  { id: 'streak100',title: 'Century Streak',     description: 'Active 100 days in a row',            icon: '🏺', category: 'streak',    check: (_, s) => s.bestStreak >= 100 },
  // Frequency milestones
  { id: 'runs5',    title: 'First 5 Runs',       description: 'Completed 5 runs',                    icon: '👟', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 5 },
  { id: 'runs10',   title: '10 Runs',            description: 'Completed 10 runs',                   icon: '🎯', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 10 },
  { id: 'runs25',   title: '25 Runs',            description: 'Completed 25 runs',                   icon: '🏅', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 25 },
  { id: 'runs50',   title: '50 Runs',            description: 'Completed 50 runs',                   icon: '🎪', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 50 },
  { id: 'runs100',  title: 'Centurion',          description: 'Completed 100 runs',                  icon: '👑', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 100 },
  { id: 'runs200',  title: '200 Club',           description: 'Completed 200 runs',                  icon: '🌠', category: 'frequency', check: (acts) => acts.filter(a => a.type === 'Run').length >= 200 },
  { id: 'acts100',  title: '100 Activities',     description: 'Logged 100 activities of any kind',   icon: '📊', category: 'frequency', check: (acts) => acts.length >= 100 },
  // Speed milestones
  { id: 'sub7',     title: 'Sub-7 Pace',         description: 'Ran at under 7:00 min/km',            icon: '🐢', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 7) },
  { id: 'sub6',     title: 'Sub-6 Pace',         description: 'Ran at under 6:00 min/km',            icon: '💨', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 6) },
  { id: 'sub5',     title: 'Sub-5 Pace',         description: 'Ran at under 5:00 min/km',            icon: '⚡', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 5) },
  { id: 'sub4_5',   title: 'Speed Demon',        description: 'Ran at sub-4:30 min/km pace',         icon: '🔥', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 4.5) },
  { id: 'sub4',     title: 'Elite Pacer',        description: 'Ran at sub-4:00 min/km pace',         icon: '🚀', category: 'speed',     check: (acts) => acts.some(a => a.type === 'Run' && a.averageSpeed > 0 && (1000 / a.averageSpeed / 60) < 4) },
  // Elevation milestones — single activity
  { id: 'elev200',  title: 'Hill Starter',       description: 'Climbed 200 m elevation in a run',    icon: '⛰️', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 200) },
  { id: 'elev500',  title: 'Hill Climber',       description: 'Climbed 500 m elevation in a run',    icon: '🏔️', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 500) },
  { id: 'elev1000', title: 'Mountain Goat',      description: 'Climbed 1000 m elevation in a run',   icon: '🦌', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 1000) },
  { id: 'elev2000', title: 'Everest Dreamer',    description: 'Climbed 2000 m elevation in a run',   icon: '🌋', category: 'elevation', check: (acts) => acts.some(a => a.totalElevationGain >= 2000) },
  // Elevation — lifetime total
  { id: 'total_elev5000',  title: 'Altitude 5K', description: 'Climbed 5,000 m total elevation',    icon: '🗻', category: 'elevation', check: (acts) => acts.reduce((s, a) => s + a.totalElevationGain, 0) >= 5000 },
  { id: 'total_elev10000', title: 'Everest!',    description: 'Climbed 8,849 m — the height of Everest', icon: '🏔️', category: 'elevation', check: (acts) => acts.reduce((s, a) => s + a.totalElevationGain, 0) >= 8849 },
  // Early bird
  { id: 'early_bird', title: 'Early Bird',       description: 'Completed a run before 7am',          icon: '🌅', category: 'frequency', check: (acts) => acts.some(a => { const h = new Date(a.startDate).getHours(); return (a.type === 'Run') && h < 7; }) },
  { id: 'night_owl',  title: 'Night Owl',        description: 'Completed a run after 9pm',           icon: '🌙', category: 'frequency', check: (acts) => acts.some(a => { const h = new Date(a.startDate).getHours(); return (a.type === 'Run') && h >= 21; }) },
  // Multi-sport
  { id: 'cyclist',    title: 'Cyclist',          description: 'Logged a cycling activity',            icon: '🚴', category: 'frequency', check: (acts) => acts.some(a => a.type === 'Ride' || a.type === 'VirtualRide') },
  { id: 'triathlete', title: 'Triathlete',       description: 'Logged a run, ride, and swim',         icon: '🏊', category: 'frequency', check: (acts) => { const types = new Set(acts.map(a => a.type)); return types.has('Run') && (types.has('Ride') || types.has('VirtualRide')) && types.has('Swim'); } },
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
