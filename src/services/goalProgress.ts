import { Activity, CheckIn, DailyPrescription, Goal, Phase, WorkoutKind } from '../store/useStore';
import { activityDayKey, localDateStr, mondayIndex, mondayOf } from '../utils/dates';
import { phaseForDate, scheduleForDate } from './planSchedule';
import { matchActivityToPrescription, PrescriptionMatch, VERDICT_RANK } from './matchActivity';

export type { MatchVerdict, PrescriptionMatch } from './matchActivity';
export { matchActivityToPrescription } from './matchActivity';

const RUNNISH = new Set(['Run', 'TrailRun', 'VirtualRun']);

// ── Plan-calendar lookups ────────────────────────────────────────────────────
// Resolution lives in planSchedule. The ONE legacy concession: plans created
// before phases carried date windows get phases[0]'s template, but only for
// the CURRENT week — historical dates outside any window never match (the old
// phases[0] fallback matched months-old activities against week 1 and
// inflated progress with pre-plan check-ins).

function isLegacyPlan(goal: Goal): boolean {
  return !!goal.phases?.length && !goal.phases.some((p) => p.weekStart && p.weekEnd);
}

function scheduleFor(goal: Goal, date: Date, today = new Date()): DailyPrescription[] | null {
  const windowed = scheduleForDate(goal.phases, date);
  if (windowed) return windowed;
  if (isLegacyPlan(goal)) {
    const thisMonday = localDateStr(mondayOf(today));
    if (localDateStr(mondayOf(date)) === thisMonday) {
      return goal.phases![0].schedule ?? null;
    }
  }
  return null;
}

/** Phase covering `date` (no fallback — null outside the plan). */
export function activePhaseFor(goal: Goal, date: Date): Phase | undefined {
  const phase = phaseForDate(goal.phases, date);
  if (phase) return phase;
  // Legacy plans: current phase is phase[0] for the ongoing week only.
  if (isLegacyPlan(goal)) return goal.phases![0];
  return undefined;
}

/** Prescription for a date, or undefined when the date is outside the plan. */
export function prescriptionFor(goal: Goal, date: Date, today = new Date()): DailyPrescription | undefined {
  const schedule = scheduleFor(goal, date, today);
  if (!schedule) return undefined;
  return schedule.find((p) => p.dayOfWeek === mondayIndex(date));
}

// ── Activity classification ──────────────────────────────────────────────────

// Heuristic classifier: given an activity (Strava-ingested) and the day's
// prescription (if any), decide what WorkoutKind it most likely represents.
// We bias toward the prescription's kind if one exists for that day.
export function classifyActivity(activity: Activity, prescription?: DailyPrescription): WorkoutKind {
  const km = activity.distance / 1000;
  const minPerKm = activity.averageSpeed > 0 ? 1000 / activity.averageSpeed / 60 : 0;
  const avgHR = activity.averageHeartRate || 0;

  if (prescription) {
    // If the athlete did roughly what was prescribed, trust the prescription.
    if (prescription.kind === 'REST') return 'EASY'; // logged on a rest day → treat as bonus easy session
    const expectedKm = prescription.distanceKm || 0;
    if (expectedKm > 0 && km >= expectedKm * 0.6 && km <= expectedKm * 1.6) {
      return prescription.kind;
    }
  }

  // Generic heuristics (type is Strava sport_type)
  if (activity.type === 'Ride' || activity.type === 'VirtualRide' || activity.type === 'GravelRide') return 'CROSS';
  if (activity.type === 'Walk' || activity.type === 'Hike') return 'RECOVERY';
  if (activity.type === 'Workout' || activity.type === 'WeightTraining') return 'STRENGTH';
  // Run-specific
  if (km >= 15)                     return 'LONG';
  if (minPerKm > 0 && minPerKm <= 4.5 && km <= 8)  return 'INTERVALS';
  if (minPerKm > 0 && minPerKm <= 5.0 && km <= 12) return 'TEMPO';
  if (avgHR > 0 && avgHR >= 160)    return 'TEMPO';
  if (km <= 5)                      return 'RECOVERY';
  return 'EASY';
}

