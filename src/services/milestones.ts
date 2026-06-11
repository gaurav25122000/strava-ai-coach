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

// First weekend with activity on BOTH Saturday and Sunday — returns the date
// of the activity that completed the pair.
function weekendMetAt(activities: Activity[]): string | null {
  // weekend key = the Saturday's day key (Sunday maps back one day)
  const halves = new Map<string, { sat?: string; sun?: string }>();
  for (const a of sortAsc(activities)) {
    const dayKey = activityDayKey(a);
    const d = new Date(`${dayKey}T00:00:00Z`);
    const dow = d.getUTCDay();
    if (dow !== 6 && dow !== 0) continue;
    const satKey = dow === 6
      ? dayKey
      : new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
    const half = halves.get(satKey) ?? {};
    if (dow === 6) half.sat = half.sat ?? a.startDate;
    else half.sun = half.sun ?? a.startDate;
    halves.set(satKey, half);
    if (half.sat && half.sun) return a.startDate;
  }
  return null;
}

// First day with `n` or more activities — the date of the activity that
// brought the day's count to `n`.
function nthSameDayMetAt(activities: Activity[], n: number): string | null {
  const counts = new Map<string, number>();
  for (const a of sortAsc(activities)) {
    const key = activityDayKey(a);
    const c = (counts.get(key) ?? 0) + 1;
    counts.set(key, c);
    if (c === n) return a.startDate;
  }
  return null;
}

// Date the user's `n`th DISTINCT day matching `predicate` happened — used for
// "10 early mornings", "10 Mondays", etc. Distinct days so a double session
// doesn't double-count.
function distinctDaysMetAt(
  activities: Activity[],
  predicate: (a: Activity) => boolean,
  n: number,
): string | null {
  const days = new Set<string>();
  for (const a of sortAsc(activities)) {
    if (!predicate(a)) continue;
    const key = activityDayKey(a);
    if (days.has(key)) continue;
    days.add(key);
    if (days.size === n) return a.startDate;
  }
  return null;
}

// Date the `n`th distinct sport type first appeared.
function sportsMetAt(activities: Activity[], n: number): string | null {
  const types = new Set<string>();
  for (const a of sortAsc(activities)) {
    if (types.has(a.type)) continue;
    types.add(a.type);
    if (types.size === n) return a.startDate;
  }
  return null;
}

