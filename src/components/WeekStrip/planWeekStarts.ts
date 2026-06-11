import { addDays, parseISO } from 'date-fns';
import { Goal } from '../../store/useStore';
import { localDateStr, mondayOf, weekKey } from '../../utils/dates';

/**
 * Every Monday the plan covers, sorted ascending. Sourced from phases[].weeks
 * (per-week progression); windowed phases without weeks fall back to
 * enumerating Mondays inside [weekStart, weekEnd]; fully legacy template plans
 * cover only the current week.
 */
export function planWeekStarts(goal: Goal): string[] {
  const phases = goal.phases || [];
  const out = new Set<string>();
  for (const p of phases) {
    if (p.weeks?.length) {
      for (const w of p.weeks) out.add(w.weekStart);
    } else if (p.weekStart && p.weekEnd) {
      let cursor = mondayOf(parseISO(p.weekStart));
      const end = parseISO(p.weekEnd);
      for (let i = 0; i < 60 && cursor <= end; i++) {
        out.add(localDateStr(cursor));
        cursor = addDays(cursor, 7);
      }
    }
  }
  if (!out.size && phases.some((p) => p.schedule?.length)) out.add(weekKey(new Date()));
  return [...out].sort();
}