// ── Week aggregates ──────────────────────────────────────────────────────────

/**
 * Run km logged during the current calendar week (Mon-Sun, athlete-local
 * days). Runs only — a goal's weeklyVolumeTarget is running volume; rides
 * used to inflate it.
 */
export function currentWeekKm(activities: Activity[], today = new Date()): number {
  const weekStart = localDateStr(mondayOf(today));
  let km = 0;
  for (const a of activities) {
    if (!RUNNISH.has(a.type)) continue;
    const day = activityDayKey(a);
    if (day >= weekStart && day <= localDateStr(new Date(mondayOf(today).getTime() + 6 * 86400000))) {
      km += a.distance / 1000;
    }
  }
  return Number(km.toFixed(1));
}

/** Longest single run (km) inside the current calendar week. */
export function currentWeekLongRunKm(activities: Activity[], today = new Date()): number {
  const weekStart = localDateStr(mondayOf(today));
  const weekEnd = localDateStr(new Date(mondayOf(today).getTime() + 6 * 86400000));
  let longest = 0;
  for (const a of activities) {
    if (!RUNNISH.has(a.type)) continue;
    const day = activityDayKey(a);
    if (day < weekStart || day > weekEnd) continue;
    const km = a.distance / 1000;
    if (km > longest) longest = km;
  }
  return Number(longest.toFixed(1));
}

// ── Strava check-in derivation ───────────────────────────────────────────────

// Build the Strava-derived check-ins for a goal. Activities on days outside
// the plan window produce NO check-in at all. For each in-plan date we keep
// the activity that BEST satisfies the prescription (best verdict, then
// longest), and only mark the day done when it actually matched.
function buildStravaCheckIns(goal: Goal, activities: Activity[], today = new Date()): CheckIn[] {
  if (!goal.phases?.length) return [];

  // Group activities by athlete-local date.
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const date = activityDayKey(a);
    const list = byDate.get(date);
    if (list) list.push(a);
    else byDate.set(date, [a]);
  }

  const out: CheckIn[] = [];
  for (const [date, acts] of byDate) {
    const d = new Date(date);
    const presc = prescriptionFor(goal, d, today);
    if (!presc) continue; // outside the plan (or unscheduled day) → not a check-in

    // Pick the best activity for the day: best verdict first, then longest.
    let best: { a: Activity; m: PrescriptionMatch } | null = null;
    for (const a of acts) {
      const m = matchActivityToPrescription(a, presc);
      const better =
        !best ||
        VERDICT_RANK[m.verdict] > VERDICT_RANK[best.m.verdict] ||
        (VERDICT_RANK[m.verdict] === VERDICT_RANK[best.m.verdict] && a.distance > best.a.distance);
      if (better) best = { a, m };
    }
    if (!best) continue;

    // A clean/partial match relates to the prescribed kind; a mismatch (or a
    // bonus session on a rest day) is recorded as what the athlete did.
    const kind: WorkoutKind =
      presc.kind !== 'REST' && best.m.verdict !== 'mismatch' ? presc.kind : classifyActivity(best.a, presc);

    out.push({
      date,
      dayOfWeek: mondayIndex(d) as CheckIn['dayOfWeek'],
      source: 'STRAVA',
      workoutKind: kind,
      completed: best.m.completed,
      activityId: best.a.id,
      matchVerdict: best.m.verdict,
      notes: best.m.reason,
    });
  }
  return out;
}

// ── Expected training days ───────────────────────────────────────────────────

/**
 * Every prescribed (non-REST) day from the plan's first week through
 * `through` (inclusive). This is the denominator of plan progress — and the
 * filter for its numerator, so rest-day bonus sessions never inflate it.
 */
