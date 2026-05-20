import { NotificationService } from './notifications';
import { useStore } from '../store/useStore';

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Reconcile all scheduled notifications with the current store state. Safe to
// call on app launch, foreground, and after activity sync.
export async function syncAllNotifications() {
  const { activities, userStats, goals } = useStore.getState();

  const today = localDateStr(new Date());
  const hasActivityToday = activities.some(
    (a) => a.startDate.split('T')[0] === today,
  );

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekActs = activities.filter((a) => new Date(a.startDate) >= weekStart);
  const weekKm = weekActs.reduce((s, a) => s + a.distance / 1000, 0);
  const weekDays = new Set(weekActs.map((a) => a.startDate.split('T')[0])).size;

  await NotificationService.scheduleWeeklyRecap({
    weekKm,
    weekDays,
    streak: userStats.currentStreak,
  });

  await NotificationService.scheduleStreakReminder(
    userStats.currentStreak,
    hasActivityToday,
  );

  for (const goal of goals) {
    if (!goal.isSimple && goal.daysRemaining > 0 && goal.daysRemaining <= 7) {
      await NotificationService.scheduleGoalDeadline(goal.title, goal.daysRemaining);
    }
  }
}