// Monday (UTC) of the week containing a YYYY-MM-DD day key.
function weekStartOf(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

// Date the user first completed `length` consecutive active weeks (≥1
// activity per ISO week). Returns the earliest activity date of the week
// that completed the run.
function weekStreakMetAt(activities: Activity[], length: number): string | null {
  const firstInWeek = new Map<string, string>();
  for (const a of sortAsc(activities)) {
    const wk = weekStartOf(activityDayKey(a));
    if (!firstInWeek.has(wk)) firstInWeek.set(wk, a.startDate);
  }
  const weeks = Array.from(firstInWeek.keys()).sort();
  if (!weeks.length) return null;
  let streak = 1;
  if (length === 1) return firstInWeek.get(weeks[0])!;
  for (let i = 1; i < weeks.length; i++) {
    const diffDays = Math.round(
      (new Date(weeks[i]).getTime() - new Date(weeks[i - 1]).getTime()) / 86400000,
    );
    streak = diffDays === 7 ? streak + 1 : 1;
    if (streak >= length) return firstInWeek.get(weeks[i])!;
  }
  return null;
}

// Date a single calendar month's distance first crossed `km` — the activity
// that tipped the month over the line.
function monthKmMetAt(activities: Activity[], km: number): string | null {
  const sums = new Map<string, number>();
  for (const a of sortAsc(activities)) {
    const month = activityDayKey(a).slice(0, 7);
    const sum = (sums.get(month) ?? 0) + a.distance / 1000;
    sums.set(month, sum);
    if (sum >= km) return a.startDate;
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
// Elevation badges are sport-agnostic — a hike up a hill counts the same as
// a hill run.
const isElevOf = (minMetres: number) => (a: Activity) => a.totalElevationGain >= minMetres;
const isRun = (a: Activity) => a.type === 'Run';
const isRide = (a: Activity) => a.type === 'Ride' || (a.type as string) === 'VirtualRide';
const isRideOf = (minMetres: number) => (a: Activity) => isRide(a) && a.distance >= minMetres;
const isWalk = (a: Activity) => a.type === 'Walk' || a.type === 'Hike';
const isWalkOf = (minMetres: number) => (a: Activity) => isWalk(a) && a.distance >= minMetres;
// Brisk-walk pace needs a real walk (≥3 km) so a 200 m stroll can't earn it.
const isWalkUnderPace = (minPerKm: number) => (a: Activity) =>
  isWalk(a) && a.distance >= 3000 && a.averageSpeed > 0 && 1000 / a.averageSpeed / 60 < minPerKm;
const isLongerThan = (minSecs: number) => (a: Activity) => a.movingTime >= minSecs;
const isOnDow = (dow: number) => (a: Activity) =>
  new Date(`${activityDayKey(a)}T00:00:00Z`).getUTCDay() === dow;
const isOnJan1 = (a: Activity) => activityDayKey(a).slice(5) === '01-01';
// Wall-clock hour at the recording site — startDateLocal carries the local
// time with a misleading Z suffix, so read the hour straight from the string
// instead of letting Date re-shift it into the device timezone. Any sport
// counts — a 6am walk is just as much an early bird as a 6am run.
const isAtHour = (predicate: (h: number) => boolean) => (a: Activity) =>
  predicate(parseInt((a.startDateLocal ?? a.startDate).slice(11, 13), 10));

// ── Defs ──────────────────────────────────────────────────────────────────────

const MILESTONE_DEFS: MilestoneDef[] = [
  // Distance — single run
  { id: 'km_5',     title: 'First 5 km',      description: 'Completed a 5 km run',                    icon: '🎽', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(5000))   },
  { id: 'km_10',    title: 'First 10 km',     description: 'Completed your first 10 km run',          icon: '🥇', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(10000))  },
  { id: 'km_15',    title: '15 km Warrior',   description: 'Ran 15 km in a single activity',          icon: '🏃', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(15000))  },
  { id: 'km_21',    title: 'Half Marathon',   description: 'Ran a half marathon (21.1 km)',           icon: '🏅', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(21097))  },
  { id: 'km_25',    title: '25 km Grinder',   description: 'Ran 25 km in a single activity',          icon: '🐺', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(25000))  },
  { id: 'km_30',    title: '30 km Beast',     description: 'Ran 30 km in one go',                     icon: '💪', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(30000))  },
  { id: 'km_42',    title: 'Marathon Warrior',description: 'Completed a full marathon (42.2 km)',     icon: '🏆', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(42195))  },
  { id: 'km_50',    title: 'Ultra Runner',    description: 'Ran 50 km in a single activity',          icon: '🦁', category: 'distance',  metAt: (a) => earliestMatching(a, isRunOf(50000))  },
  // Distance — single walk (walks and hikes both count)
  { id: 'walk_5k',  title: 'First 5 km Walk', description: 'Walked 5 km in a single outing',          icon: '🚶', category: 'distance',  metAt: (a) => earliestMatching(a, isWalkOf(5000))  },
  { id: 'walk_10k', title: 'Long Stroll',     description: 'Walked 10 km in a single outing',         icon: '🥾', category: 'distance',  metAt: (a) => earliestMatching(a, isWalkOf(10000)) },
  { id: 'walk_15k', title: 'Epic Wander',     description: 'Walked 15 km in a single outing',         icon: '🏞️', category: 'distance',  metAt: (a) => earliestMatching(a, isWalkOf(15000)) },
  { id: 'walk_21k', title: 'Half Marathon Walk', description: 'Walked a half marathon (21.1 km)',     icon: '🎖️', category: 'distance',  metAt: (a) => earliestMatching(a, isWalkOf(21097)) },
  // Distance — single ride
  { id: 'ride_25k',  title: '25 km Spin',     description: 'Rode 25 km in a single ride',             icon: '🚲', category: 'distance',  metAt: (a) => earliestMatching(a, isRideOf(25000))  },
  { id: 'ride_50k',  title: 'Fifty K Flyer',  description: 'Rode 50 km in a single ride',             icon: '💫', category: 'distance',  metAt: (a) => earliestMatching(a, isRideOf(50000))  },
  { id: 'ride_100k', title: 'Century Ride',   description: 'Rode 100 km in a single ride',            icon: '🚵', category: 'distance',  metAt: (a) => earliestMatching(a, isRideOf(100000)) },
  // Distance — total lifetime
  { id: 'km50',     title: 'Getting Going',   description: 'Logged your first 50 km total',           icon: '🌱', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 50)    },
  { id: 'km100',    title: '100 km Club',     description: 'Logged 100 km total',                     icon: '💯', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 100)   },
  { id: 'km250',    title: '250 km Milestone',description: 'Logged 250 km total',                     icon: '🌍', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 250)   },
  { id: 'km500',    title: '500 km Club',     description: 'Logged 500 km total',                     icon: '🌟', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 500)   },
  { id: 'km1000',   title: '1000 km Legend',  description: 'Logged 1,000 km total',                   icon: '🚀', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 1000)  },
  { id: 'km2000',   title: '2000 km Titan',   description: 'Logged 2,000 km total',                   icon: '🛸', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 2000)  },
  { id: 'km3000',   title: '3000 km Voyager', description: 'Logged 3,000 km total',                   icon: '🛰️', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 3000)  },
  { id: 'km5000',   title: '5000 km Odyssey', description: 'Logged 5,000 km total',                   icon: '🌏', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 5000)  },
  { id: 'km10000',  title: '10,000 km Immortal', description: 'Logged 10,000 km total',               icon: '🏛️', category: 'distance',  metAt: (a) => thresholdMetAt(a, x => x.distance / 1000, 10000) },
  // Streak milestones — date the streak first reached the length.
  { id: 'streak3',  title: '3-Day Streak',    description: 'Active 3 days in a row',                  icon: '🔥', category: 'streak',    metAt: (a) => streakMetAt(a, 3)   },
  { id: 'streak5',  title: 'High Five',       description: 'Active 5 days in a row',                  icon: '🖐️', category: 'streak',    metAt: (a) => streakMetAt(a, 5)   },
  { id: 'streak7',  title: 'Week Warrior',    description: 'Active 7 days in a row',                  icon: '⚡', category: 'streak',    metAt: (a) => streakMetAt(a, 7)   },
  { id: 'streak14', title: 'Two-Week Grind',  description: 'Active 14 days in a row',                 icon: '🔑', category: 'streak',    metAt: (a) => streakMetAt(a, 14)  },
  { id: 'streak21', title: '21-Day Ritual',   description: 'Active 21 days in a row',                 icon: '🧘', category: 'streak',    metAt: (a) => streakMetAt(a, 21)  },
  { id: 'streak30', title: 'Iron Habit',      description: 'Active 30 days in a row',                 icon: '💎', category: 'streak',    metAt: (a) => streakMetAt(a, 30)  },
  { id: 'streak60', title: 'Unstoppable',     description: 'Active 60 days in a row',                 icon: '🌈', category: 'streak',    metAt: (a) => streakMetAt(a, 60)  },
  { id: 'streak100',title: 'Century Streak',  description: 'Active 100 days in a row',                icon: '🏺', category: 'streak',    metAt: (a) => streakMetAt(a, 100) },
  { id: 'streak180',title: 'Half-Year Flame', description: 'Active 180 days in a row',                icon: '🕯️', category: 'streak',    metAt: (a) => streakMetAt(a, 180) },
  { id: 'streak365',title: '365 Legend',      description: 'Active every single day for a year',      icon: '🎆', category: 'streak',    metAt: (a) => streakMetAt(a, 365) },
  // Frequency milestones — date of the Nth qualifying activity.
  { id: 'runs5',    title: 'First 5 Runs',    description: 'Completed 5 runs',                        icon: '👟', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 5)    },
  { id: 'runs10',   title: '10 Runs',         description: 'Completed 10 runs',                       icon: '🎯', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 10)   },
  { id: 'runs25',   title: '25 Runs',         description: 'Completed 25 runs',                       icon: '🏅', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 25)   },
  { id: 'runs50',   title: '50 Runs',         description: 'Completed 50 runs',                       icon: '🎪', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 50)   },
  { id: 'runs100',  title: 'Centurion',       description: 'Completed 100 runs',                      icon: '👑', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 100)  },
  { id: 'runs200',  title: '200 Club',        description: 'Completed 200 runs',                      icon: '🌠', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 200)  },
  { id: 'runs500',  title: '500 Runs',        description: 'Completed 500 runs',                      icon: '🦅', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRun, 500)  },
  { id: 'walks10',  title: 'Wanderer',        description: 'Completed 10 walks or hikes',             icon: '🐾', category: 'frequency', metAt: (a) => nthMatchingAt(a, isWalk, 10)  },
  { id: 'walks25',  title: 'Trail Regular',   description: 'Completed 25 walks or hikes',             icon: '🌿', category: 'frequency', metAt: (a) => nthMatchingAt(a, isWalk, 25)  },
  { id: 'walks50',  title: 'Pathfinder',      description: 'Completed 50 walks or hikes',             icon: '🧭', category: 'frequency', metAt: (a) => nthMatchingAt(a, isWalk, 50)  },
  { id: 'walks100', title: 'Century Strider', description: 'Completed 100 walks or hikes',            icon: '🦶', category: 'frequency', metAt: (a) => nthMatchingAt(a, isWalk, 100) },
  { id: 'walks250', title: 'Walking Legend',  description: 'Completed 250 walks or hikes',            icon: '📚', category: 'frequency', metAt: (a) => nthMatchingAt(a, isWalk, 250) },
  { id: 'acts25',   title: 'Warming Up',      description: 'Logged 25 activities of any kind',        icon: '🔆', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 25)  },
  { id: 'acts50',   title: 'Half Century',    description: 'Logged 50 activities of any kind',        icon: '📒', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 50)  },
  { id: 'acts100',  title: '100 Activities',  description: 'Logged 100 activities of any kind',       icon: '📊', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 100) },
  { id: 'acts250',  title: 'Collector',       description: 'Logged 250 activities of any kind',       icon: '🗃️', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 250) },
  { id: 'acts500',  title: 'Relentless',      description: 'Logged 500 activities of any kind',       icon: '🌪️', category: 'frequency', metAt: (a) => nthMatchingAt(a, () => true, 500) },
  // Time on feet — single activity and lifetime, any sport.
  { id: 'hour_1',   title: 'Hour of Power',   description: 'Kept moving for a full hour',             icon: '⏱️', category: 'duration',  metAt: (a) => earliestMatching(a, isLongerThan(3600))  },
  { id: 'hour_2',   title: 'Two-Hour Epic',   description: 'A single activity over two hours',        icon: '⏳', category: 'duration',  metAt: (a) => earliestMatching(a, isLongerThan(7200))  },
  { id: 'hour_3',   title: 'Three-Hour Odyssey', description: 'A single activity over three hours',   icon: '🏕️', category: 'duration',  metAt: (a) => earliestMatching(a, isLongerThan(10800)) },
  { id: 'time10h',  title: 'Ten Hours In',    description: '10 hours of total moving time',           icon: '🕙', category: 'duration',  metAt: (a) => thresholdMetAt(a, x => x.movingTime / 3600, 10)  },
  { id: 'time25h',  title: '25 Hours Deep',   description: '25 hours of total moving time',           icon: '🌗', category: 'duration',  metAt: (a) => thresholdMetAt(a, x => x.movingTime / 3600, 25)  },
  { id: 'time50h',  title: 'Fifty Hours Strong', description: '50 hours of total moving time',        icon: '🕰️', category: 'duration',  metAt: (a) => thresholdMetAt(a, x => x.movingTime / 3600, 50)  },
  { id: 'time100h', title: 'Hundred Hour Club',  description: '100 hours of total moving time',       icon: '⏰', category: 'duration',  metAt: (a) => thresholdMetAt(a, x => x.movingTime / 3600, 100) },
  { id: 'time250h', title: '250 Hour Titan',  description: '250 hours of total moving time',          icon: '🪨', category: 'duration',  metAt: (a) => thresholdMetAt(a, x => x.movingTime / 3600, 250) },
  // Consistency — showing up, not just going far.
  { id: 'weekend',    title: 'Weekend Warrior', description: 'Active on both Saturday and Sunday of one weekend', icon: '🎒', category: 'consistency', metAt: (a) => weekendMetAt(a)        },
  { id: 'double_day', title: 'Daily Double',    description: 'Two activities in a single day',                   icon: '✌️', category: 'consistency', metAt: (a) => nthSameDayMetAt(a, 2)  },
  { id: 'triple_day', title: 'Hat Trick',       description: 'Three activities in a single day',                 icon: '🎩', category: 'consistency', metAt: (a) => nthSameDayMetAt(a, 3)  },
  { id: 'weeks4',     title: 'Habit Builder',   description: 'Active every week for 4 weeks straight',           icon: '📅', category: 'consistency', metAt: (a) => weekStreakMetAt(a, 4)  },
  { id: 'weeks12',    title: 'Quarter Champion',description: 'Active every week for 12 weeks straight',          icon: '🗓️', category: 'consistency', metAt: (a) => weekStreakMetAt(a, 12) },
  { id: 'weeks26',    title: '26-Week Machine', description: 'Active every week for half a year',                icon: '⚙️', category: 'consistency', metAt: (a) => weekStreakMetAt(a, 26) },
  { id: 'weeks52',    title: 'Year-Long Constant', description: 'Active every week for a full year',             icon: '🏵️', category: 'consistency', metAt: (a) => weekStreakMetAt(a, 52) },
  { id: 'month50',    title: 'Solid Month',     description: '50 km inside one calendar month',                  icon: '🧱', category: 'consistency', metAt: (a) => monthKmMetAt(a, 50)    },
  { id: 'month100',   title: 'Big Month',       description: '100 km inside one calendar month',                 icon: '📈', category: 'consistency', metAt: (a) => monthKmMetAt(a, 100)   },
  { id: 'month200',   title: 'Monster Month',   description: '200 km inside one calendar month',                 icon: '👹', category: 'consistency', metAt: (a) => monthKmMetAt(a, 200)   },
  // Speed milestones
  { id: 'sub8',     title: 'Finding Your Feet', description: 'Ran at under 8:00 min/km',              icon: '🐣', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(8))   },
  { id: 'sub7',     title: 'Sub-7 Pace',      description: 'Ran at under 7:00 min/km',                icon: '🐢', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(7))   },
  { id: 'sub6',     title: 'Sub-6 Pace',      description: 'Ran at under 6:00 min/km',                icon: '💨', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(6))   },
  { id: 'sub5',     title: 'Sub-5 Pace',      description: 'Ran at under 5:00 min/km',                icon: '⚡', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(5))   },
  { id: 'sub4_5',   title: 'Speed Demon',     description: 'Ran at sub-4:30 min/km pace',             icon: '🔥', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(4.5)) },
  { id: 'sub4',     title: 'Elite Pacer',     description: 'Ran at sub-4:00 min/km pace',             icon: '🚀', category: 'speed',     metAt: (a) => earliestMatching(a, isRunUnderPace(4))   },
  { id: 'walk_pace10', title: 'Power Walker', description: 'Walked 3 km+ at under 10:00 min/km',      icon: '👣', category: 'speed',     metAt: (a) => earliestMatching(a, isWalkUnderPace(10)) },
  // Elevation — single activity, any sport (a hill hike counts).
  { id: 'elev100',  title: 'First Climb',     description: 'Climbed 100 m elevation in one activity', icon: '🪜', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(100))  },
  { id: 'elev200',  title: 'Hill Starter',    description: 'Climbed 200 m elevation in one activity', icon: '⛰️', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(200))  },
  { id: 'elev500',  title: 'Hill Climber',    description: 'Climbed 500 m elevation in one activity', icon: '🏔️', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(500))  },
  { id: 'elev1000', title: 'Mountain Goat',   description: 'Climbed 1000 m elevation in one activity',icon: '🦌', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(1000)) },
  { id: 'elev2000', title: 'Everest Dreamer', description: 'Climbed 2000 m elevation in one activity',icon: '🌋', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(2000)) },
  { id: 'elev3000', title: 'Sky Piercer',     description: 'Climbed 3000 m elevation in one activity',icon: '🗼', category: 'elevation', metAt: (a) => earliestMatching(a, isElevOf(3000)) },
  // Elevation — lifetime total
  { id: 'total_elev2500',  title: 'Climbing Curious', description: 'Climbed 2,500 m total elevation', icon: '🧗', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 2500)  },
  { id: 'total_elev5000',  title: 'Altitude 5K', description: 'Climbed 5,000 m total elevation',      icon: '🗻', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 5000)  },
  { id: 'total_elev10000', title: 'Everest!',    description: 'Climbed 8,849 m — the height of Everest', icon: '🏔️', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 8849)  },
  { id: 'total_elev17698', title: 'Double Everest', description: 'Climbed 17,698 m — Everest, twice', icon: '⛏️', category: 'elevation', metAt: (a) => thresholdMetAt(a, x => x.totalElevationGain, 17698) },
  // Time-of-day & calendar
  { id: 'early_bird', title: 'Early Bird',    description: 'Started an activity before 7am',          icon: '🌅', category: 'frequency', metAt: (a) => earliestMatching(a, isAtHour(h => h < 7))   },
  { id: 'night_owl',  title: 'Night Owl',     description: 'Started an activity after 9pm',           icon: '🌙', category: 'frequency', metAt: (a) => earliestMatching(a, isAtHour(h => h >= 21)) },
  { id: 'early10',    title: 'Sunrise Chaser',description: '10 different days starting before 7am',   icon: '🌄', category: 'frequency', metAt: (a) => distinctDaysMetAt(a, isAtHour(h => h < 7), 10)   },
  { id: 'night10',    title: 'Moonlighter',   description: '10 different days starting after 9pm',    icon: '🌚', category: 'frequency', metAt: (a) => distinctDaysMetAt(a, isAtHour(h => h >= 21), 10) },
  { id: 'lunch',      title: 'Lunch Break Athlete', description: 'Started an activity between noon and 2pm', icon: '🥪', category: 'frequency', metAt: (a) => earliestMatching(a, isAtHour(h => h >= 12 && h < 14)) },
  { id: 'monday10',   title: 'Monday Motivation',   description: 'Active on 10 different Mondays',    icon: '☕', category: 'consistency', metAt: (a) => distinctDaysMetAt(a, isOnDow(1), 10) },
  { id: 'newyear',    title: 'Fresh Start',   description: 'Logged an activity on January 1st',       icon: '🎉', category: 'frequency', metAt: (a) => earliestMatching(a, isOnJan1) },
  // Multi-sport & variety
  { id: 'cyclist',    title: 'Cyclist',       description: 'Logged a cycling activity',               icon: '🚴', category: 'frequency', metAt: (a) => earliestMatching(a, isRide)   },
  { id: 'rides10',    title: 'Ten Rides',     description: 'Completed 10 rides',                      icon: '🛞', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRide, 10)  },
  { id: 'rides50',    title: 'Fifty Rides',   description: 'Completed 50 rides',                      icon: '🏁', category: 'frequency', metAt: (a) => nthMatchingAt(a, isRide, 50)  },
  { id: 'triathlete', title: 'Triathlete',    description: 'Logged a run, ride, and swim',            icon: '🏊', category: 'frequency', metAt: (a) => multiTypeMetAt(a, ['Run', 'Ride', 'Swim']) },
  { id: 'sports3',    title: 'Variety Pack',  description: 'Tried 3 different sport types',           icon: '🎨', category: 'frequency', metAt: (a) => sportsMetAt(a, 3) },
  { id: 'sports5',    title: 'Renaissance Athlete', description: 'Tried 5 different sport types',     icon: '🎭', category: 'frequency', metAt: (a) => sportsMetAt(a, 5) },
  // Community
  { id: 'kudos10',    title: 'Crowd Favourite', description: '10 kudos on a single activity',         icon: '👏', category: 'frequency', metAt: (a) => earliestMatching(a, x => (x.kudosCount ?? 0) >= 10) },
  { id: 'kudos100',   title: 'Community Star',  description: '100 kudos received in total',           icon: '💝', category: 'frequency', metAt: (a) => thresholdMetAt(a, x => x.kudosCount ?? 0, 100)      },
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
  bestSingleWalkKm: number;
  walkCount: number;
  bestSingleRideKm: number;
  rideCount: number;
  bestWalkPaceMinKm: number;
  longestActivityMin: number;
  totalHours: number;
  bestWeekStreak: number;
  bestMonthKm: number;
  earlyDays: number;
  nightDays: number;
  mondayDays: number;
  sportCount: number;
  bestKudos: number;
  totalKudos: number;
}