export function expectedTrainingDays(goal: Goal, through: Date, today = new Date()): string[] {
  const phases = goal.phases || [];
  const first = phases.find((p) => p.weekStart);
  if (!first?.weekStart) {
    // Legacy plan: expected days exist only within the current week.
    if (!isLegacyPlan(goal)) return [];
    const monday = mondayOf(today);
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getTime() + i * 86400000);
      if (d > through) break;
      const presc = prescriptionFor(goal, d, today);
      if (presc && presc.kind !== 'REST') out.push(localDateStr(d));
    }
    return out;
  }

  const out: string[] = [];
  const throughKey = localDateStr(through);
  let cursor = new Date(first.weekStart);
  // Hard cap: two years of dates, in case of malformed plans.
  for (let i = 0; i < 730; i++) {
    const key = localDateStr(cursor);
    if (key > throughKey) break;
    const schedule = scheduleForDate(phases, cursor);
    if (schedule) {
      const presc = schedule.find((p) => p.dayOfWeek === mondayIndex(cursor));
      if (presc && presc.kind !== 'REST') out.push(key);
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

// ── Progress computation ─────────────────────────────────────────────────────

// Compute an updated Goal with derived progress fields. Pure — caller persists.
//
// Progress spec (2026-06 revision):
//   numerator   = completed check-ins on EXPECTED days (prescribed, non-REST)
//                 from plan start through yesterday
//   denominator = count of those expected days
// Rest-day bonus sessions show as green days in the UI but don't move the
// percentage; pre-plan activities are never matched at all. The old formula
// divided whole-phase completions by one week's session count and pinned at
// 100% within days.
export function computeProgress(goal: Goal, activities: Activity[], today = new Date()): Goal {
  if (goal.isSimple) return goal; // simple goals already track their own progress
  if (!goal.phases?.length) return goal;

  const phase = activePhaseFor(goal, today);

  // Replace Strava-source check-ins; real manual check-ins always win their
  // date. Auto-skip placeholders are replaceable by anything.
  const manual = (goal.checkIns || []).filter((c) => c.source === 'MANUAL' && !c.auto);
  const strava = buildStravaCheckIns(goal, activities, today);
  const manualDates = new Set(manual.map((c) => c.date));
  const merged = [...manual, ...strava.filter((c) => !manualDates.has(c.date))];

  // Auto-skip: expected days that passed with no log of any kind. Today stays
  // open. Marked auto:true so a late sync can still claim the date.
  const yesterday = new Date(today.getTime() - 86400000);
  const expected = expectedTrainingDays(goal, yesterday, today);
  const seen = new Set(merged.map((c) => c.date));
  for (const date of expected) {
    if (seen.has(date)) continue;
    const d = new Date(date);
    const presc = prescriptionFor(goal, d, today);
    if (!presc) continue;
    merged.push({
      date,
      dayOfWeek: mondayIndex(d) as CheckIn['dayOfWeek'],
      source: 'MANUAL',
      auto: true,
      workoutKind: presc.kind,
      completed: false,
      notes: 'Auto-skipped (date passed without check-in)',
    });
    seen.add(date);
  }

  const weeklyVolume = {
    current: currentWeekKm(activities, today),
    target: phase?.weeklyVolumeTarget || goal.weeklyVolume.target,
  };
  const longRun = {
    current: currentWeekLongRunKm(activities, today),
    target: phase?.longRunTarget || goal.longRun.target,
  };

  let progress = goal.progress;
  if (expected.length > 0) {
    const expectedSet = new Set(expected);
    const done = merged.filter((c) => c.completed && expectedSet.has(c.date)).length;
    progress = Math.max(0, Math.min(100, Math.round((done / expected.length) * 100)));
  } else if (expected.length === 0 && localDateStr(today) <= (goal.phases[0]?.weekStart ?? '')) {
    progress = 0; // plan hasn't started yet
  }

  merged.sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...goal,
    checkIns: merged,
    weeklyVolume,
    longRun,
    progress,
    progressUpdatedAt: new Date().toISOString(),
  };
}

// Convenience: run computeProgress over every AI goal in a list.
export function computeAllProgress(goals: Goal[], activities: Activity[], today = new Date()): Goal[] {
  return goals.map(g => (g.isSimple ? g : computeProgress(g, activities, today)));
}
