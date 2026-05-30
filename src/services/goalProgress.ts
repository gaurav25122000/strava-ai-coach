import { Activity, CheckIn, DailyPrescription, Goal, Phase, WorkoutKind } from '../store/useStore';
import { endOfWeek, parseISO, startOfWeek } from 'date-fns';
import { matchActivityToPrescription, PrescriptionMatch, VERDICT_RANK } from './matchActivity';

export type { MatchVerdict, PrescriptionMatch } from './matchActivity';
export { matchActivityToPrescription } from './matchActivity';

// Mon=0..Sun=6 (date-fns getDay returns Sun=0..Sat=6).
function mondayIndex(d: Date): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (((d.getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

function localDate(iso: string): string {
  return iso.split('T')[0];
}

// Find which phase of the plan covers a given date.
// Falls back to the first phase if weekStart/weekEnd aren't set on any phase.
export function activePhaseFor(goal: Goal, date: Date): Phase | undefined {
  const phases = goal.phases || [];
  if (!phases.length) return undefined;
  const t = date.getTime();
  const inWindow = phases.find(p => {
    if (!p.weekStart || !p.weekEnd) return false;
    return parseISO(p.weekStart).getTime() <= t && parseISO(p.weekEnd).getTime() >= t;
  });
  return inWindow || phases[0];
}

// Look up the prescription for a given date inside the active phase.
export function prescriptionFor(goal: Goal, date: Date): DailyPrescription | undefined {
  const phase = activePhaseFor(goal, date);
  if (!phase?.schedule?.length) return undefined;
  const day = mondayIndex(date);
  return phase.schedule.find(p => p.dayOfWeek === day);
}

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

  // Generic heuristics
  if (activity.type === 'Ride')     return 'CROSS';
  if (activity.type === 'Walk')     return 'RECOVERY';
  if (activity.type === 'Workout')  return 'STRENGTH';
  // Run-specific
  if (km >= 15)                     return 'LONG';
  if (minPerKm > 0 && minPerKm <= 4.5 && km <= 8)  return 'INTERVALS';
  if (minPerKm > 0 && minPerKm <= 5.0 && km <= 12) return 'TEMPO';
  if (avgHR > 0 && avgHR >= 160)    return 'TEMPO';
  if (km <= 5)                      return 'RECOVERY';
  return 'EASY';
}

// Total km logged during the current calendar week (Mon-Sun, local time).
export function currentWeekKm(activities: Activity[], today = new Date()): number {
  const start = startOfWeek(today, { weekStartsOn: 1 }).getTime();
  const end = endOfWeek(today, { weekStartsOn: 1 }).getTime();
  let km = 0;
  for (const a of activities) {
    const t = parseISO(a.startDate).getTime();
    if (t < start || t > end) continue;
    km += a.distance / 1000;
  }
  return Number(km.toFixed(1));
}

// Longest single activity (km) inside the current calendar week.
export function currentWeekLongRunKm(activities: Activity[], today = new Date()): number {
  const start = startOfWeek(today, { weekStartsOn: 1 }).getTime();
  const end = endOfWeek(today, { weekStartsOn: 1 }).getTime();
  let longest = 0;
  for (const a of activities) {
    const t = parseISO(a.startDate).getTime();
    if (t < start || t > end) continue;
    if (a.type !== 'Run') continue;
    const km = a.distance / 1000;
    if (km > longest) longest = km;
  }
  return Number(longest.toFixed(1));
}

// Build the Strava-derived check-ins for a goal. Manual check-ins are preserved
// — we only replace check-ins whose source === 'STRAVA'. For each date we keep
// the activity that BEST satisfies that day's prescription (best verdict, then
// longest), and only mark the day done when it actually matched.
function buildStravaCheckIns(goal: Goal, activities: Activity[]): CheckIn[] {
  if (!goal.phases?.length) return [];

  // Group activities by local date.
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const date = localDate(a.startDate);
    const list = byDate.get(date);
    if (list) list.push(a);
    else byDate.set(date, [a]);
  }

  const out: CheckIn[] = [];
  for (const [date, acts] of byDate) {
    const d = parseISO(acts[0].startDate);
    const presc = prescriptionFor(goal, d);

    // Pick the best activity for the day: best verdict first, then longest.
    let best: { a: Activity; m: PrescriptionMatch } | null = null;
    for (const a of acts) {
      const m: PrescriptionMatch = presc
        ? matchActivityToPrescription(a, presc)
        : { verdict: 'matched', completed: true, reason: 'Logged session' };
      const better =
        !best ||
        VERDICT_RANK[m.verdict] > VERDICT_RANK[best.m.verdict] ||
        (VERDICT_RANK[m.verdict] === VERDICT_RANK[best.m.verdict] && a.distance > best.a.distance);
      if (better) best = { a, m };
    }
    if (!best) continue;

    // A clean/partial match relates to the prescribed kind; a mismatch is
    // recorded as whatever the athlete actually did.
    const kind: WorkoutKind =
      presc && best.m.verdict !== 'mismatch' ? presc.kind : classifyActivity(best.a, presc);

    out.push({
      date,
      dayOfWeek: mondayIndex(d),
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

// Compute an updated Goal with derived progress fields. Pure — caller persists.
export function computeProgress(goal: Goal, activities: Activity[], today = new Date()): Goal {
  if (goal.isSimple) return goal; // simple goals already track their own progress
  if (!goal.phases?.length) return goal;

  const phase = activePhaseFor(goal, today);
  if (!phase) return goal;

  // Replace Strava-source check-ins, keep manual ones intact.
  const manual = (goal.checkIns || []).filter(c => c.source === 'MANUAL');
  const strava = buildStravaCheckIns(goal, activities);
  // If a manual check-in exists for a date, drop the Strava one for that date.
  const manualDates = new Set(manual.map(c => c.date));
  const merged = [...manual, ...strava.filter(c => !manualDates.has(c.date))];

  // Auto-skip past prescribed days that the athlete never marked or logged.
  // This keeps `progress` honest: if you ghosted a tempo run last Tuesday,
  // it shouldn't sit in limbo forever. Only fill backwards from yesterday —
  // today's session is still open for completion.
  if (phase.weekStart && phase.schedule?.length) {
    const seen = new Set(merged.map(c => c.date));
    const todayStr = localDate(today.toISOString());
    let cursor = parseISO(phase.weekStart);
    const cursorEnd = phase.weekEnd
      ? Math.min(parseISO(phase.weekEnd).getTime(), today.getTime())
      : today.getTime();
    while (cursor.getTime() < cursorEnd) {
      const dStr = localDate(cursor.toISOString());
      if (dStr < todayStr && !seen.has(dStr)) {
        const presc = phase.schedule.find(p => p.dayOfWeek === mondayIndex(cursor));
        if (presc && presc.kind !== 'REST') {
          merged.push({
            date: dStr,
            dayOfWeek: mondayIndex(cursor),
            source: 'MANUAL',
            workoutKind: presc.kind,
            completed: false,
            notes: 'Auto-skipped (date passed without check-in)',
          });
          seen.add(dStr);
        }
      }
      cursor = new Date(cursor.getTime() + 86400000);
    }
  }

  const weeklyVolume = {
    current: currentWeekKm(activities, today),
    target: phase.weeklyVolumeTarget || goal.weeklyVolume.target,
  };
  const longRun = {
    current: currentWeekLongRunKm(activities, today),
    target: phase.longRunTarget || goal.longRun.target,
  };

  // Plan-level progress = days completed (any kind) ÷ days expected since plan started.
  let progress = goal.progress;
  if (phase.weekStart && phase.weekEnd) {
    const startMs = parseISO(phase.weekStart).getTime();
    const endMs = parseISO(phase.weekEnd).getTime();
    const nowMs = today.getTime();
    const elapsed = Math.min(nowMs, endMs) - startMs;
    const total = endMs - startMs;
    const phaseScheduleDays = (phase.schedule || []).filter(p => p.kind !== 'REST').length || 1;
    const elapsedFraction = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;
    const expectedSoFar = Math.max(1, Math.round(phaseScheduleDays * elapsedFraction));
    const doneSoFar = merged.filter(c => {
      const t = parseISO(c.date).getTime();
      return t >= startMs && t <= Math.min(nowMs, endMs) && c.completed;
    }).length;
    progress = Math.max(0, Math.min(100, Math.round((doneSoFar / expectedSoFar) * 100)));
  }

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