function computeMeasures(activities: Activity[]): ProgressMeasures {
  let bestSingleRunKm = 0;
  let totalKm = 0;
  let runCount = 0;
  let bestPaceMinKm = Infinity;
  let bestSingleElev = 0;
  let totalElev = 0;
  let bestSingleWalkKm = 0;
  let walkCount = 0;
  let bestSingleRideKm = 0;
  let rideCount = 0;
  let bestWalkPaceMinKm = Infinity;
  let longestActivityMin = 0;
  let totalHours = 0;
  let bestKudos = 0;
  let totalKudos = 0;
  const monthKm = new Map<string, number>();
  const earlySet = new Set<string>();
  const nightSet = new Set<string>();
  const mondaySet = new Set<string>();
  const sportSet = new Set<string>();

  for (const a of activities) {
    totalKm += a.distance / 1000;
    totalElev += a.totalElevationGain;
    totalHours += a.movingTime / 3600;
    longestActivityMin = Math.max(longestActivityMin, a.movingTime / 60);
    // Elevation badges are any-sport, so the single-activity best is too.
    bestSingleElev = Math.max(bestSingleElev, a.totalElevationGain);
    bestKudos = Math.max(bestKudos, a.kudosCount ?? 0);
    totalKudos += a.kudosCount ?? 0;
    sportSet.add(a.type);
    const dayKey = activityDayKey(a);
    const month = dayKey.slice(0, 7);
    monthKm.set(month, (monthKm.get(month) ?? 0) + a.distance / 1000);
    const hour = parseInt((a.startDateLocal ?? a.startDate).slice(11, 13), 10);
    if (hour < 7) earlySet.add(dayKey);
    if (hour >= 21) nightSet.add(dayKey);
    if (new Date(`${dayKey}T00:00:00Z`).getUTCDay() === 1) mondaySet.add(dayKey);
    if (a.type === 'Run') {
      runCount++;
      bestSingleRunKm = Math.max(bestSingleRunKm, a.distance / 1000);
      if (a.averageSpeed > 0) {
        bestPaceMinKm = Math.min(bestPaceMinKm, 1000 / a.averageSpeed / 60);
      }
    }
    if (a.type === 'Walk' || a.type === 'Hike') {
      walkCount++;
      bestSingleWalkKm = Math.max(bestSingleWalkKm, a.distance / 1000);
      if (a.distance >= 3000 && a.averageSpeed > 0) {
        bestWalkPaceMinKm = Math.min(bestWalkPaceMinKm, 1000 / a.averageSpeed / 60);
      }
    }
    if (a.type === 'Ride' || (a.type as string) === 'VirtualRide') {
      rideCount++;
      bestSingleRideKm = Math.max(bestSingleRideKm, a.distance / 1000);
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

  // bestWeekStreak via the same unique-week walk weekStreakMetAt uses.
  const weeks = Array.from(new Set(dates.map(weekStartOf))).sort();
  let bestWeekStreak = weeks.length ? 1 : 0;
  let weekStreak = 1;
  for (let i = 1; i < weeks.length; i++) {
    const diff = Math.round((new Date(weeks[i]).getTime() - new Date(weeks[i - 1]).getTime()) / 86400000);
    weekStreak = diff === 7 ? weekStreak + 1 : 1;
    if (weekStreak > bestWeekStreak) bestWeekStreak = weekStreak;
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
    bestSingleWalkKm,
    walkCount,
    bestSingleRideKm,
    rideCount,
    bestWalkPaceMinKm,
    longestActivityMin,
    totalHours,
    bestWeekStreak,
    bestMonthKm: Math.max(0, ...monthKm.values()),
    earlyDays: earlySet.size,
    nightDays: nightSet.size,
    mondayDays: mondaySet.size,
    sportCount: sportSet.size,
    bestKudos,
    totalKudos,
  };
}

const PROGRESS_SPECS: Record<string, ProgressSpec> = {
  km_5:     { target: 5,     unit: 'km',   measure: 'bestSingleRunKm' },
  km_10:    { target: 10,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_15:    { target: 15,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_21:    { target: 21.1,  unit: 'km',   measure: 'bestSingleRunKm' },
  km_25:    { target: 25,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_30:    { target: 30,    unit: 'km',   measure: 'bestSingleRunKm' },
  km_42:    { target: 42.2,  unit: 'km',   measure: 'bestSingleRunKm' },
  km_50:    { target: 50,    unit: 'km',   measure: 'bestSingleRunKm' },
  walk_5k:  { target: 5,     unit: 'km',   measure: 'bestSingleWalkKm' },
  walk_10k: { target: 10,    unit: 'km',   measure: 'bestSingleWalkKm' },
  walk_15k: { target: 15,    unit: 'km',   measure: 'bestSingleWalkKm' },
  walk_21k: { target: 21.1,  unit: 'km',   measure: 'bestSingleWalkKm' },
  ride_25k: { target: 25,    unit: 'km',   measure: 'bestSingleRideKm' },
  ride_50k: { target: 50,    unit: 'km',   measure: 'bestSingleRideKm' },
  ride_100k:{ target: 100,   unit: 'km',   measure: 'bestSingleRideKm' },
  km50:     { target: 50,    unit: 'km',   measure: 'totalKm' },
  km100:    { target: 100,   unit: 'km',   measure: 'totalKm' },
  km250:    { target: 250,   unit: 'km',   measure: 'totalKm' },
  km500:    { target: 500,   unit: 'km',   measure: 'totalKm' },
  km1000:   { target: 1000,  unit: 'km',   measure: 'totalKm' },
  km2000:   { target: 2000,  unit: 'km',   measure: 'totalKm' },
  km3000:   { target: 3000,  unit: 'km',   measure: 'totalKm' },
  km5000:   { target: 5000,  unit: 'km',   measure: 'totalKm' },
  km10000:  { target: 10000, unit: 'km',   measure: 'totalKm' },
  streak3:  { target: 3,     unit: 'days', measure: 'bestStreak' },
  streak5:  { target: 5,     unit: 'days', measure: 'bestStreak' },
  streak7:  { target: 7,     unit: 'days', measure: 'bestStreak' },
  streak14: { target: 14,    unit: 'days', measure: 'bestStreak' },
  streak21: { target: 21,    unit: 'days', measure: 'bestStreak' },
  streak30: { target: 30,    unit: 'days', measure: 'bestStreak' },
  streak60: { target: 60,    unit: 'days', measure: 'bestStreak' },
  streak100:{ target: 100,   unit: 'days', measure: 'bestStreak' },
  streak180:{ target: 180,   unit: 'days', measure: 'bestStreak' },
  streak365:{ target: 365,   unit: 'days', measure: 'bestStreak' },
  runs5:    { target: 5,     unit: 'runs', measure: 'runCount' },
  runs10:   { target: 10,    unit: 'runs', measure: 'runCount' },
  runs25:   { target: 25,    unit: 'runs', measure: 'runCount' },
  runs50:   { target: 50,    unit: 'runs', measure: 'runCount' },
  runs100:  { target: 100,   unit: 'runs', measure: 'runCount' },
  runs200:  { target: 200,   unit: 'runs', measure: 'runCount' },
  runs500:  { target: 500,   unit: 'runs', measure: 'runCount' },
  walks10:  { target: 10,    unit: 'walks', measure: 'walkCount' },
  walks25:  { target: 25,    unit: 'walks', measure: 'walkCount' },
  walks50:  { target: 50,    unit: 'walks', measure: 'walkCount' },
  walks100: { target: 100,   unit: 'walks', measure: 'walkCount' },
  walks250: { target: 250,   unit: 'walks', measure: 'walkCount' },
  rides10:  { target: 10,    unit: 'rides', measure: 'rideCount' },
  rides50:  { target: 50,    unit: 'rides', measure: 'rideCount' },
  acts25:   { target: 25,    unit: 'activities', measure: 'activityCount' },
  acts50:   { target: 50,    unit: 'activities', measure: 'activityCount' },
  acts100:  { target: 100,   unit: 'activities', measure: 'activityCount' },
  acts250:  { target: 250,   unit: 'activities', measure: 'activityCount' },
  acts500:  { target: 500,   unit: 'activities', measure: 'activityCount' },
  hour_1:   { target: 60,    unit: 'min',  measure: 'longestActivityMin' },
  hour_2:   { target: 120,   unit: 'min',  measure: 'longestActivityMin' },
  hour_3:   { target: 180,   unit: 'min',  measure: 'longestActivityMin' },
  time10h:  { target: 10,    unit: 'h',    measure: 'totalHours' },
  time25h:  { target: 25,    unit: 'h',    measure: 'totalHours' },
  time50h:  { target: 50,    unit: 'h',    measure: 'totalHours' },
  time100h: { target: 100,   unit: 'h',    measure: 'totalHours' },
  time250h: { target: 250,   unit: 'h',    measure: 'totalHours' },
  weeks4:   { target: 4,     unit: 'weeks', measure: 'bestWeekStreak' },
  weeks12:  { target: 12,    unit: 'weeks', measure: 'bestWeekStreak' },
  weeks26:  { target: 26,    unit: 'weeks', measure: 'bestWeekStreak' },
  weeks52:  { target: 52,    unit: 'weeks', measure: 'bestWeekStreak' },
  month50:  { target: 50,    unit: 'km',   measure: 'bestMonthKm' },
  month100: { target: 100,   unit: 'km',   measure: 'bestMonthKm' },
  month200: { target: 200,   unit: 'km',   measure: 'bestMonthKm' },
  sub8:     { target: 8,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub7:     { target: 7,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub6:     { target: 6,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub5:     { target: 5,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub4_5:   { target: 4.5,   unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  sub4:     { target: 4,     unit: 'min/km', measure: 'bestPaceMinKm', lowerIsBetter: true },
  walk_pace10: { target: 10, unit: 'min/km', measure: 'bestWalkPaceMinKm', lowerIsBetter: true },
  elev100:  { target: 100,   unit: 'm',    measure: 'bestSingleElev' },
  elev200:  { target: 200,   unit: 'm',    measure: 'bestSingleElev' },
  elev500:  { target: 500,   unit: 'm',    measure: 'bestSingleElev' },
  elev1000: { target: 1000,  unit: 'm',    measure: 'bestSingleElev' },
  elev2000: { target: 2000,  unit: 'm',    measure: 'bestSingleElev' },
  elev3000: { target: 3000,  unit: 'm',    measure: 'bestSingleElev' },
  total_elev2500:  { target: 2500,  unit: 'm', measure: 'totalElev' },
  total_elev5000:  { target: 5000,  unit: 'm', measure: 'totalElev' },
  total_elev10000: { target: 8849,  unit: 'm', measure: 'totalElev' },
  total_elev17698: { target: 17698, unit: 'm', measure: 'totalElev' },
  early10:  { target: 10,    unit: 'days', measure: 'earlyDays' },
  night10:  { target: 10,    unit: 'days', measure: 'nightDays' },
  monday10: { target: 10,    unit: 'days', measure: 'mondayDays' },
  sports3:  { target: 3,     unit: 'sports', measure: 'sportCount' },
  sports5:  { target: 5,     unit: 'sports', measure: 'sportCount' },
  kudos10:  { target: 10,    unit: 'kudos', measure: 'bestKudos' },
  kudos100: { target: 100,   unit: 'kudos', measure: 'totalKudos' },
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
