import { NotificationService } from './notifications';
import { useStore } from '../store/useStore';
import { activityDayKey, localDateStr, mondayOf } from '../utils/dates';

// Reconcile all scheduled notifications with the current store state. Safe to
// call on app launch, foreground, and after activity sync.
export async function syncAllNotifications() {
  const { activities, userStats, goals } = useStore.getState();

  const today = localDateStr(new Date());
  const hasActivityToday = activities.some((a) => activityDayKey(a) === today);

  // mondayOf handles the Sunday edge — the old inline math computed *next*
  // Monday on Sundays, so Sunday-evening recaps reported an empty week.
  const weekStart = mondayOf(new Date());
  const weekStartKey = localDateStr(weekStart);
  const weekActs = activities.filter((a) => activityDayKey(a) >= weekStartKey);
  const weekKm = weekActs.reduce((s, a) => s + a.distance / 1000, 0);
  const weekDays = new Set(weekActs.map((a) => activityDayKey(a))).size;

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

  // Re-sync per-day workout reminders from the active phase of every AI goal.
  // Identifiers are namespaced (workout-<goalId>-<date>) so the call is safe
  // to repeat without producing duplicates.
  await NotificationService.syncWorkoutReminders(goals);
}
