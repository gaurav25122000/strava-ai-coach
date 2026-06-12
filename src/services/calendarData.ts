import type { Activity, DailyPrescription, Goal } from '../store/useStore';
import { activityDayKey, localDateStr, mondayOf } from '../utils/dates';
import { prescriptionForDate } from './planSchedule';

// Pure month-calendar derivations for the Training Calendar screen: the
// Monday-start day grid, per-day plan-vs-actual status, and month adherence.

export type DayStatus = 'done' | 'missed' | 'planned' | 'rest' | 'extra' | 'free';

export interface CalendarDayInfo {
  planned: DailyPrescription | null;
  acts: Activity[];
  status: DayStatus;
}

export interface MonthCell {
  dayKey: string;
  inMonth: boolean;
}

// Anything shorter is a watch fumble, not a workout — it can't complete a day.
const MIN_WORKOUT_SECONDS = 10 * 60;

/** Local-midnight Date for a YYYY-MM-DD key (never UTC-parsed). */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Monday-start weeks covering the month: every row is 7 cells, the first row
 * starts on the Monday of the week containing the 1st, and rows continue
 * until the month's last day is included.
 */
export function monthMatrix(year: number, monthIdx0: number): MonthCell[][] {
  const cursor = mondayOf(new Date(year, monthIdx0, 1));
  const weeks: MonthCell[][] = [];
  do {
    const week: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        dayKey: localDateStr(cursor),
        inMonth: cursor.getFullYear() === year && cursor.getMonth() === monthIdx0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getFullYear() === year && cursor.getMonth() === monthIdx0);
  return weeks;
}

/** Group activities by athlete-local day key. */
export function groupActivitiesByDay(activities: Activity[]): Map<string, Activity[]> {
  const byDay = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = activityDayKey(a);
    const list = byDay.get(key);
    if (list) list.push(a);
    else byDay.set(key, [a]);
  }
  return byDay;
}

/**
 * Plan-vs-actual status for one day. A planned (non-REST) day is 'done' when
 * any non-trivial activity (≥ 10 min moving) was logged — the calendar is a
 * coarse did-you-train view; strict prescription matching stays in
 * goalProgress, whose matched/partial/mismatch verdicts are finer than a
 * month grid can show.
 */
export function dayInfo(
  goal: Goal | null | undefined,
  activitiesByDay: Map<string, Activity[]>,
  dayKey: string,
  todayKey: string,
): CalendarDayInfo {
  const acts = activitiesByDay.get(dayKey) ?? [];
  const planned = goal ? prescriptionForDate(goal, dateFromKey(dayKey)) : null;

  if (planned && planned.kind !== 'REST') {
    if (acts.some((a) => a.movingTime >= MIN_WORKOUT_SECONDS)) {
      return { planned, acts, status: 'done' };
    }
    return { planned, acts, status: dayKey < todayKey ? 'missed' : 'planned' };
  }
  if (planned) return { planned, acts, status: 'rest' };
  if (acts.length > 0) return { planned: null, acts, status: 'extra' };
  return { planned: null, acts, status: 'free' };
}

/**
 * Plan adherence over the elapsed part of a month. Days after `todayKey`
 * never count; today itself counts only once it's done (the day is still
 * open, so an unrun session isn't a miss yet). pct is null when nothing was
 * planned in the window.
 */
export function monthAdherence(
  goal: Goal | null | undefined,
  activitiesByDay: Map<string, Activity[]>,
  year: number,
  monthIdx0: number,
  todayKey: string,
): { planned: number; completed: number; pct: number | null } {
  let planned = 0;
  let completed = 0;
  if (goal) {
    const lastDay = new Date(year, monthIdx0 + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const dayKey = localDateStr(new Date(year, monthIdx0, day));
      if (dayKey > todayKey) break;
      const { status } = dayInfo(goal, activitiesByDay, dayKey, todayKey);
      if (status === 'done') {
        planned++;
        completed++;
      } else if (status === 'missed') {
        planned++;
      }
    }
  }
  return { planned, completed, pct: planned > 0 ? Math.round((completed / planned) * 100) : null };
}

/** Last day covered by the goal's plan (max phase weekEnd / week start + 6). */
export function lastPlanDayKey(goal: Goal | null | undefined): string | null {
  let last: string | null = null;
  for (const phase of goal?.phases ?? []) {
    if (phase.weekEnd && (!last || phase.weekEnd > last)) last = phase.weekEnd;
    for (const week of phase.weeks ?? []) {
      const end = new Date(dateFromKey(week.weekStart).getTime() + 6 * 86400000);
      const key = localDateStr(end);
      if (!last || key > last) last = key;
    }
  }
  return last;
}
