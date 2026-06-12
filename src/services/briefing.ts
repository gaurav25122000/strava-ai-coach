import { useStore } from '../store/useStore';
import { localDateStr } from '../utils/dates';
import { prescriptionForDate, prescriptionSummary } from './planSchedule';
import { bestWindow } from './weather';
import { NotificationService } from './notifications';

/**
 * (Re)arm the one-shot morning-briefing notification for the next 07:00:
 * that day's plan prescription + the forecast for it. Called on every app
 * open so the content stays fresh; cancels the pending one when the toggle
 * is off.
 */
export async function armMorningBriefing(): Promise<void> {
  const { morningBriefingEnabled, goals, weatherCache } = useStore.getState();
  if (!morningBriefingEnabled) {
    await NotificationService.cancelMorningBriefing();
    return;
  }

  // Same before/after-7AM rule as scheduleMorningBriefing: the notification
  // fires today at 07:00 if that hasn't passed, else tomorrow — build the
  // content for that firing day.
  const firingDay = new Date();
  firingDay.setHours(7, 0, 0, 0);
  if (Date.now() >= firingDay.getTime()) firingDay.setDate(firingDay.getDate() + 1);
  const parts: string[] = [];

  // Same goal pick as TodayHero / syncWorkoutReminders: first structured AI goal.
  const goal = goals.find((g) => !g.isSimple && (g.phases?.length || 0) > 0);
  const presc = goal ? prescriptionForDate(goal, firingDay) : null;
  if (presc) {
    parts.push(presc.kind === 'REST' ? 'Rest day — recover well' : prescriptionSummary(presc));
  }

  const dayKey = localDateStr(firingDay);
  const day = weatherCache?.daily.find((d) => d.date === dayKey);
  if (weatherCache && day) {
    let line = `${Math.round(day.tMinC)}–${Math.round(day.tMaxC)}°C, ${Math.round(day.precipProb)}% rain`;
    const win = bestWindow(weatherCache, dayKey);
    if (win) line += `, best window ${win.label}`;
    parts.push(line);
  }

  const body = parts.length ? parts.join(' · ') : 'Check your plan and get moving.';
  await NotificationService.scheduleMorningBriefing(body);
}
